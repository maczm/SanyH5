// ============== 配置 ==============
var CONFIG = {
  MAX_IMAGE_WIDTH: 3000,
  MAX_IMAGE_HEIGHT: 3000,
  JPEG_QUALITY: 0.8,
  API_TIMEOUT: 10000, // API 超时兜底（毫秒）
};

/*
 * ============== 生产对接说明 ==============
 *
 * Mock 机制：
 *   本地开发：同目录 mock.js 提供全部 Mock API 兜底（生产不部署该文件，Portal 只取
 *             index.html / index.js / index.css 三个文件）
 *   Portal 生产：iframe 加载前向 window 注入同名真实函数，
 *   JS 通过 if (typeof window.xxx != 'function') 检测自动使用真实函数
 *
 * 页面结构：全部骨架在 index.html（含弹窗预埋与 <template> 循环模板），
 *          JS 只负责克隆模板、赋值（text/val/attr）与显隐切换，不拼接 HTML。
 *
 * 各 API 说明：
 *   API 1 (工位列表) : 获取工位列表
 *   API 2 (照片配置) : 获取照片类型配置（含 minCount/maxCount）和订单信息（含铭牌模板列表）
 *   API 3 (照片上传) : 上传单张照片（前端压缩为 JPEG Base64，生产需上传 CDN/OSS 返回 URL）
 *   API 4 (记录提交) : 提交与保存共用。data.saveType 区分：'submit'=提交AI检测（二次确认后触发），'save'=保存工位照片信息（不触发检测）
 *   window.Operator  : 当前操作员姓名（Portal 注入）
 *
 * Portal 必须注入以下 5 个 window 属性：
 *   window.getStationList     — API 1：获取工位列表
 *   window.getPhotoConfig     — API 2：获取照片类型配置 + 订单信息
 *   window.uploadPhoto        — API 3：照片上传
 *   window.submitPhotoRecord  — API 4：照片记录提交/保存（data.saveType 区分：'submit' / 'save'）
 *   window.Operator           — 当前操作员姓名
 */

