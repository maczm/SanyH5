// ============== 配置 ==============
var CONFIG = {
  MAX_IMAGE_WIDTH: 3000,
  MAX_IMAGE_HEIGHT: 3000,
  JPEG_QUALITY: 0.8,
  MAX_PHOTOS: 20,
  API_TIMEOUT: 10000, // API 超时兜底（毫秒）
};

/*
 * ============== 生产对接说明 ==============
 *
 * Mock 机制：
 *   本地开发：同目录 mock.js 提供全部 Mock API 兜底（生产不部署该文件，Portal 只取
 *             index.html / index.js / index.css 三个文件）
 *   Portal 生产：iframe 加载前向 window 注入同名真实函数，
 *   JS 通过 if (typeof window.xxx != ‘function’) 检测自动使用真实函数
 *
 * 页面结构：全部骨架在 index.html（含弹窗预埋与 ＜template＞ 循环模板），
 *          JS 只负责克隆模板、赋值（text/val/attr）与显隐切换，不拼接 HTML。
 *
 * 各 API 说明：
 *   API 1 (装箱单号搜索) : 按装箱单号搜索待装箱对象
 *   API 2 (物料编码搜索) : 按装箱单号 + 物料编码搜索
 *   API 3 (图片上传)     : 上传单张照片（前端压缩为 JPEG Base64，生产需上传 CDN/OSS 返回 URL）
 *   API 4 (装箱提交)     : 提交装箱记录（含照片 URL 数组）
 *   window.Operator      : 当前操作员姓名（Portal 注入）
 *
 * Portal 必须注入以下 5 个 window 属性：
 *   window.searchByPackingList     — API 1：装箱单号搜索
 *   window.searchByMaterialCode    — API 2：物料编码搜索
 *   window.uploadPackingImage      — API 3：图片上传
 *   window.submitPacking           — API 4：装箱提交
 *   window.Operator                — 当前操作员姓名
 */

// ============== 应用命名空间 ==============
// 所有页面逻辑挂在 Packing 下，避免全局函数互相覆盖（Portal 同 iframe 切页场景）
var Packing = {
  // ============== 状态管理 ==============
  state: {
    step: 0,            // 0=初始, 1=装箱单号已搜, 2=物料已搜
    packingListNo: "",
    materialCode: "",
    selectedItem: null,
    results: [],
    photos: [],         // [{ url: ... }]
    submitting: false,
    sessionId: 0,       // 会话标识：切换装箱对象/重置时递增，用于丢弃过期异步回调（防串单）
  },

  _toastTimer: null,
  _loadingCount: 0,
  _initRetryCount: 0,

  // ============== 模板克隆 ==============
  cloneTemplate: function (id) {
    var fragment = document.getElementById(id).content.cloneNode(true);
    return $(fragment.firstElementChild); // 模板必须单根结构
  },

  // ============== API 调用包装（超时兜底） ==============
  apiCall: function (fn, args, callback, timeout) {
    var done = false;
    var timer = setTimeout(function () {
      if (done) return;
      done = true;
      callback({ code: -1, msg: "请求超时，请重试" });
    }, timeout || CONFIG.API_TIMEOUT);
    args = args || [];
    fn.apply(null, args.concat([function (response) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      callback(response);
    }]));
  },

  // ============== 模糊匹配工具（本地筛选用，生产 API 内部自行匹配） ==============
  fuzzyMatch: function (source, target) {
    if (!target) return true;
    return source.toLowerCase().indexOf(target.toLowerCase()) !== -1;
  },

  // ============== 加载动画（骨架预埋，仅显隐+填值；引用计数支持并发） ==============
  showLoading: function (text) {
    Packing._loadingCount++;
    $("#loading-text").text(text || "加载中...");
    $("#template-loading").removeClass("hidden");
  },

  hideLoading: function () {
    Packing._loadingCount = Math.max(0, Packing._loadingCount - 1);
    if (Packing._loadingCount === 0) {
      $("#template-loading").addClass("hidden");
    }
  },

  // ============== Toast 消息提示框（骨架预埋，仅显隐+填值） ==============
  // content 三种形态：null / string / array（[{label,value}] 详情行）
  showToast: function (title, content, type, callback) {
    var $toast = $("#template-toast");
    if (Packing._toastTimer) {
      clearTimeout(Packing._toastTimer);
      Packing._toastTimer = null;
    }

    $("#toast-title").text(title);
    $("#template-toast .toast-icon-error").toggleClass("hidden", type !== "error");
    $("#template-toast .toast-icon-success").toggleClass("hidden", type === "error");

    var $content = $("#toast-content");
    $content.empty();
    if (typeof content === "string") {
      $content.removeClass("hidden").text(content);
    } else if (Array.isArray(content)) {
      $content.removeClass("hidden");
      content.forEach(function (row) {
        var $row = Packing.cloneTemplate("template-detail-row");
        $row.find(".detail-label").text(row.label);
        $row.find(".detail-value").text(row.value);
        $content.append($row);
      });
    } else {
      $content.addClass("hidden");
    }

    function close() {
      if (Packing._toastTimer) {
        clearTimeout(Packing._toastTimer);
        Packing._toastTimer = null;
      }
      if ($toast.hasClass("hidden")) return;
      $toast.addClass("hidden");
      if (callback) callback();
    }

    $toast.data("close-callback", close);
    $toast.removeClass("hidden");

    if (type !== "error") {
      Packing._toastTimer = setTimeout(close, 3000);
    }
  },

  // ============== 计算所需最少照片数 ==============
  // ceil(装箱数量 × 箱数 / 总数)，缺箱数/总数/数量非法时兜底 1 张
  calcRequiredPhotos: function (item, quantity) {
    var containerNum = parseFloat(item && item.containerNum);
    var totalQuantity = parseFloat(item && item.totalQty);
    if (isNaN(quantity) || quantity <= 0 || !containerNum || !totalQuantity || containerNum <= 0 || totalQuantity <= 0) {
      return 1;
    }
    return Math.ceil((quantity * containerNum) / totalQuantity);
  },

  // ============== 步骤指示器 ==============
  updateStepIndicator: function (step) {
    for (var i = 0; i < 2; i++) {
      var $item = $("#step-item-" + i);
      $item.removeClass("active completed");
      if (i < step) {
        $item.addClass("completed");
        $item.find(".step-dot").html(
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:14px;height:14px;"><path d="M5 13l4 4L19 7" /></svg>',
        );
      } else if (i === step) {
        $item.addClass("active");
        $item.find(".step-dot").text(i + 1);
      } else {
        $item.find(".step-dot").text(i + 1);
      }
      if (i < 1) {
        $("#step-line-" + i).toggleClass("done", i < step);
      }
    }
  },

  // ============== 搜索区渲染（三态行：完成/输入/锁定，模板克隆） ==============
  renderSearchSections: function () {
    var $area = $("#search-area");
    $area.empty();
    var stepIndex = Packing.state.step;

    var steps = [
      { label: "装箱单号", key: "packingListNo" },
      { label: "物料编码", key: "materialCode" },
    ];

    for (var i = 0; i < steps.length; i++) {
      var $row;
      if (i < stepIndex) {
        // 完成态：摘要 + 展开按钮（点击回退重编辑）
        $row = Packing.cloneTemplate("template-step-completed");
        $row.attr("data-step", i);
        $row.find(".step-name").text(steps[i].label);
        $row.find(".step-value").text(Packing.state[steps[i].key]);
      } else if (i === stepIndex) {
        $row = Packing.cloneTemplate("template-step-active");
        $row.attr("data-step", i);
        $row.find(".step-chip").text(i + 1);
        $row.find(".step-name").text(steps[i].label);
        $row.find(".search-input").val(Packing.state[steps[i].key]);
      } else {
        $row = Packing.cloneTemplate("template-step-locked");
        $row.attr("data-step", i);
        $row.find(".step-chip").text(i + 1);
        $row.find(".step-name").text(steps[i].label);
      }
      $area.append($row);
    }
  },

  // ============== 搜索结果卡片列表 ==============
  renderResultList: function (items) {
    var $list = $("#result-area");
    $list.empty();

    if (!items || items.length === 0) {
      var $empty = Packing.cloneTemplate("template-empty-state");
      $empty.find("p").text("未找到匹配结果");
      $list.append($empty);
    } else {
      items.forEach(function (item, index) {
        var $card = Packing.cloneTemplate("template-result-card");
        $card.attr("data-index", index);
        Packing.fillFieldRows($card, item);
        $list.append($card);
      });
    }
    $list.show();

    setTimeout(function () {
      $list[0].scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
  },

  /** 填充信息行（field-row ×8 + 三列行） */
  fillFieldRows: function ($container, item) {
    var rows = [
      { label: "批次编码", value: item.batchCode },
      { label: "批次描述", value: item.batchDescription },
      { label: "装箱单号", value: item.packingListNo },
      { label: "箱号", value: item.boxNo },
      { label: "箱数", value: item.containerNum },
      { label: "物料编码", value: item.materialCode },
      { label: "物料名称", value: item.materialName },
    ];
    rows.forEach(function (row) {
      var $row = Packing.cloneTemplate("template-field-row");
      $row.find(".field-label").text(row.label);
      $row.find(".field-value").text(row.value);
      $container.append($row);
    });
    var $triple = Packing.cloneTemplate("template-field-row-triple");
    var labels = ["总数", "待装箱数", "已装箱数"];
    var values = [item.totalQty, item.pendingQty, item.packedQty];
    $triple.find(".triple-item").each(function (j) {
      $(this).find(".field-label").text(labels[j]);
      $(this).find(".field-value").text(values[j]);
    });
    $container.append($triple);
  },

  // ============== 选中装箱对象 ==============
  selectItem: function (index) {
    var item = Packing.state.results[index];
    if (!item) return;

    Packing.state.selectedItem = item;
    Packing.state.step = 2;
    Packing.state.materialCode = item.materialCode || "";
    Packing.state.sessionId++; // 新会话：丢弃在途上传回调

    Packing.updateStepIndicator(2);
    Packing.renderSearchSections();
    Packing.state.photos = [];
    Packing.renderPackingPanel(item);
  },

  // ============== 装箱面板 ==============
  renderPackingPanel: function (item) {
    $("#packing-panel-container").show();

    var $card = $("#packing-card");
    $card.empty();
    Packing.fillFieldRows($card, item);

    $("#packing-qty").val(item.pendingQty).attr({ min: "1", max: item.pendingQty });
    $("#qty-hint").text("待装箱数: " + item.pendingQty);
    $("#qty-error").addClass("hidden").text("");

    $("#photo-required-tip").text("(至少" + Packing.calcRequiredPhotos(item, item.pendingQty) + "张)");
    $("#photo-error").addClass("hidden").text("");

    $("#confirm-section").removeClass("hidden");
    $(".btn-confirm").prop("disabled", false).text("确认装箱");

    Packing.renderPhotoList();

    setTimeout(function () {
      $("#packing-panel")[0].scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
  },

  removePackingPanel: function () {
    Packing.state.sessionId++; // 关闭面板：丢弃在途回调
    $("#packing-panel-container").hide();
    $("#confirm-section").addClass("hidden");
    Packing.state.selectedItem = null;
    Packing.state.photos = [];
    Packing.state.submitting = false;
  },

  // ============== 照片列表渲染 ==============
  renderPhotoList: function () {
    var $scroll = $("#photo-scroll");
    // 移除旧缩略图（保留预埋的拍照按钮）
    $scroll.find(".photo-item").remove();

    Packing.state.photos.forEach(function (photo, index) {
      var $item = Packing.cloneTemplate("template-photo-item");
      $item.attr("data-index", index);
      $item.find("img").attr("src", photo.url);
      $scroll.append($item);
    });

    $("#photo-add-button").toggleClass("hidden", Packing.state.photos.length >= CONFIG.MAX_PHOTOS);

    var quantity = parseFloat(($("#packing-qty").val() || "").trim());
    if (Packing.state.photos.length >= Packing.calcRequiredPhotos(Packing.state.selectedItem, quantity)) {
      $("#photo-error").addClass("hidden").text("");
    }

    Packing.updatePhotoProgress();
    $scroll[0].scrollLeft = $scroll[0].scrollWidth;
  },

  // ============== 照片进度条 ==============
  updatePhotoProgress: function () {
    var quantity = parseFloat(($("#packing-qty").val() || "").trim());
    var required = Packing.calcRequiredPhotos(Packing.state.selectedItem, quantity);
    var taken = Packing.state.photos.length;
    var percent = Math.min(100, (taken / required) * 100);

    $("#photo-progress-text").text(taken + "/" + required + "张");
    $("#photo-progress-fill").css("width", percent + "%");
    $("#photo-progress-fill").toggleClass("complete", taken >= required);
  },

  // ============== 照片处理 ==============
  handleFileSelect: function (files) {
    var remaining = CONFIG.MAX_PHOTOS - Packing.state.photos.length;
    if (remaining <= 0) {
      Packing.showToast("提示", "最多上传" + CONFIG.MAX_PHOTOS + "张照片", "error");
      return;
    }

    var file = files[0];
    var sessionIdSnapshot = Packing.state.sessionId; // 归属快照：回调校验防串单
    var item = Packing.state.selectedItem;
    if (!item) return;

    Packing.compressImage(file, function (base64) {
      if (sessionIdSnapshot !== Packing.state.sessionId) return; // 会话已切换，丢弃
      Packing.showLoading("上传中...");
      console.log("[API] uploadPackingImage", { id: item.ID, base64: base64.substring(0, 80) + "..." });
      Packing.apiCall(
        window.uploadPackingImage,
        [{ id: item.ID, base64: base64 }],
        function (response) {
          console.log("[API] uploadPackingImage 返回", response);
          Packing.hideLoading();
          if (sessionIdSnapshot !== Packing.state.sessionId) return; // 会话已切换，丢弃
          if (response.code !== 0) {
            Packing.showToast("上传失败", response.msg || "请重试", "error");
            return;
          }
          Packing.state.photos.push({ url: response.data.url });
          Packing.renderPhotoList();
        },
      );
    });
  },

  // ============== 照片压缩（含 EXIF 旋转修正） ==============
  /** 解析 JPEG EXIF orientation 值（1=正常 / 3=180° / 6=90° / 8=270°）
   *  @param {string} dataUrl 图片的 data URL
   *  @returns {number} orientation 值，解析失败兜底返回 1 */
  readExifOrientation: function (dataUrl) {
    try {
      var base64 = dataUrl.split(",")[1];
      var bin = atob(base64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
      }
      var dv = new DataView(bytes.buffer);
      if (dv.getUint16(0, false) !== 0xffd8) return 1; // 0xffd8：JPEG SOI 起始标记
      var offset = 2;
      var len = bytes.length;
      while (offset < len - 4) {
        if (dv.getUint8(offset) !== 0xff) { offset++; continue; }
        var marker = dv.getUint8(offset + 1);
        if (marker === 0xe1) { // 0xe1：APP1 段（Exif 数据存放段）
          var segLen = dv.getUint16(offset + 2, false);
          if (dv.getUint32(offset + 4, false) === 0x45786966) { // 0x45786966：Exif 魔数（ASCII 字符串 Exif）
            var tiffOff = offset + 10;
            var little = dv.getUint16(tiffOff, false) === 0x4949;
            if (dv.getUint16(tiffOff + 2, little) !== 0x002a) return 1;
            var ifd0Off = dv.getUint32(tiffOff + 4, little) + tiffOff;
            var entries = dv.getUint16(ifd0Off, little);
            for (var e = 0; e < entries; e++) {
              var entryOff = ifd0Off + 2 + e * 12;
              if (dv.getUint16(entryOff, little) === 0x0112) { // 0x0112：orientation 标签
                return dv.getUint16(entryOff + 8, little);
              }
            }
          }
          offset += segLen + 2;
        } else {
          offset++;
        }
      }
    } catch (err) {}
    return 1;
  },

  compressImage: function (file, callback) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        var width = img.width;
        var height = img.height;
        var orientation = Packing.readExifOrientation(e.target.result);

        if (width > CONFIG.MAX_IMAGE_WIDTH) {
          height = Math.round((height * CONFIG.MAX_IMAGE_WIDTH) / width);
          width = CONFIG.MAX_IMAGE_WIDTH;
        }
        if (height > CONFIG.MAX_IMAGE_HEIGHT) {
          width = Math.round((width * CONFIG.MAX_IMAGE_HEIGHT) / height);
          height = CONFIG.MAX_IMAGE_HEIGHT;
        }

        var canvas = document.createElement("canvas");
        var ctx = canvas.getContext("2d");

        switch (orientation) {
          case 3: // 180° 旋转：画布尺寸不变，整体旋转
            canvas.width = width;
            canvas.height = height;
            ctx.translate(width, height);
            ctx.rotate(Math.PI);
            break;
          case 6: // 90° 顺时针：宽高互换后旋转
            canvas.width = height;
            canvas.height = width;
            ctx.translate(height, 0);
            ctx.rotate(Math.PI / 2);
            break;
          case 8: // 270° 顺时针（90° 逆时针）：宽高互换后旋转
            canvas.width = height;
            canvas.height = width;
            ctx.translate(0, width);
            ctx.rotate(-Math.PI / 2);
            break;
          default:
            canvas.width = width;
            canvas.height = height;
        }
        ctx.drawImage(img, 0, 0, width, height);

        var base64 = canvas.toDataURL("image/jpeg", CONFIG.JPEG_QUALITY);
        callback(base64);
      };
      img.onerror = function () {
        Packing.showToast("错误", "图片读取失败，请重试", "error");
      };
      img.src = e.target.result;
    };
    reader.onerror = function () {
      Packing.showToast("错误", "图片读取失败，请重试", "error");
    };
    reader.readAsDataURL(file);
  },

  // ============== 照片删除 ==============
  deletePhoto: function (index) {
    Packing.state.photos.splice(index, 1);
    Packing.renderPhotoList();
  },

  // ============== 照片预览（简单版） ==============
  showPhotoPreview: function (index) {
    var photo = Packing.state.photos[index];
    if (!photo) return;
    $("#preview-image").attr("src", photo.url);
    $("#template-preview").removeClass("hidden");
  },

  // ============== 扫码 ==============
  doScan: function (targetSelector, callback) {
    try {
      if (window.parent && typeof window.parent.OpenCamera === "function") {
        window.parent.OpenCamera(function (result) {
          console.log("[Scan] OpenCamera 返回", result);
          var value = result.data || result.value || (typeof result === "string" ? result : "");
          if (value) {
            Packing.state.step === 0
              ? Packing.state.packingListNo = value
              : Packing.state.materialCode = value;
            $(targetSelector).val(value);
            callback();
          }
        });
        return;
      }
    } catch (e) {
      // 跨域访问 window.parent 会抛 SecurityError
    }
    Packing.showToast("提示", "扫码功能仅在移动端可用，请手动输入", "error");
  },

  // ============== 搜索逻辑 ==============
  doSearchPackingList: function () {
    var packingListNo = Packing.state.packingListNo;
    if (!packingListNo) {
      Packing.showToast("提示", "请输入装箱单号", "error");
      return;
    }

    Packing.showLoading("查询中...");
    console.log("[API] searchByPackingList", { packingListNo: packingListNo });
    Packing.apiCall(window.searchByPackingList, [{ packingListNo: packingListNo }], function (response) {
      console.log("[API] searchByPackingList 返回", response);
      Packing.hideLoading();
      if (response.code !== 0) {
        Packing.showToast("查询失败", response.msg || "未找到该装箱单号", "error");
        Packing.state.results = [];
        Packing.renderResultList([]);
        return;
      }
      Packing.state.results = response.data;
      Packing.state.step = 1;
      Packing.state.materialCode = "";
      Packing.updateStepIndicator(1);
      Packing.renderSearchSections();
      Packing.renderResultList(response.data);
      Packing.removePackingPanel();
    });
  },

  doSearchMaterial: function () {
    var materialCode = Packing.state.materialCode;
    if (!materialCode) {
      Packing.showToast("提示", "请输入物料编码", "error");
      return;
    }
    if (!Packing.state.packingListNo) {
      Packing.showToast("提示", "请先搜索装箱单号", "error");
      return;
    }

    Packing.showLoading("查询中...");
    console.log("[API] searchByMaterialCode", { packingListNo: Packing.state.packingListNo, materialCode: materialCode });
    Packing.apiCall(
      window.searchByMaterialCode,
      [{ packingListNo: Packing.state.packingListNo, materialCode: materialCode }],
      function (response) {
        console.log("[API] searchByMaterialCode 返回", response);
        Packing.hideLoading();
        if (response.code !== 0) {
          Packing.showToast("查询失败", response.msg || "未找到该物料信息", "error");
          Packing.state.results = [];
          Packing.renderResultList([]);
          return;
        }
        Packing.state.results = response.data;
        Packing.state.step = 2;
        Packing.updateStepIndicator(2);
        Packing.renderSearchSections();
        Packing.renderResultList(response.data);
        Packing.removePackingPanel();
      },
    );
  },

  // ============== 提交 ==============
  handleSubmit: function () {
    var item = Packing.state.selectedItem;
    if (!item || Packing.state.submitting) return;

    var quantityString = $("#packing-qty").val().trim();
    var quantity = parseFloat(quantityString);
    var quantityValid = true;

    $("#packing-qty").removeClass("has-error");
    $("#qty-error").addClass("hidden").text("");

    if (!quantityString) {
      $("#packing-qty").addClass("has-error");
      $("#qty-error").text("请输入本次装箱数量").removeClass("hidden");
      quantityValid = false;
    } else if (isNaN(quantity) || quantity <= 0) {
      $("#packing-qty").addClass("has-error");
      $("#qty-error").text("数量必须为正数").removeClass("hidden");
      quantityValid = false;
    } else if (quantity > item.pendingQty) {
      $("#packing-qty").addClass("has-error");
      $("#qty-error").text("不能超过待装箱数 " + item.pendingQty).removeClass("hidden");
      quantityValid = false;
    }

    var photoValid = true;
    $("#photo-error").addClass("hidden").text("");
    var requiredPhotos = Packing.calcRequiredPhotos(item, quantity);
    if (Packing.state.photos.length < requiredPhotos) {
      $("#photo-error")
        .text("照片数量不足，至少需拍摄" + requiredPhotos + "张（当前" + Packing.state.photos.length + "张）")
        .removeClass("hidden");
      photoValid = false;
    }

    if (!quantityValid || !photoValid) return;

    Packing.state.submitting = true;
    var $confirmButton = $(".btn-confirm");
    $confirmButton.prop("disabled", true).text("提交中...");
    Packing.showLoading("提交中...");

    var submitData = {
      ID: item.ID,
      batchCode: item.batchCode,
      batchDescription: item.batchDescription,
      packingListNo: item.packingListNo,
      boxNo: item.boxNo,
      materialCode: item.materialCode,
      materialName: item.materialName,
      totalQty: item.totalQty,
      containerNum: item.containerNum,
      pendingQty: item.pendingQty,
      packedQty: item.packedQty,
      packingQty: quantity,
      photos: Packing.state.photos.map(function (photo) { return photo.url; }),
      operator: window.Operator,
    };

    console.log("[API] submitPacking", submitData);
    Packing.apiCall(window.submitPacking, [submitData], function (response) {
      console.log("[API] submitPacking 返回", response);
      Packing.hideLoading();
      Packing.state.submitting = false;
      $confirmButton.prop("disabled", false).text("确认装箱");

      if (response.code !== 0) {
        Packing.showToast("提交失败", response.msg || "请稍后重试", "error");
        return;
      }

      // 成功：详情 toast → 关闭后重置（保留装箱单号回到物料搜索）
      var rows = [
        { label: "批次编码", value: item.batchCode },
        { label: "批次描述", value: item.batchDescription },
        { label: "装箱单号", value: item.packingListNo },
        { label: "箱号", value: item.boxNo },
        { label: "物料编码", value: item.materialCode },
        { label: "物料名称", value: item.materialName },
        { label: "装箱数量", value: quantity },
        { label: "照片数量", value: Packing.state.photos.length },
      ];
      Packing.showToast("装箱成功", rows, "success", function () {
        Packing.resetAfterPacking();
      });
    });
  },

  // ============== 提交后重置（保留装箱单号，回到物料编码搜索） ==============
  resetAfterPacking: function () {
    Packing.state.materialCode = "";
    Packing.state.selectedItem = null;
    Packing.state.photos = [];
    Packing.state.submitting = false;
    Packing.state.step = 1;

    Packing.updateStepIndicator(1);
    Packing.renderSearchSections();
    Packing.removePackingPanel();
    $("#packing-body")[0].scrollTop = 0;

    // 用当前装箱单号重新查询，获取最新数据
    Packing.showLoading("刷新中...");
    Packing.apiCall(window.searchByPackingList, [{ packingListNo: Packing.state.packingListNo }], function (response) {
      Packing.hideLoading();
      if (response.code === 0) {
        Packing.state.results = response.data;
        Packing.renderResultList(response.data);
      }
    });
  },

  // ============== 初始加载全量数据 ==============
  loadAllData: function () {
    Packing.state.packingListNo = "";

    Packing.showLoading("加载中...");
    console.log("[API] loadAllData searchByPackingList", { packingListNo: "" });
    Packing.apiCall(window.searchByPackingList, [{ packingListNo: "" }], function (response) {
      console.log("[API] loadAllData 返回", response);
      Packing.hideLoading();
      if (response.code !== 0) {
        Packing.showToast("加载失败", response.msg || "获取数据失败", "error");
        Packing.state.results = [];
        Packing.renderResultList([]);
        return;
      }
      Packing.state.results = response.data;
      Packing.renderResultList(response.data);
    });
  },

  // ============== 事件绑定（一次性委托，页面加载时执行） ==============
  initEvents: function () {
    // 搜索按钮/扫码/回车（按 step-row 的 data-step 区分操作）
    $("#search-area").on("click", ".btn-search", function () {
      var stepIndex = parseInt($(this).closest(".step-row").data("step"));
      if (stepIndex === 0) Packing.doSearchPackingList();
      else if (stepIndex === 1) Packing.doSearchMaterial();
    });
    $("#search-area").on("click", ".btn-scan", function () {
      var stepIndex = parseInt($(this).closest(".step-row").data("step"));
      var $input = $(this).closest(".step-row").find(".search-input");
      if (stepIndex === 0) Packing.doScan($input, Packing.doSearchPackingList);
      else if (stepIndex === 1) Packing.doScan($input, Packing.doSearchMaterial);
    });
    $("#search-area").on("keypress", ".search-input", function (e) {
      if (e.which !== 13) return;
      var stepIndex = parseInt($(this).closest(".step-row").data("step"));
      var value = $(this).val().trim();
      if (stepIndex === 0) { Packing.state.packingListNo = value; Packing.doSearchPackingList(); }
      else if (stepIndex === 1) { Packing.state.materialCode = value; Packing.doSearchMaterial(); }
    });
    // 输入时同步 state（点击搜索按钮时使用）
    $("#search-area").on("input", ".search-input", function () {
      var stepIndex = parseInt($(this).closest(".step-row").data("step"));
      var value = $(this).val().trim();
      if (stepIndex === 0) Packing.state.packingListNo = value;
      else if (stepIndex === 1) Packing.state.materialCode = value;
    });

    // 点击已完成步骤 → 回退重新编辑
    $("#search-area").on("click", ".step-row.completed", function () {
      var stepIndex = parseInt($(this).data("step"));
      Packing.state.step = stepIndex;
      Packing.updateStepIndicator(stepIndex);
      Packing.renderSearchSections();
    });

    // 结果卡片选中
    $("#result-area").on("click", ".result-card", function () {
      Packing.selectItem(parseInt($(this).data("index")));
    });

    // 数量输入校验 + 进度联动
    $("#packing-qty").on("input", function () {
      var value = $(this).val().trim();
      var quantity = parseFloat(value);

      $("#photo-required-tip").text("(至少" + Packing.calcRequiredPhotos(Packing.state.selectedItem, quantity) + "张)");
      Packing.updatePhotoProgress();

      $(this).removeClass("has-error");
      $("#qty-error").addClass("hidden").text("");

      if (value === "") return;
      if (isNaN(quantity) || quantity <= 0) {
        $(this).addClass("has-error");
        $("#qty-error").text("数量必须为正数").removeClass("hidden");
      } else if (quantity > Packing.state.selectedItem.pendingQty) {
        $(this).addClass("has-error");
        $("#qty-error").text("不能超过待装箱数 " + Packing.state.selectedItem.pendingQty).removeClass("hidden");
      }
    });

    // 拍照
    $("#photo-add-button").on("click", function () {
      $("#photo-input").click();
    });
    $("#photo-input").on("change", function () {
      var files = this.files;
      if (!files || files.length === 0) return;
      Packing.handleFileSelect(files);
      $(this).val("");
    });

    // 照片删除/预览（委托）
    $("#photo-scroll").on("click", ".photo-delete", function (e) {
      e.stopPropagation();
      Packing.deletePhoto(parseInt($(this).closest(".photo-item").data("index")));
    });
    $("#photo-scroll").on("click", ".photo-item img", function () {
      Packing.showPhotoPreview(parseInt($(this).closest(".photo-item").data("index")));
    });

    // 确认装箱
    $("#confirm-section").on("click", ".btn-confirm", function () {
      Packing.handleSubmit();
    });

    // Toast 关闭
    $("#template-toast").on("click", function (e) {
      if (e.target === this || $(e.target).hasClass("toast-btn")) {
        var closeCallback = $("#template-toast").data("close-callback");
        if (closeCallback) closeCallback();
      }
    });

    // 预览关闭
    $("#template-preview .photo-preview-close").on("click", function () {
      $("#template-preview").addClass("hidden");
    });
    $("#template-preview").on("click", function (e) {
      if (e.target === this) $(this).addClass("hidden");
    });
  },

  // ============== 页面初始化 ==============
  initPage: function () {
    // Portal 表单环境：HTML 片段可能晚于 JS 就绪注入，先等根容器出现再初始化（选择器空集合会崩）
    if (!$("#mom-packing-app").length) {
      Packing._initRetryCount++;
      if (Packing._initRetryCount > 100) return;
      setTimeout(function () {
        Packing.initPage();
      }, 50);
      return;
    }

    // 头部：操作员 + 时钟
    $("#header-operator").text(window.Operator);

    function now() {
      var d = new Date();
      var pad = function (n) { return n < 10 ? "0" + n : n; };
      return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
    }
    $("#header-time").text(now());
    setInterval(function () {
      $("#header-time").text(now());
    }, 1000);

    Packing.initEvents();

    Packing.updateStepIndicator(0);
    Packing.renderSearchSections();

    Packing.loadAllData();
  },
};

// ============== 启动 ==============
$(function () {
  Packing.initPage();
});