// ============== 应用命名空间 ==============
// 所有页面逻辑挂在 PhotoUpload 下，避免全局函数互相覆盖（Portal 同 iframe 切页场景）
var PhotoUpload = {
  // ============== 状态管理 ==============
  state: {
    stationCode: "",
    orderNo: "",
    photoTypes: [],       // [{ typeCode, typeName, minCount, maxCount }]
    photos: {},           // { typeCode: [{ url: '...' }] }
    submitting: false,
    configLoaded: false,
    formCollapsed: false, // 查询区是否折叠
    orderInfoCollapsed: false, // 订单信息区是否折叠
    orderInfo: {          // 订单信息
      machineCode: "",
      vin: "",
      templates: [],      // [{ templateId, templateName, templateImageUrl }]
    },
    selectedTemplateId: "",
    selectedTemplateName: "",
    selectedTemplateUrl: "",
    stations: [],         // 工位列表缓存
    sessionId: 0,         // 会话标识：查询/清空/换工位时递增，用于丢弃过期异步回调（防串单）
  },

  _toastTimer: null,      // toast 自动关闭定时器

  // ============== 模板克隆 ==============
  /**
   * 克隆 <template> 骨架并返回 jQuery 对象（取根元素，保证 .data() 落在真实 DOM 节点上）
   * @param {string} id - template 元素 id（不含 #）
   */
  cloneTpl: function (id) {
    var frag = document.getElementById(id).content.cloneNode(true);
    return $(frag.firstElementChild); // 所有 template 均为单根结构
  },

  // ============== 工具函数 ==============

  /**
   * API 调用包装：统一加超时兜底，防止 Portal 函数永不回调时页面卡死。
   * fn 为 window 注入的函数（callback 风格），args 为除 callback 外的参数数组。
   */
  apiCall: function (fn, args, cb, timeout) {
    var done = false;
    var timer = setTimeout(function () {
      if (done) return;
      done = true;
      cb({ code: -1, msg: "请求超时，请重试" });
    }, timeout || CONFIG.API_TIMEOUT);
    args = args || [];
    fn.apply(null, args.concat([function (res) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cb(res);
    }]));
  },

  /**
   * 读取 JPEG EXIF Orientation（1-8），非 JPEG/无 EXIF 返回 1。
   * 用于压缩时修正手机竖拍照片的旋转。
   */
  readExifOrientation: function (dataUrl) {
    try {
      var base64 = dataUrl.split(",")[1];
      var bin = atob(base64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
      }
      var dv = new DataView(bytes.buffer);
      if (dv.getUint16(0, false) !== 0xffd8) return 1; // 非 JPEG
      var offset = 2;
      var len = bytes.length;
      while (offset < len - 4) {
        if (dv.getUint8(offset) !== 0xff) { offset++; continue; }
        var marker = dv.getUint8(offset + 1);
        if (marker === 0xe1) { // APP1: Exif
          var segLen = dv.getUint16(offset + 2, false);
          if (dv.getUint32(offset + 4, false) === 0x45786966) { // "Exif"
            var tiffOff = offset + 10;
            var little = dv.getUint16(tiffOff, false) === 0x4949;
            if (dv.getUint16(tiffOff + 2, little) !== 0x002a) return 1;
            var ifd0Off = dv.getUint32(tiffOff + 4, little) + tiffOff;
            var entries = dv.getUint16(ifd0Off, little);
            for (var e = 0; e < entries; e++) {
              var entryOff = ifd0Off + 2 + e * 12;
              if (dv.getUint16(entryOff, little) === 0x0112) { // Orientation
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

  // ============== 加载动画（骨架预埋，仅显隐+填值） ==============
  showLoading: function (text) {
    $("#loading-text").text(text || "加载中...");
    $("#tpl-loading").removeClass("hidden");
  },

  hideLoading: function () {
    $("#tpl-loading").addClass("hidden");
  },

  // ============== Toast 消息提示框（骨架预埋，仅显隐+填值） ==============
  // content 支持三种形态：null（无内容区）/ string（单行文本）/ array（[{label,value}] 详情行）
  showToast: function (title, content, type, callback) {
    var $toast = $("#tpl-toast");
    if (PhotoUpload._toastTimer) {
      clearTimeout(PhotoUpload._toastTimer);
      PhotoUpload._toastTimer = null;
    }

    $("#toast-title").text(title);
    $("#tpl-toast .toast-icon-error").toggleClass("hidden", type != "error");
    $("#tpl-toast .toast-icon-success").toggleClass("hidden", type == "error");

    var $content = $("#toast-content");
    $content.empty();
    if (typeof content === "string") {
      $content.removeClass("hidden").text(content);
    } else if (Array.isArray(content)) {
      $content.removeClass("hidden");
      content.forEach(function (row) {
        var $r = PhotoUpload.cloneTpl("tpl-detail-row");
        $r.find(".detail-label").text(row.label);
        $r.find(".detail-value").text(row.value);
        $content.append($r);
      });
    } else {
      $content.addClass("hidden");
    }

    function close() {
      if (PhotoUpload._toastTimer) {
        clearTimeout(PhotoUpload._toastTimer);
        PhotoUpload._toastTimer = null;
      }
      if ($toast.hasClass("hidden")) return;
      $toast.addClass("hidden");
      if (callback) callback();
    }

    // 关闭回调挂到 data（事件在 initEvents 一次性委托）
    $toast.data("close-callback", close);
    $toast.removeClass("hidden");

    if (type != "error") {
      PhotoUpload._toastTimer = setTimeout(close, 3000);
    }
  },

  // ============== 二次确认弹窗（骨架预埋） ==============
  showConfirmDialog: function (message, onConfirm) {
    $("#confirm-content").text(message);
    $("#tpl-confirm").data("on-confirm", onConfirm).removeClass("hidden");
  },

  // ============== 模板选择弹窗（骨架预埋 + 列表克隆） ==============
  showTemplatePicker: function (templates, callback) {
    var $list = $("#picker-list");
    $list.empty();
    templates.forEach(function (tpl) {
      var $item = PhotoUpload.cloneTpl("tpl-picker-item");
      $item.find("img").attr("src", tpl.templateImageUrl).attr("alt", tpl.templateName);
      $item.find(".picker-item-name").text(tpl.templateName);
      $item.data("id", tpl.templateId).data("name", tpl.templateName).data("url", tpl.templateImageUrl);
      $list.append($item);
    });
    $("#tpl-picker").data("on-pick", callback).removeClass("hidden");
  },

  // ============== 表单渲染（骨架已静态化，此处仅切换状态与回填值） ==============
  // 与订单信息一致：查询后显示卡片头（点击折叠/展开），查询前无头完整显示
  renderForm: function () {
    var s = PhotoUpload.state;
    var $header = $("#btn-toggle-form");
    var $body = $("#form-card-body");
    var $clearBefore = $("#btn-clear-before");

    if (s.configLoaded) {
      $header.removeClass("hidden");
      $(".form-arrow .arrow-down").toggleClass("hidden", !s.formCollapsed);
      $(".form-arrow .arrow-up").toggleClass("hidden", s.formCollapsed);
      $body.toggleClass("hidden", s.formCollapsed);
      $clearBefore.addClass("hidden");
    } else {
      $header.addClass("hidden");
      $body.removeClass("hidden");
      $clearBefore.removeClass("hidden");
    }

    // 回填当前值
    $("#input-station").val(s.stationCode ? PhotoUpload.getStationDisplay(s.stationCode) : "");
    $("#input-station-code").val(s.stationCode);
    $("#input-order").val(s.orderNo);
  },

  getStationDisplay: function (stationCode) {
    for (var i = 0; i < PhotoUpload.state.stations.length; i++) {
      if (PhotoUpload.state.stations[i].stationCode == stationCode) {
        return PhotoUpload.state.stations[i].stationCode + " - " + PhotoUpload.state.stations[i].stationName;
      }
    }
    return stationCode;
  },

  // ============== 加载工位列表 ==============
  loadStationList: function () {
    console.log("[API] getStationList");
    PhotoUpload.apiCall(window.getStationList, [], function (res) {
      console.log("[API] getStationList 返回", res);
      if (res.code != 0) {
        PhotoUpload.showToast("加载失败", res.msg || "获取工位列表失败", "error");
        return;
      }
      PhotoUpload.state.stations = res.data || [];

      if (PhotoUpload.state.stationCode) {
        $("#input-station").val(PhotoUpload.getStationDisplay(PhotoUpload.state.stationCode));
        $("#input-station-code").val(PhotoUpload.state.stationCode);
      }
    });
  },

  // ============== 工位筛选 ==============
  filterStations: function (keyword) {
    if (!keyword) return PhotoUpload.state.stations;
    var kw = keyword.toLowerCase();
    return PhotoUpload.state.stations.filter(function (s) {
      var code = (s.stationCode || "").toLowerCase();
      var name = (s.stationName || "").toLowerCase();
      return code.indexOf(kw) != -1 || name.indexOf(kw) != -1;
    });
  },

  showStationDropdown: function () {
    var keyword = $("#input-station").val().trim();
    var filtered = PhotoUpload.filterStations(keyword);
    var $dd = $("#dropdown-station");
    $dd.empty();

    if (!filtered.length) {
      $dd.append('<div class="combobox-empty">无匹配工位</div>');
    } else {
      filtered.forEach(function (s) {
        var $item = PhotoUpload.cloneTpl("tpl-combobox-item");
        $item.find(".combobox-item-code").text(s.stationCode);
        $item.find(".combobox-item-name").text(s.stationName);
        $item.data("code", s.stationCode).data("name", s.stationName);
        $dd.append($item);
      });
    }
    $dd.show();
  },

  selectStation: function (stationCode, stationName) {
    PhotoUpload.state.stationCode = stationCode;
    $("#input-station").val(stationCode + " - " + stationName);
    $("#input-station-code").val(stationCode);
    $("#dropdown-station").hide();

    if (PhotoUpload.state.configLoaded) {
      PhotoUpload.state.configLoaded = false;
      PhotoUpload.hideResultAreas();
    }
  },

  hideResultAreas: function () {
    PhotoUpload.state.sessionId++; // 清空/切换会话：丢弃在途回调
    $("#order-info-area").addClass("hidden");
    $("#photo-cards-area .photo-type-card").remove(); // 保留预埋的 empty-state 骨架
    $("#empty-no-photo").addClass("hidden");
    $("#confirm-section").addClass("hidden");
  },

  // ============== 表单折叠/清空（折叠交互与订单信息一致：点卡片头切换） ==============
  toggleForm: function () {
    PhotoUpload.state.formCollapsed = !PhotoUpload.state.formCollapsed;
    PhotoUpload.renderForm();
  },

  clearForm: function () {
    var s = PhotoUpload.state;
    s.stationCode = "";
    s.orderNo = "";
    s.photoTypes = [];
    s.photos = {};
    s.configLoaded = false;
    s.formCollapsed = false;
    s.orderInfoCollapsed = false;
    s.orderInfo = { machineCode: "", vin: "", templates: [] };
    s.selectedTemplateId = "";
    s.selectedTemplateName = "";
    s.selectedTemplateUrl = "";

    PhotoUpload.hideResultAreas();
    PhotoUpload.renderForm();
    window.scrollTo({ top: 0, behavior: "smooth" });
  },

  // ============== 扫码 ==============
  doScan: function (inputId, callback) {
    try {
      if (window.parent && typeof window.parent.OpenCamera == "function") {
        window.parent.OpenCamera(function (res) {
          console.log("[Scan] OpenCamera 返回", res);
          var val = res.data || res.value || (typeof res == "string" ? res : "");
          if (val) {
            $("#" + inputId).val(val);
            callback();
          }
        });
        return;
      }
    } catch (e) {
      // 跨域访问 window.parent 会抛 SecurityError
    }
    PhotoUpload.showToast("提示", "扫码功能仅在移动端可用，请手动输入", "error");
  },

  // ============== 查询照片配置 ==============
  doQueryPhotoConfig: function () {
    var s = PhotoUpload.state;
    var stationCode = $("#input-station-code").val() || s.stationCode;
    var orderNo = $("#input-order").val().trim();

    if (!stationCode) {
      var typedVal = $("#input-station").val().trim();
      if (typedVal) {
        for (var i = 0; i < s.stations.length; i++) {
          var full = s.stations[i].stationCode + " - " + s.stations[i].stationName;
          if (full == typedVal) {
            stationCode = s.stations[i].stationCode;
            s.stationCode = stationCode;
            $("#input-station-code").val(stationCode);
            break;
          }
        }
      }
    }

    if (!stationCode) {
      PhotoUpload.showToast("提示", "请选择工位", "error");
      return;
    }
    if (!orderNo) {
      PhotoUpload.showToast("提示", "请输入订单号", "error");
      return;
    }

    s.stationCode = stationCode;
    s.orderNo = orderNo;

    PhotoUpload.showLoading("查询中...");
    console.log("[API] getPhotoConfig", { stationCode: stationCode, orderNo: orderNo });
    PhotoUpload.apiCall(window.getPhotoConfig, [{ stationCode: stationCode, orderNo: orderNo }], function (res) {
      console.log("[API] getPhotoConfig 返回", res);
      PhotoUpload.hideLoading();
      if (res.code != 0) {
        PhotoUpload.showToast("查询失败", res.msg || "获取照片配置失败", "error");
        return;
      }

      s.sessionId++; // 新会话：丢弃在途上传回调
      s.photoTypes = res.data.photoTypes || [];
      s.orderInfo = res.data.orderInfo || { machineCode: "", vin: "", templates: [] };
      s.photos = {};
      s.configLoaded = true;

      // 铭牌模板处理
      var templates = s.orderInfo.templates || [];
      if (templates.length == 1) {
        s.selectedTemplateId = templates[0].templateId;
        s.selectedTemplateName = templates[0].templateName || "";
        s.selectedTemplateUrl = templates[0].templateImageUrl;
      } else {
        s.selectedTemplateId = "";
        s.selectedTemplateName = "";
        s.selectedTemplateUrl = "";
      }

      for (var i = 0; i < s.photoTypes.length; i++) {
        s.photos[s.photoTypes[i].typeCode] = [];
      }

      // 查询成功：表单与订单信息默认展开（折叠交互一致：点卡片头切换）
      s.formCollapsed = false;
      s.orderInfoCollapsed = false;
      PhotoUpload.renderForm();
      PhotoUpload.renderOrderInfo();
      PhotoUpload.renderPhotoTypeCards();
      PhotoUpload.updateButtons();
      $("#photo-cards-area").removeClass("hidden");
      $("#confirm-section").removeClass("hidden");

      setTimeout(function () {
        $("#order-info-area")[0].scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    });
  },

  // ============== 订单信息渲染（body 多态块切换，骨架在 index.html） ==============
  renderOrderInfo: function () {
    var s = PhotoUpload.state;
    var $area = $("#order-info-area");

    // 无订单信息：整区隐藏
    if (!s.orderInfo || (!s.orderInfo.machineCode && (!s.orderInfo.templates || !s.orderInfo.templates.length))) {
      $area.addClass("hidden");
      return;
    }
    $area.removeClass("hidden");

    // 折叠箭头双态切换
    $(".order-info-arrow .arrow-down").toggleClass("hidden", !s.orderInfoCollapsed);
    $(".order-info-arrow .arrow-up").toggleClass("hidden", s.orderInfoCollapsed);

    // 折叠：body 收起（多态块全部隐藏）
    $("#order-info-body").toggleClass("hidden", s.orderInfoCollapsed);
    if (s.orderInfoCollapsed) return;

    // 态A：主机编码 + VIN
    var hasMachVin = !!(s.orderInfo.machineCode || s.orderInfo.vin);
    $("#block-machvin").toggleClass("hidden", !hasMachVin);
    $("#val-machine-code").text(s.orderInfo.machineCode || "-");
    $("#val-vin").text(s.orderInfo.vin || "-");

    // 态B/C/D：模板三态互斥
    $("#block-tpl-single").addClass("hidden");
    $("#block-tpl-selected").addClass("hidden");
    $("#block-tpl-none").addClass("hidden");

    var templates = s.orderInfo.templates || [];
    if (templates.length == 1) {
      // 单模板：自动选中
      $("#block-tpl-single").removeClass("hidden");
      $("#val-tpl-single-name").text(templates[0].templateName || "");
      $("#img-tpl-single").attr("src", templates[0].templateImageUrl);
    } else if (s.selectedTemplateId) {
      // 多模板已选
      $("#block-tpl-selected").removeClass("hidden");
      $("#val-tpl-selected-name").text(s.selectedTemplateName);
      $("#img-tpl-selected").attr("src", s.selectedTemplateUrl);
    } else if (templates.length > 1) {
      // 多模板未选
      $("#block-tpl-none").removeClass("hidden");
      $("#block-tpl-none .btn-pick-template-inline").text("点击选择（" + templates.length + "个可选）");
    }
  },

  // ============== 照片类型卡片渲染（克隆 tpl-photo-card / tpl-photo-item） ==============
  renderPhotoTypeCards: function () {
    var $area = $("#photo-cards-area");
    var s = PhotoUpload.state;
    $area.find(".photo-type-card").remove();
    $("#empty-no-photo").addClass("hidden");

    if (!s.photoTypes.length) {
      // 空态提示：骨架在 index.html
      $("#empty-no-photo").removeClass("hidden");
      return;
    }

    s.photoTypes.forEach(function (pt) {
      var $card = PhotoUpload.cloneTpl("tpl-photo-card");
      $card.attr("data-type", pt.typeCode);
      $card.find(".card-title").text(pt.typeName);
      $card.find(".photo-add").attr("data-type", pt.typeCode);

      var takenCount = (s.photos[pt.typeCode] || []).length;
      var reachedMin = takenCount >= pt.minCount;
      var reachedMax = takenCount >= pt.maxCount;

      // 徽章：done（打勾）/ pending（x/y~z）
      $card.find(".card-badge").toggleClass("done", reachedMin);
      $card.find(".badge-check").toggleClass("hidden", !reachedMin);
      $card.find(".badge-text").text(reachedMin ? "已完成" : takenCount + "/" + pt.minCount + "~" + pt.maxCount);

      // 进度条
      var progressPct = reachedMin ? 100 : Math.min(100, (takenCount / pt.minCount) * 100);
      $card.find(".progress-fill").css("width", progressPct + "%");
      $card.toggleClass("complete", reachedMin);

      // 缩略图列表
      var $list = $card.find(".photo-thumb-list");
      (s.photos[pt.typeCode] || []).forEach(function (p, j) {
        var $item = PhotoUpload.cloneTpl("tpl-photo-item");
        $item.attr("data-type", pt.typeCode).attr("data-index", j);
        $item.find("img").attr("src", p.url);
        $list.append($item);
      });

      // 拍照按钮 / 已达上限
      $card.find(".photo-add").toggleClass("hidden", reachedMax);
      $card.find(".photo-full-tip").toggleClass("hidden", !reachedMax);

      $area.append($card);
    });

    PhotoUpload.updateButtons();
  },

  // ============== 拍照处理 ==============
  handleTakePhoto: function (typeCode) {
    $("#photo-input").data("current-type", typeCode);
    $("#photo-input").click();
  },

  handleFileSelect: function (files, typeCode) {
    if (!typeCode) return;

    var pt = PhotoUpload.findPhotoType(typeCode);
    if (!pt) return;

    var s = PhotoUpload.state;
    var takenCount = (s.photos[typeCode] || []).length;
    if (takenCount >= pt.maxCount) {
      PhotoUpload.showToast("提示", "「" + pt.typeName + "」已达到最大数量 " + pt.maxCount + " 张", "error");
      return;
    }

    var file = files[0];
    var sid = s.sessionId; // 归属快照：回调时校验，防止串单

    PhotoUpload.compressImage(file, function (base64) {
      if (sid !== PhotoUpload.state.sessionId) return; // 会话已切换，丢弃
      PhotoUpload.showLoading("上传中...");
      console.log("[API] uploadPhoto", {
        photoType: typeCode,
        stationCode: PhotoUpload.state.stationCode,
        orderNo: PhotoUpload.state.orderNo,
        base64: base64.substring(0, 80) + "...",
      });
      PhotoUpload.apiCall(
        window.uploadPhoto,
        [
          {
            photoType: typeCode,
            stationCode: PhotoUpload.state.stationCode,
            orderNo: PhotoUpload.state.orderNo,
            base64: base64,
          },
        ],
        function (res) {
          console.log("[API] uploadPhoto 返回", res);
          PhotoUpload.hideLoading();
          if (sid !== PhotoUpload.state.sessionId) return; // 会话已切换，丢弃
          if (res.code != 0) {
            PhotoUpload.showToast("上传失败", res.msg || "请重试", "error");
            return;
          }
          if (!PhotoUpload.state.photos[typeCode]) {
            PhotoUpload.state.photos[typeCode] = [];
          }
          PhotoUpload.state.photos[typeCode].push({ url: res.data.url });
          PhotoUpload.renderPhotoTypeCards();
        },
      );
    });
  },

  findPhotoType: function (typeCode) {
    for (var i = 0; i < PhotoUpload.state.photoTypes.length; i++) {
      if (PhotoUpload.state.photoTypes[i].typeCode == typeCode) return PhotoUpload.state.photoTypes[i];
    }
    return null;
  },

  // ============== 照片压缩（含 EXIF 旋转修正） ==============
  compressImage: function (file, callback) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        var width = img.width;
        var height = img.height;
        var orientation = PhotoUpload.readExifOrientation(e.target.result);

        // 限制最大尺寸
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

        // 按 EXIF Orientation 旋转/翻转（6=右旋90° 8=左旋90° 3=180°）
        switch (orientation) {
          case 3:
            canvas.width = width;
            canvas.height = height;
            ctx.translate(width, height);
            ctx.rotate(Math.PI);
            break;
          case 6:
            canvas.width = height;
            canvas.height = width;
            ctx.translate(height, 0);
            ctx.rotate(Math.PI / 2);
            break;
          case 8:
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
        PhotoUpload.showToast("错误", "图片读取失败，请重试", "error");
      };
      img.src = e.target.result;
    };
    reader.onerror = function () {
      PhotoUpload.showToast("错误", "图片读取失败，请重试", "error");
    };
    reader.readAsDataURL(file);
  },

  // ============== 照片删除 ==============
  deletePhoto: function (typeCode, index) {
    if (!PhotoUpload.state.photos[typeCode]) return;
    PhotoUpload.state.photos[typeCode].splice(index, 1);
    PhotoUpload.renderPhotoTypeCards();
  },

  // ============== 照片预览（骨架预埋，每次打开重置状态并绑定事件） ==============
  showPhotoPreview: function (url) {
    var $mask = $("#tpl-preview");
    var $img = $("#preview-img");
    var $panner = $("#preview-panner");
    var $vp = $("#preview-viewport");

    var scale = 1;
    var panX = 0;
    var panY = 0;
    var imgW = 0;
    var imgH = 0;

    // 解绑旧事件，避免重复绑定（缩放状态每次打开重置）
    $img.off("dblclick load");
    $vp.off("wheel touchstart touchmove touchend touchcancel");
    $mask.off("mousedown");
    $("#tpl-preview .photo-preview-close").off("click");

    $img.attr("src", url);

    function apply() {
      $panner.css("transform", "translate(" + panX + "px, " + panY + "px)");
      $img.css("transform", "scale(" + scale + ")");
    }

    function centerImage() {
      var vpW = $vp.width();
      var vpH = $vp.height();
      imgW = $img.width();
      imgH = $img.height();
      panX = (vpW - imgW) / 2;
      panY = (vpH - imgH) / 2;
      scale = 1;
      apply();
    }

    function getViewportPos(clientX, clientY) {
      var rect = $vp[0].getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    }

    // zoomAt: 以视口坐标 (fx, fy) 为锚点，缩放到 newScale
    function zoomAt(fx, fy, newScale) {
      newScale = Math.max(0.5, Math.min(5, newScale));
      if (newScale == scale) return;
      // 缩放前后，图像上同一点在视口上位置不变
      var ratio = newScale / scale;
      panX = fx - (fx - panX) * ratio;
      panY = fy - (fy - panY) * ratio;
      scale = newScale;
      apply();
    }

    function close() {
      $mask.addClass("hidden");
    }

    // 双击
    $img.on("dblclick", function (e) {
      e.preventDefault();
      var pos = getViewportPos(e.clientX, e.clientY);
      if (scale > 1.05) {
        centerImage();
      } else {
        zoomAt(pos.x, pos.y, 2.5);
      }
    });

    // 滚轮
    $vp.on("wheel", function (e) {
      e.preventDefault();
      var pos = getViewportPos(e.originalEvent.clientX, e.originalEvent.clientY);
      var delta = e.originalEvent.deltaY > 0 ? -0.2 : 0.2;
      zoomAt(pos.x, pos.y, scale + delta);
    });

    // 触摸
    var dragBaseX, dragBaseY, isDragging;
    var pinchDist0, pinchScale0, pinchPanX0, pinchPanY0;

    $vp.on("touchstart", function (e) {
      var t = e.originalEvent.touches;
      if (t.length == 1) {
        isDragging = true;
        dragBaseX = t[0].clientX - panX;
        dragBaseY = t[0].clientY - panY;
      } else if (t.length == 2) {
        isDragging = false;
        pinchScale0 = scale;
        pinchPanX0 = panX;
        pinchPanY0 = panY;
        var dx = t[0].clientX - t[1].clientX;
        var dy = t[0].clientY - t[1].clientY;
        pinchDist0 = Math.sqrt(dx * dx + dy * dy);
      }
    });

    $vp.on("touchmove", function (e) {
      var t = e.originalEvent.touches;
      if (t.length == 1 && isDragging) {
        panX = t[0].clientX - dragBaseX;
        panY = t[0].clientY - dragBaseY;
        apply();
      } else if (t.length == 2 && pinchDist0 > 0) {
        var dx = t[0].clientX - t[1].clientX;
        var dy = t[0].clientY - t[1].clientY;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var newScale = Math.max(0.5, Math.min(5, pinchScale0 * (dist / pinchDist0)));

        var cx = (t[0].clientX + t[1].clientX) / 2;
        var cy = (t[0].clientY + t[1].clientY) / 2;
        var pos = getViewportPos(cx, cy);

        var ratio = newScale / pinchScale0;
        panX = pos.x - ratio * (pos.x - pinchPanX0);
        panY = pos.y - ratio * (pos.y - pinchPanY0);
        scale = newScale;
        apply();
      }
    });

    $vp.on("touchend touchcancel", function () {
      isDragging = false;
      pinchDist0 = 0;
    });

    // 关闭
    $mask.on("mousedown", function (e) {
      if (e.target == this) close();
    });
    $("#tpl-preview .photo-preview-close").on("click", close);

    // 图片加载后居中
    function init() {
      setTimeout(centerImage, 50);
    }
    if ($img[0].complete && $img[0].naturalWidth) {
      init();
    } else {
      $img.on("load", init);
    }

    $mask.removeClass("hidden");
  },

  // ============== 数据构建（保存/提交共用） ==============
  buildPhotoList: function () {
    var s = PhotoUpload.state;
    return s.photoTypes.map(function (pt) {
      return {
        photoType: pt.typeCode,
        urlList: (s.photos[pt.typeCode] || []).map(function (p) {
          return p.url;
        }),
      };
    });
  },

  buildSubmitData: function (photoList, saveType) {
    var s = PhotoUpload.state;
    return {
      stationCode: s.stationCode,
      orderNo: s.orderNo,
      operator: window.Operator,
      machineCode: s.orderInfo.machineCode,
      vin: s.orderInfo.vin,
      templateId: s.selectedTemplateId,
      templateImageUrl: s.selectedTemplateUrl,
      saveType: saveType, // 'submit'=提交AI检测 / 'save'=保存工位照片信息
      photos: photoList,
    };
  },

  // ============== 按钮状态（两按钮交互一致） ==============
  updateButtons: function () {
    var $btn = $("#btn-confirm");
    var $save = $("#btn-save");
    var s = PhotoUpload.state;

    if (!s.configLoaded || !s.photoTypes.length) {
      $btn.prop("disabled", true);
      $save.prop("disabled", true).addClass("btn-disabled");
      return;
    }

    // 有模板时必须选了模板才能提交
    var templates = s.orderInfo.templates || [];
    if (templates.length > 0 && !s.selectedTemplateId) {
      $btn.prop("disabled", true).addClass("btn-disabled");
      $save.prop("disabled", true).addClass("btn-disabled");
      return;
    }

    var allReachedMin = true;
    for (var i = 0; i < s.photoTypes.length; i++) {
      var pt = s.photoTypes[i];
      var taken = (s.photos[pt.typeCode] || []).length;
      if (taken < pt.minCount) {
        allReachedMin = false;
        break;
      }
    }

    if (allReachedMin) {
      $btn.prop("disabled", false).removeClass("btn-disabled");
      $save.prop("disabled", false).removeClass("btn-disabled");
    } else {
      $btn.prop("disabled", true).addClass("btn-disabled");
      $save.prop("disabled", true).addClass("btn-disabled");
    }
  },

  // ============== 提交/保存（交互一致，仅 saveType 区分后台逻辑） ==============
  handleSubmit: function (saveType) {
    var s = PhotoUpload.state;
    if (s.submitting) return;

    // 有模板时必须选择
    var templates = s.orderInfo.templates || [];
    if (templates.length > 0 && !s.selectedTemplateId) {
      PhotoUpload.showToast("提示", "请选择铭牌模板", "error");
      return;
    }

    // 照片数量校验
    var errors = [];
    for (var i = 0; i < s.photoTypes.length; i++) {
      var pt = s.photoTypes[i];
      var taken = (s.photos[pt.typeCode] || []).length;
      if (taken < pt.minCount) {
        errors.push("「" + pt.typeName + "」还需拍摄 " + (pt.minCount - taken) + " 张（至少 " + pt.minCount + " 张）");
      }
    }

    if (errors.length) {
      PhotoUpload.showToast("照片未完成", errors.join("<br>"), "error");
      return;
    }

    // 保存：无需二次确认，直接提交；提交AI检测：需二次确认
    if (saveType == "save") {
      PhotoUpload.doSubmit(saveType);
      return;
    }
    PhotoUpload.showConfirmDialog("车辆所有工位铭牌是否全部上传", function () {
      PhotoUpload.doSubmit(saveType);
    });
  },

  doSubmit: function (saveType) {
    var isSave = saveType == "save";
    var actionText = isSave ? "保存" : "提交";
    var photoList = PhotoUpload.buildPhotoList();
    var submitData = PhotoUpload.buildSubmitData(photoList, saveType);

    PhotoUpload.state.submitting = true;
    var $btn = $("#btn-confirm");
    var $save = $("#btn-save");
    $btn.prop("disabled", true);
    $save.prop("disabled", true);
    if (isSave) {
      $save.text("保存中...");
    } else {
      $btn.text("提交中...");
    }

    PhotoUpload.showLoading(actionText + "中...");

    console.log("[API] submitPhotoRecord(" + saveType + ")", submitData);
    PhotoUpload.apiCall(window.submitPhotoRecord, [submitData], function (res) {
      console.log("[API] submitPhotoRecord(" + saveType + ") 返回", res);
      PhotoUpload.hideLoading();
      PhotoUpload.state.submitting = false;
      // 恢复按钮：文案从 data-label 缓存读取（初始文案只定义在 index.html 骨架）
      $btn.prop("disabled", false).text($btn.data("label"));
      $save.prop("disabled", false).text($save.data("label"));

      if (res.code != 0) {
        PhotoUpload.showToast(actionText + "失败", res.msg || "请稍后重试", "error");
        return;
      }

      var totalPhotos = 0;
      for (var k = 0; k < photoList.length; k++) {
        totalPhotos += photoList[k].urlList.length;
      }

      // 成功详情：rows 数组 → toast 内部克隆 tpl-detail-row 填充
      var rows = [
        { label: "工位", value: PhotoUpload.state.stationCode },
        { label: "订单号", value: PhotoUpload.state.orderNo },
        { label: "主机编码", value: PhotoUpload.state.orderInfo.machineCode },
        { label: "VIN", value: PhotoUpload.state.orderInfo.vin || "-" },
        { label: "照片总数", value: totalPhotos + " 张" },
      ];
      PhotoUpload.state.photoTypes.forEach(function (pt) {
        var count = (PhotoUpload.state.photos[pt.typeCode] || []).length;
        rows.push({ label: pt.typeName, value: count + " 张（" + pt.minCount + "~" + pt.maxCount + "）" });
      });

      PhotoUpload.showToast(actionText + "成功", rows, "success", function () {
        PhotoUpload.resetForm();
      });
    });
  },

  // ============== 重置表单 ==============
  resetForm: function () {
    var s = PhotoUpload.state;
    s.stationCode = "";
    s.orderNo = "";
    s.photoTypes = [];
    s.photos = {};
    s.submitting = false;
    s.configLoaded = false;
    s.formCollapsed = false;
    s.orderInfoCollapsed = false;
    s.orderInfo = { machineCode: "", vin: "", templates: [] };
    s.selectedTemplateId = "";
    s.selectedTemplateName = "";
    s.selectedTemplateUrl = "";

    PhotoUpload.hideResultAreas();
    PhotoUpload.renderForm();
    PhotoUpload.loadStationList();
    window.scrollTo({ top: 0, behavior: "smooth" });
  },

  // ============== 事件绑定（一次性委托，页面加载时执行） ==============
  initEvents: function () {
    // 工位输入框
    $("#form-area").on("focus input click", "#input-station", function () {
      PhotoUpload.showStationDropdown();
    });
    $("#form-area").on("input", "#input-station", function () {
      $("#input-station-code").val("");
      PhotoUpload.state.stationCode = "";
      if (PhotoUpload.state.configLoaded) {
        PhotoUpload.state.configLoaded = false;
        PhotoUpload.hideResultAreas();
      }
    });

    // 下拉选项点击（mousedown 先于 document 关闭逻辑）
    $("#form-area").on("mousedown", ".combobox-item", function () {
      PhotoUpload.selectStation($(this).data("code"), $(this).data("name"));
    });

    // 下拉箭头点击
    $("#form-area").on("click", ".combobox-arrow", function () {
      var $dd = $("#dropdown-station");
      if ($dd.is(":visible")) {
        $dd.hide();
      } else {
        PhotoUpload.showStationDropdown();
      }
    });

    // 点击页面其他地方关闭下拉
    $(document).on("mousedown", function (e) {
      if (!$(e.target).closest("#combobox-station").length) {
        $("#dropdown-station").hide();
        if (PhotoUpload.state.stationCode) {
          $("#input-station").val(PhotoUpload.getStationDisplay(PhotoUpload.state.stationCode));
        }
      }
    });

    // 工位输入框回车
    $("#form-area").on("keypress", "#input-station", function (e) {
      if (e.which != 13) {
        $("#dropdown-station").hide();
        return;
      }
      $("#dropdown-station").hide();
      if (!PhotoUpload.state.stationCode) {
        var val = $(this).val().trim();
        if (val) {
          for (var i = 0; i < PhotoUpload.state.stations.length; i++) {
            if (PhotoUpload.state.stations[i].stationCode.toUpperCase() == val.toUpperCase()) {
              PhotoUpload.selectStation(PhotoUpload.state.stations[i].stationCode, PhotoUpload.state.stations[i].stationName);
              break;
            }
          }
        }
      }
    });

    // 查询按钮
    $("#form-area").on("click", "#btn-query", function () {
      PhotoUpload.doQueryPhotoConfig();
    });

    // 表单卡片头：点击折叠/展开（与订单信息一致）
    $("#form-area").on("click", "#btn-toggle-form", function () {
      PhotoUpload.toggleForm();
    });

    // 清空（header 清空图标 + 查询前清空按钮，class 委托）
    $("#form-area").on("click", ".btn-clear-form", function () {
      PhotoUpload.clearForm();
    });

    // 扫码按钮
    $("#form-area").on("click", "#btn-scan-order", function () {
      PhotoUpload.doScan("input-order", PhotoUpload.doQueryPhotoConfig);
    });

    // 订单号回车
    $("#form-area").on("keypress", "#input-order", function (e) {
      if (e.which != 13) return;
      PhotoUpload.doQueryPhotoConfig();
    });

    // 照片卡片区：拍照/预览/删除（委托，typeCode 从 data 属性读取，避免拼选择器）
    $("#photo-cards-area").on("click", ".photo-add", function () {
      PhotoUpload.handleTakePhoto($(this).data("type"));
    });
    $("#photo-cards-area").on("click", ".photo-item img", function () {
      var $item = $(this).closest(".photo-item");
      var typeCode = $item.data("type");
      var index = parseInt($item.data("index"));
      var list = PhotoUpload.state.photos[typeCode] || [];
      if (list[index]) PhotoUpload.showPhotoPreview(list[index].url);
    });
    $("#photo-cards-area").on("click", ".photo-delete", function (e) {
      e.stopPropagation();
      var $item = $(this).closest(".photo-item");
      PhotoUpload.deletePhoto($item.data("type"), parseInt($item.data("index")));
    });

    // 文件选择
    $("#photo-input").on("change", function () {
      var files = this.files;
      if (!files || files.length == 0) return;
      var currentType = $(this).data("current-type");
      PhotoUpload.handleFileSelect(files, currentType);
      $(this).val("");
    });

    // 底部按钮区
    $("#confirm-section").on("click", "#btn-save", function () {
      PhotoUpload.handleSubmit("save");
    });
    $("#confirm-section").on("click", "#btn-confirm", function () {
      PhotoUpload.handleSubmit("submit");
    });

    // 订单信息区：模板选择/预览/折叠
    $("#order-info-area").on("click", ".pick-template-btn", function () {
      if (!PhotoUpload.state.orderInfo.templates || !PhotoUpload.state.orderInfo.templates.length) return;
      PhotoUpload.showTemplatePicker(PhotoUpload.state.orderInfo.templates, function (templateId, templateName, templateUrl) {
        if (templateId) {
          var s = PhotoUpload.state;
          s.selectedTemplateId = templateId;
          s.selectedTemplateName = templateName;
          s.selectedTemplateUrl = templateUrl;
          PhotoUpload.renderOrderInfo();
          PhotoUpload.updateButtons();
        }
      });
    });
    $("#order-info-area").on("click", ".template-image", function () {
      var url = $(this).attr("src");
      if (url) PhotoUpload.showPhotoPreview(url);
    });
    $("#order-info-area").on("click", "#btn-toggle-order-info", function () {
      PhotoUpload.state.orderInfoCollapsed = !PhotoUpload.state.orderInfoCollapsed;
      PhotoUpload.renderOrderInfo();
    });

    // ===== 弹窗骨架（常驻，事件绑一次） =====
    // Toast：点击遮罩或确定按钮关闭
    $("#tpl-toast").on("click", function (e) {
      if (e.target == this || $(e.target).hasClass("toast-btn")) {
        var cb = $("#tpl-toast").data("close-callback");
        if (cb) cb();
      }
    });
    // 二次确认：取消/遮罩关闭，确定执行回调
    $("#tpl-confirm").on("click", function (e) {
      if (e.target == this || $(e.target).hasClass("confirm-btn-cancel")) {
        $(this).addClass("hidden");
      } else if ($(e.target).hasClass("confirm-btn-ok")) {
        var cb = $(this).data("on-confirm");
        $(this).addClass("hidden");
        if (cb) cb();
      }
    });
    // 模板选择：列表项/取消/遮罩
    $("#picker-list").on("click", ".picker-item", function () {
      var cb = $("#tpl-picker").data("on-pick");
      $("#tpl-picker").addClass("hidden");
      if (cb) cb($(this).data("id"), $(this).data("name"), $(this).data("url"));
    });
    $("#tpl-picker .picker-btn").on("click", function () {
      $("#tpl-picker").addClass("hidden");
    });
    $("#tpl-picker").on("click", function (e) {
      if (e.target == this) $(this).addClass("hidden");
    });
  },

  // ============== 页面初始化 ==============
  initPage: function () {
    // 缓存按钮初始文案（骨架在 index.html，JS 恢复时用，避免双重定义）
    $("#btn-confirm").data("label", $("#btn-confirm").text());
    $("#btn-save").data("label", $("#btn-save").text());

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

    // 绑定事件（一次，委托）
    PhotoUpload.initEvents();

    // 渲染初始表单状态（查询前：独立清空按钮可见）
    PhotoUpload.renderForm();

    // 加载工位列表
    PhotoUpload.loadStationList();
  },
};

// ============== 启动 ==============
$(function () {
  PhotoUpload.initPage();
});
