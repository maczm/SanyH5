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
 *   JS 通过 if (typeof window.xxx !== 'function') 检测自动使用真实函数
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
// 所有页面逻辑挂在 NameplatePhotoUpload 下，避免全局函数互相覆盖（Portal 同 iframe 切页场景）
var NameplatePhotoUpload = {
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
  _loadingCount: 0,       // loading 引用计数（并发上传时避免提前消失）

  // ============== 模板克隆 ==============
  /**
   * 克隆 <template> 骨架并返回 jQuery 对象（取根元素，保证 .data() 落在真实 DOM 节点上）
   * @param {string} id - template 元素 id（不含 #）
   */
  cloneTemplate: function (id) {
    var frag = document.getElementById(id).content.cloneNode(true);
    return $(frag.firstElementChild); // 所有 template 均为单根结构
  },

  // ============== 工具函数 ==============

  /**
   * API 调用包装：统一加超时兜底，防止 Portal 函数永不回调时页面卡死。
   * fn 为 window 注入的函数（callback 风格），args 为除 callback 外的参数数组。
   */
  apiCall: function (fn, args, callback, timeout) {
    var done = false;
    var timer = setTimeout(function () {
      if (done) return;
      done = true;
      callback({ code: -1, msg: "请求超时，请重试" });
    }, timeout || CONFIG.API_TIMEOUT);
    args = args || [];
    fn.apply(null, args.concat([function (res) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      callback(res);
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

  // ============== 加载动画（骨架预埋，仅显隐+填值；引用计数支持并发） ==============
  showLoading: function (text) {
    NameplatePhotoUpload._loadingCount++;
    $("#loading-text").text(text || "加载中...");
    $("#template-loading").removeClass("hidden");
  },

  hideLoading: function () {
    NameplatePhotoUpload._loadingCount = Math.max(0, NameplatePhotoUpload._loadingCount - 1);
    if (NameplatePhotoUpload._loadingCount === 0) {
      $("#template-loading").addClass("hidden");
    }
  },

  // ============== Toast 消息提示框（骨架预埋，仅显隐+填值） ==============
  // content 支持三种形态：null（无内容区）/ string（单行文本）/ array（[{label,value}] 详情行）
  showToast: function (title, content, type, callback) {
    var $toast = $("#template-toast");
    if (NameplatePhotoUpload._toastTimer) {
      clearTimeout(NameplatePhotoUpload._toastTimer);
      NameplatePhotoUpload._toastTimer = null;
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
        var $r = NameplatePhotoUpload.cloneTemplate("template-detail-row");
        $r.find(".detail-label").text(row.label);
        $r.find(".detail-value").text(row.value);
        $content.append($r);
      });
    } else {
      $content.addClass("hidden");
    }

    function close() {
      if (NameplatePhotoUpload._toastTimer) {
        clearTimeout(NameplatePhotoUpload._toastTimer);
        NameplatePhotoUpload._toastTimer = null;
      }
      if ($toast.hasClass("hidden")) return;
      $toast.addClass("hidden");
      if (callback) callback();
    }

    // 关闭回调挂到 data（事件在 initEvents 一次性委托）
    $toast.data("close-callback", close);
    $toast.removeClass("hidden");

    if (type !== "error") {
      NameplatePhotoUpload._toastTimer = setTimeout(close, 3000);
    }
  },

  // ============== 二次确认弹窗（骨架预埋） ==============
  showConfirmDialog: function (message, onConfirm) {
    $("#confirm-content").text(message);
    $("#template-confirm").data("on-confirm", onConfirm).removeClass("hidden");
  },

  // ============== 模板选择弹窗（骨架预埋 + 列表克隆） ==============
  showTemplatePicker: function (templates, callback) {
    var $list = $("#picker-list");
    $list.empty();
    templates.forEach(function (template) {
      var $item = NameplatePhotoUpload.cloneTemplate("template-picker-item");
      $item.find("img").attr("src", template.templateImageUrl).attr("alt", template.templateName);
      $item.find(".picker-item-name").text(template.templateName);
      $item.data("id", template.templateId).data("name", template.templateName).data("url", template.templateImageUrl);
      $list.append($item);
    });
    $("#template-picker").data("on-pick", callback).removeClass("hidden");
  },

  // ============== 表单渲染（骨架已静态化，此处仅切换状态与回填值） ==============
  // 与订单信息一致：查询后显示卡片头（点击折叠/展开），查询前无头完整显示
  renderForm: function () {
    var state = NameplatePhotoUpload.state;
    var $header = $("#btn-toggle-form");
    var $body = $("#form-card-body");

    if (state.configLoaded) {
      $header.removeClass("hidden");
      $(".form-arrow .arrow-down").toggleClass("hidden", !state.formCollapsed);
      $(".form-arrow .arrow-up").toggleClass("hidden", state.formCollapsed);
      $body.toggleClass("hidden", state.formCollapsed);
    } else {
      $header.addClass("hidden");
      $body.removeClass("hidden");
    }

    // 回填当前值
    $("#input-station").val(state.stationCode ? NameplatePhotoUpload.getStationDisplay(state.stationCode) : "");
    $("#input-station-code").val(state.stationCode);
    $("#input-order").val(state.orderNo);
  },

  getStationDisplay: function (stationCode) {
    for (var i = 0; i < NameplatePhotoUpload.state.stations.length; i++) {
      if (NameplatePhotoUpload.state.stations[i].stationCode === stationCode) {
        return NameplatePhotoUpload.state.stations[i].stationCode + " - " + NameplatePhotoUpload.state.stations[i].stationName;
      }
    }
    return stationCode;
  },

  // ============== 加载工位列表 ==============
  loadStationList: function () {
    console.log("[API] getStationList");
    NameplatePhotoUpload.apiCall(window.getStationList, [], function (res) {
      console.log("[API] getStationList 返回", res);
      if (res.code !== 0) {
        NameplatePhotoUpload.showToast("加载失败", res.msg || "获取工位列表失败", "error");
        return;
      }
      NameplatePhotoUpload.state.stations = res.data || [];

      if (NameplatePhotoUpload.state.stationCode) {
        $("#input-station").val(NameplatePhotoUpload.getStationDisplay(NameplatePhotoUpload.state.stationCode));
        $("#input-station-code").val(NameplatePhotoUpload.state.stationCode);
      }
    });
  },

  // ============== 工位筛选 ==============
  filterStations: function (keyword) {
    if (!keyword) return NameplatePhotoUpload.state.stations;
    var kw = keyword.toLowerCase();
    return NameplatePhotoUpload.state.stations.filter(function (station) {
      var code = (station.stationCode || "").toLowerCase();
      var name = (station.stationName || "").toLowerCase();
      return code.indexOf(kw) !== -1 || name.indexOf(kw) !== -1;
    });
  },

  showStationDropdown: function () {
    var keyword = $("#input-station").val().trim();
    var filtered = NameplatePhotoUpload.filterStations(keyword);
    var $dropdown = $("#dropdown-station");
    $dropdown.empty();

    if (!filtered.length) {
      $dropdown.append('<div class="combobox-empty">无匹配工位</div>');
    } else {
      filtered.forEach(function (state) {
        var $item = NameplatePhotoUpload.cloneTemplate("template-combobox-item");
        $item.find(".combobox-item-code").text(state.stationCode);
        $item.find(".combobox-item-name").text(state.stationName);
        $item.data("code", state.stationCode).data("name", state.stationName);
        $dropdown.append($item);
      });
    }
    $dropdown.show();
  },

  selectStation: function (stationCode, stationName) {
    NameplatePhotoUpload.state.stationCode = stationCode;
    $("#input-station").val(stationCode + " - " + stationName);
    $("#input-station-code").val(stationCode);
    $("#dropdown-station").hide();

    if (NameplatePhotoUpload.state.configLoaded) {
      NameplatePhotoUpload.state.configLoaded = false;
      NameplatePhotoUpload.hideResultAreas();
    }
  },

  hideResultAreas: function () {
    NameplatePhotoUpload.state.sessionId++; // 清空/切换会话：丢弃在途回调
    $("#order-info-area").addClass("hidden");
    $("#photo-cards-area .photo-type-card").remove(); // 保留预埋的 empty-state 骨架
    $("#empty-no-photo").addClass("hidden");
    $("#confirm-section").addClass("hidden");
  },

  // ============== 表单折叠/清空（折叠交互与订单信息一致：点卡片头切换） ==============
  toggleForm: function () {
    NameplatePhotoUpload.state.formCollapsed = !NameplatePhotoUpload.state.formCollapsed;
    NameplatePhotoUpload.renderForm();
  },

  clearForm: function () {
    var state = NameplatePhotoUpload.state;
    state.stationCode = "";
    state.orderNo = "";
    state.photoTypes = [];
    state.photos = {};
    state.configLoaded = false;
    state.formCollapsed = false;
    state.orderInfoCollapsed = false;
    state.orderInfo = { machineCode: "", vin: "", templates: [] };
    state.selectedTemplateId = "";
    state.selectedTemplateName = "";
    state.selectedTemplateUrl = "";

    NameplatePhotoUpload.hideResultAreas();
    NameplatePhotoUpload.renderForm();
    window.scrollTo({ top: 0, behavior: "smooth" });
  },

  // ============== 扫码 ==============
  doScan: function (inputId, callback) {
    try {
      if (window.parent && typeof window.parent.OpenCamera === "function") {
        window.parent.OpenCamera(function (res) {
          console.log("[Scan] OpenCamera 返回", res);
          var val = res.data || res.value || (typeof res === "string" ? res : "");
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
    NameplatePhotoUpload.showToast("提示", "扫码功能仅在移动端可用，请手动输入", "error");
  },

  // ============== 查询照片配置 ==============
  doQueryPhotoConfig: function () {
    var state = NameplatePhotoUpload.state;
    var stationCode = $("#input-station-code").val() || state.stationCode;
    var orderNo = $("#input-order").val().trim();

    if (!stationCode) {
      var typedVal = $("#input-station").val().trim();
      if (typedVal) {
        for (var i = 0; i < state.stations.length; i++) {
          var full = state.stations[i].stationCode + " - " + state.stations[i].stationName;
          if (full === typedVal) {
            stationCode = state.stations[i].stationCode;
            state.stationCode = stationCode;
            $("#input-station-code").val(stationCode);
            break;
          }
        }
      }
    }

    if (!stationCode) {
      NameplatePhotoUpload.showToast("提示", "请选择工位", "error");
      return;
    }
    if (!orderNo) {
      NameplatePhotoUpload.showToast("提示", "请输入订单号", "error");
      return;
    }

    state.stationCode = stationCode;
    state.orderNo = orderNo;

    NameplatePhotoUpload.showLoading("查询中...");
    console.log("[API] getPhotoConfig", { stationCode: stationCode, orderNo: orderNo });
    NameplatePhotoUpload.apiCall(window.getPhotoConfig, [{ stationCode: stationCode, orderNo: orderNo }], function (res) {
      console.log("[API] getPhotoConfig 返回", res);
      NameplatePhotoUpload.hideLoading();
      if (res.code !== 0) {
        NameplatePhotoUpload.showToast("查询失败", res.msg || "获取照片配置失败", "error");
        return;
      }

      state.sessionId++; // 新会话：丢弃在途上传回调
      state.photoTypes = res.data.photoTypes || [];
      state.orderInfo = res.data.orderInfo || { machineCode: "", vin: "", templates: [] };
      state.photos = {};
      state.configLoaded = true;

      // 铭牌模板处理
      var templates = state.orderInfo.templates || [];
      if (templates.length === 1) {
        state.selectedTemplateId = templates[0].templateId;
        state.selectedTemplateName = templates[0].templateName || "";
        state.selectedTemplateUrl = templates[0].templateImageUrl;
      } else {
        state.selectedTemplateId = "";
        state.selectedTemplateName = "";
        state.selectedTemplateUrl = "";
      }

      for (var i = 0; i < state.photoTypes.length; i++) {
        state.photos[state.photoTypes[i].typeCode] = [];
      }

      // 查询成功：表单与订单信息默认展开（折叠交互一致：点卡片头切换）
      state.formCollapsed = false;
      state.orderInfoCollapsed = false;
      NameplatePhotoUpload.renderForm();
      NameplatePhotoUpload.renderOrderInfo();
      NameplatePhotoUpload.renderPhotoTypeCards();
      NameplatePhotoUpload.updateButtons();
      $("#photo-cards-area").removeClass("hidden");
      // 无照片类型（无需拍照工位）：不显示保存/提交按钮
      if (state.photoTypes.length) {
        $("#confirm-section").removeClass("hidden");
      } else {
        $("#confirm-section").addClass("hidden");
      }

      setTimeout(function () {
        $("#order-info-area")[0].scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    });
  },

  // ============== 订单信息渲染（body 多态块切换，骨架在 index.html） ==============
  renderOrderInfo: function () {
    var state = NameplatePhotoUpload.state;
    var $area = $("#order-info-area");

    // 无订单信息：整区隐藏
    if (!state.orderInfo || (!state.orderInfo.machineCode && (!state.orderInfo.templates || !state.orderInfo.templates.length))) {
      $area.addClass("hidden");
      return;
    }
    $area.removeClass("hidden");

    // 折叠箭头双态切换
    $(".order-info-arrow .arrow-down").toggleClass("hidden", !state.orderInfoCollapsed);
    $(".order-info-arrow .arrow-up").toggleClass("hidden", state.orderInfoCollapsed);

    // 折叠：body 收起（多态块全部隐藏）
    $("#order-info-body").toggleClass("hidden", state.orderInfoCollapsed);
    if (state.orderInfoCollapsed) return;

    // 态A：主机编码 + VIN
    var hasMachVin = !!(state.orderInfo.machineCode || state.orderInfo.vin);
    $("#block-machine-vin").toggleClass("hidden", !hasMachVin);
    $("#machine-code-value").text(state.orderInfo.machineCode || "-");
    $("#vin-value").text(state.orderInfo.vin || "-");

    // 态B/C/D：模板三态互斥
    $("#block-template-single").addClass("hidden");
    $("#block-template-selected").addClass("hidden");
    $("#block-template-none").addClass("hidden");

    var templates = state.orderInfo.templates || [];
    if (templates.length === 1) {
      // 单模板：自动选中
      $("#block-template-single").removeClass("hidden");
      $("#template-single-name-value").text(templates[0].templateName || "");
      $("#template-single-image").attr("src", templates[0].templateImageUrl);
    } else if (state.selectedTemplateId) {
      // 多模板已选
      $("#block-template-selected").removeClass("hidden");
      $("#template-selected-name-value").text(state.selectedTemplateName);
      $("#template-selected-image").attr("src", state.selectedTemplateUrl);
    } else if (templates.length > 1) {
      // 多模板未选
      $("#block-template-none").removeClass("hidden");
      $("#block-template-none .btn-pick-template-inline").text("点击选择（" + templates.length + "个可选）");
    }
  },

  // ============== 照片类型卡片渲染（克隆 template-photo-card / template-photo-item） ==============
  renderPhotoTypeCards: function () {
    var $area = $("#photo-cards-area");
    var state = NameplatePhotoUpload.state;
    $area.find(".photo-type-card").remove();
    $("#empty-no-photo").addClass("hidden");

    if (!state.photoTypes.length) {
      // 空态提示：骨架在 index.html；无照片类型不显示保存/提交按钮
      $("#empty-no-photo").removeClass("hidden");
      $("#confirm-section").addClass("hidden");
      return;
    }

    state.photoTypes.forEach(function (photoType) {
      var $card = NameplatePhotoUpload.cloneTemplate("template-photo-card");
      $card.attr("data-type", photoType.typeCode);
      $card.find(".card-title").text(photoType.typeName);
      $card.find(".photo-add").attr("data-type", photoType.typeCode);

      var takenCount = (state.photos[photoType.typeCode] || []).length;
      var reachedMin = takenCount >= photoType.minCount;
      var reachedMax = takenCount >= photoType.maxCount;

      // 徽章：done（打勾）/ pending（x/y~z）
      $card.find(".card-badge").toggleClass("done", reachedMin);
      $card.find(".badge-check").toggleClass("hidden", !reachedMin);
      $card.find(".badge-text").text(reachedMin ? "已完成" : takenCount + "/" + photoType.minCount + "~" + photoType.maxCount);

      // 进度条
      var progressPct = reachedMin ? 100 : Math.min(100, (takenCount / photoType.minCount) * 100);
      $card.find(".progress-fill").css("width", progressPct + "%");
      $card.toggleClass("complete", reachedMin);

      // 缩略图列表
      var $list = $card.find(".photo-thumb-list");
      (state.photos[photoType.typeCode] || []).forEach(function (p, j) {
        var $item = NameplatePhotoUpload.cloneTemplate("template-photo-item");
        $item.attr("data-type", photoType.typeCode).attr("data-index", j);
        $item.find("img").attr("src", p.url);
        $list.append($item);
      });

      // 拍照按钮 / 已达上限
      $card.find(".photo-add").toggleClass("hidden", reachedMax);
      $card.find(".photo-full-tip").toggleClass("hidden", !reachedMax);

      $area.append($card);
    });

    NameplatePhotoUpload.updateButtons();
  },

  // ============== 拍照处理 ==============
  handleTakePhoto: function (typeCode) {
    $("#photo-input").data("current-type", typeCode);
    $("#photo-input").click();
  },

  handleFileSelect: function (files, typeCode) {
    if (!typeCode) return;

    var photoType = NameplatePhotoUpload.findPhotoType(typeCode);
    if (!photoType) return;

    var state = NameplatePhotoUpload.state;
    var takenCount = (state.photos[typeCode] || []).length;
    if (takenCount >= photoType.maxCount) {
      NameplatePhotoUpload.showToast("提示", "「" + photoType.typeName + "」已达到最大数量 " + photoType.maxCount + " 张", "error");
      return;
    }

    var file = files[0];
    var sessionIdSnapshot = state.sessionId; // 归属快照：回调时校验，防止串单

    NameplatePhotoUpload.compressImage(file, function (base64) {
      if (sessionIdSnapshot !== NameplatePhotoUpload.state.sessionId) return; // 会话已切换，丢弃
      NameplatePhotoUpload.showLoading("上传中...");
      console.log("[API] uploadPhoto", {
        photoType: typeCode,
        stationCode: NameplatePhotoUpload.state.stationCode,
        orderNo: NameplatePhotoUpload.state.orderNo,
        base64: base64.substring(0, 80) + "...",
      });
      NameplatePhotoUpload.apiCall(
        window.uploadPhoto,
        [
          {
            photoType: typeCode,
            stationCode: NameplatePhotoUpload.state.stationCode,
            orderNo: NameplatePhotoUpload.state.orderNo,
            base64: base64,
          },
        ],
        function (res) {
          console.log("[API] uploadPhoto 返回", res);
          NameplatePhotoUpload.hideLoading();
          if (sessionIdSnapshot !== NameplatePhotoUpload.state.sessionId) return; // 会话已切换，丢弃
          if (res.code !== 0) {
            NameplatePhotoUpload.showToast("上传失败", res.msg || "请重试", "error");
            return;
          }
          if (!NameplatePhotoUpload.state.photos[typeCode]) {
            NameplatePhotoUpload.state.photos[typeCode] = [];
          }
          NameplatePhotoUpload.state.photos[typeCode].push({ url: res.data.url });
          NameplatePhotoUpload.renderPhotoTypeCards();
        },
      );
    });
  },

  findPhotoType: function (typeCode) {
    for (var i = 0; i < NameplatePhotoUpload.state.photoTypes.length; i++) {
      if (NameplatePhotoUpload.state.photoTypes[i].typeCode === typeCode) return NameplatePhotoUpload.state.photoTypes[i];
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
        var orientation = NameplatePhotoUpload.readExifOrientation(e.target.result);

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
        NameplatePhotoUpload.showToast("错误", "图片读取失败，请重试", "error");
      };
      img.src = e.target.result;
    };
    reader.onerror = function () {
      NameplatePhotoUpload.showToast("错误", "图片读取失败，请重试", "error");
    };
    reader.readAsDataURL(file);
  },

  // ============== 照片删除 ==============
  deletePhoto: function (typeCode, index) {
    if (!NameplatePhotoUpload.state.photos[typeCode]) return;
    NameplatePhotoUpload.state.photos[typeCode].splice(index, 1);
    NameplatePhotoUpload.renderPhotoTypeCards();
  },

  // ============== 照片预览（骨架预埋，每次打开重置状态并绑定事件） ==============
  showPhotoPreview: function (url) {
    var $mask = $("#template-preview");
    var $image = $("#preview-image");
    var $panner = $("#preview-panner");
    var $viewport = $("#preview-viewport");

    var scale = 1;
    var panX = 0;
    var panY = 0;
    var imageWidth = 0;
    var imageHeight = 0;

    // 解绑旧事件，避免重复绑定（缩放状态每次打开重置）
    $image.off("dblclick load");
    $viewport.off("wheel touchstart touchmove touchend touchcancel");
    $mask.off("mousedown");
    $("#template-preview .photo-preview-close").off("click");

    $image.attr("src", url);

    function apply() {
      $panner.css("transform", "translate(" + panX + "px, " + panY + "px)");
      $image.css("transform", "scale(" + scale + ")");
    }

    function centerImage() {
      var vpW = $viewport.width();
      var vpH = $viewport.height();
      imageWidth = $image.width();
      imageHeight = $image.height();
      panX = (vpW - imageWidth) / 2;
      panY = (vpH - imageHeight) / 2;
      scale = 1;
      apply();
    }

    function getViewportPos(clientX, clientY) {
      var rect = $viewport[0].getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    }

    // zoomAt: 以视口坐标 (fx, fy) 为锚点，缩放到 newScale
    function zoomAt(fx, fy, newScale) {
      newScale = Math.max(0.5, Math.min(5, newScale));
      if (newScale === scale) return;
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
    $image.on("dblclick", function (e) {
      e.preventDefault();
      var pos = getViewportPos(e.clientX, e.clientY);
      if (scale > 1.05) {
        centerImage();
      } else {
        zoomAt(pos.x, pos.y, 2.5);
      }
    });

    // 滚轮
    $viewport.on("wheel", function (e) {
      e.preventDefault();
      var pos = getViewportPos(e.originalEvent.clientX, e.originalEvent.clientY);
      var delta = e.originalEvent.deltaY > 0 ? -0.2 : 0.2;
      zoomAt(pos.x, pos.y, scale + delta);
    });

    // 触摸
    var dragBaseX, dragBaseY, isDragging;
    var pinchDist0, pinchScale0, pinchPanX0, pinchPanY0;

    $viewport.on("touchstart", function (e) {
      var t = e.originalEvent.touches;
      if (t.length === 1) {
        isDragging = true;
        dragBaseX = t[0].clientX - panX;
        dragBaseY = t[0].clientY - panY;
      } else if (t.length === 2) {
        isDragging = false;
        pinchScale0 = scale;
        pinchPanX0 = panX;
        pinchPanY0 = panY;
        var dx = t[0].clientX - t[1].clientX;
        var dy = t[0].clientY - t[1].clientY;
        pinchDist0 = Math.sqrt(dx * dx + dy * dy);
      }
    });

    $viewport.on("touchmove", function (e) {
      var t = e.originalEvent.touches;
      if (t.length === 1 && isDragging) {
        panX = t[0].clientX - dragBaseX;
        panY = t[0].clientY - dragBaseY;
        apply();
      } else if (t.length === 2 && pinchDist0 > 0) {
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

    $viewport.on("touchend touchcancel", function () {
      isDragging = false;
      pinchDist0 = 0;
    });

    // 关闭
    $mask.on("mousedown", function (e) {
      if (e.target === this) close();
    });
    $("#template-preview .photo-preview-close").on("click", close);

    // 图片加载后居中
    function init() {
      setTimeout(centerImage, 50);
    }
    if ($image[0].complete && $image[0].naturalWidth) {
      init();
    } else {
      $image.on("load", init);
    }

    $mask.removeClass("hidden");
  },

  // ============== 数据构建（保存/提交共用） ==============
  buildPhotoList: function () {
    var state = NameplatePhotoUpload.state;
    return state.photoTypes.map(function (photoType) {
      return {
        photoType: photoType.typeCode,
        urlList: (state.photos[photoType.typeCode] || []).map(function (p) {
          return p.url;
        }),
      };
    });
  },

  buildSubmitData: function (photoList, saveType) {
    var state = NameplatePhotoUpload.state;
    return {
      stationCode: state.stationCode,
      orderNo: state.orderNo,
      operator: window.Operator,
      machineCode: state.orderInfo.machineCode,
      vin: state.orderInfo.vin,
      templateId: state.selectedTemplateId,
      templateImageUrl: state.selectedTemplateUrl,
      saveType: saveType, // 'submit'=提交AI检测 / 'save'=保存工位照片信息
      photos: photoList,
    };
  },

  // ============== 按钮状态（两按钮交互一致） ==============
  updateButtons: function () {
    var $confirmButton = $("#btn-confirm");
    var $saveButton = $("#btn-save");
    var state = NameplatePhotoUpload.state;

    if (!state.configLoaded || !state.photoTypes.length) {
      $confirmButton.prop("disabled", true);
      $saveButton.prop("disabled", true).addClass("btn-disabled");
      return;
    }

    // 有模板时必须选了模板才能提交
    var templates = state.orderInfo.templates || [];
    if (templates.length > 0 && !state.selectedTemplateId) {
      $confirmButton.prop("disabled", true).addClass("btn-disabled");
      $saveButton.prop("disabled", true).addClass("btn-disabled");
      return;
    }

    var allReachedMin = true;
    for (var i = 0; i < state.photoTypes.length; i++) {
      var photoType = state.photoTypes[i];
      var taken = (state.photos[photoType.typeCode] || []).length;
      if (taken < photoType.minCount) {
        allReachedMin = false;
        break;
      }
    }

    if (allReachedMin) {
      $confirmButton.prop("disabled", false).removeClass("btn-disabled");
      $saveButton.prop("disabled", false).removeClass("btn-disabled");
    } else {
      $confirmButton.prop("disabled", true).addClass("btn-disabled");
      $saveButton.prop("disabled", true).addClass("btn-disabled");
    }
  },

  // ============== 提交/保存（交互一致，仅 saveType 区分后台逻辑） ==============
  handleSubmit: function (saveType) {
    var state = NameplatePhotoUpload.state;
    if (state.submitting) return;

    // 有模板时必须选择
    var templates = state.orderInfo.templates || [];
    if (templates.length > 0 && !state.selectedTemplateId) {
      NameplatePhotoUpload.showToast("提示", "请选择铭牌模板", "error");
      return;
    }

    // 照片数量校验
    var errors = [];
    for (var i = 0; i < state.photoTypes.length; i++) {
      var photoType = state.photoTypes[i];
      var taken = (state.photos[photoType.typeCode] || []).length;
      if (taken < photoType.minCount) {
        errors.push("「" + photoType.typeName + "」还需拍摄 " + (photoType.minCount - taken) + " 张（至少 " + photoType.minCount + " 张）");
      }
    }

    if (errors.length) {
      NameplatePhotoUpload.showToast("照片未完成", errors.join("<br>"), "error");
      return;
    }

    // 保存：无需二次确认，直接提交；提交AI检测：需二次确认
    if (saveType === "save") {
      NameplatePhotoUpload.doSubmit(saveType);
      return;
    }
    NameplatePhotoUpload.showConfirmDialog("车辆所有工位铭牌是否全部上传", function () {
      NameplatePhotoUpload.doSubmit(saveType);
    });
  },

  doSubmit: function (saveType) {
    var isSave = saveType === "save";
    var actionText = isSave ? "保存" : "提交";
    var photoList = NameplatePhotoUpload.buildPhotoList();
    var submitData = NameplatePhotoUpload.buildSubmitData(photoList, saveType);

    NameplatePhotoUpload.state.submitting = true;
    var $confirmButton = $("#btn-confirm");
    var $saveButton = $("#btn-save");
    $confirmButton.prop("disabled", true);
    $saveButton.prop("disabled", true);
    if (isSave) {
      $saveButton.text("保存中...");
    } else {
      $confirmButton.text("提交中...");
    }

    NameplatePhotoUpload.showLoading(actionText + "中...");

    console.log("[API] submitPhotoRecord(" + saveType + ")", submitData);
    NameplatePhotoUpload.apiCall(window.submitPhotoRecord, [submitData], function (res) {
      console.log("[API] submitPhotoRecord(" + saveType + ") 返回", res);
      NameplatePhotoUpload.hideLoading();
      NameplatePhotoUpload.state.submitting = false;
      // 恢复按钮：文案从 data-label 缓存读取（初始文案只定义在 index.html 骨架）
      $confirmButton.prop("disabled", false).text($confirmButton.data("label"));
      $saveButton.prop("disabled", false).text($saveButton.data("label"));

      if (res.code !== 0) {
        NameplatePhotoUpload.showToast(actionText + "失败", res.msg || "请稍后重试", "error");
        return;
      }

      var totalPhotos = 0;
      for (var k = 0; k < photoList.length; k++) {
        totalPhotos += photoList[k].urlList.length;
      }

      // 成功详情：rows 数组 → toast 内部克隆 template-detail-row 填充
      var rows = [
        { label: "工位", value: NameplatePhotoUpload.state.stationCode },
        { label: "订单号", value: NameplatePhotoUpload.state.orderNo },
        { label: "主机编码", value: NameplatePhotoUpload.state.orderInfo.machineCode },
        { label: "VIN", value: NameplatePhotoUpload.state.orderInfo.vin || "-" },
        { label: "照片总数", value: totalPhotos + " 张" },
      ];
      NameplatePhotoUpload.state.photoTypes.forEach(function (photoType) {
        var count = (NameplatePhotoUpload.state.photos[photoType.typeCode] || []).length;
        rows.push({ label: photoType.typeName, value: count + " 张（" + photoType.minCount + "~" + photoType.maxCount + "）" });
      });

      NameplatePhotoUpload.showToast(actionText + "成功", rows, "success", function () {
        NameplatePhotoUpload.resetForm();
      });
    });
  },

  // ============== 重置表单 ==============
  resetForm: function () {
    var state = NameplatePhotoUpload.state;
    state.stationCode = "";
    state.orderNo = "";
    state.photoTypes = [];
    state.photos = {};
    state.submitting = false;
    state.configLoaded = false;
    state.formCollapsed = false;
    state.orderInfoCollapsed = false;
    state.orderInfo = { machineCode: "", vin: "", templates: [] };
    state.selectedTemplateId = "";
    state.selectedTemplateName = "";
    state.selectedTemplateUrl = "";

    NameplatePhotoUpload.hideResultAreas();
    NameplatePhotoUpload.renderForm();
    NameplatePhotoUpload.loadStationList();
    window.scrollTo({ top: 0, behavior: "smooth" });
  },

  // ============== 事件绑定（一次性委托，页面加载时执行） ==============
  initEvents: function () {
    // 工位输入框
    $("#form-area").on("focus input click", "#input-station", function () {
      NameplatePhotoUpload.showStationDropdown();
    });
    $("#form-area").on("input", "#input-station", function () {
      $("#input-station-code").val("");
      NameplatePhotoUpload.state.stationCode = "";
      if (NameplatePhotoUpload.state.configLoaded) {
        NameplatePhotoUpload.state.configLoaded = false;
        NameplatePhotoUpload.hideResultAreas();
      }
    });

    // 下拉选项点击（mousedown 先于 document 关闭逻辑）
    $("#form-area").on("mousedown", ".combobox-item", function () {
      NameplatePhotoUpload.selectStation($(this).data("code"), $(this).data("name"));
    });

    // 下拉箭头点击
    $("#form-area").on("click", ".combobox-arrow", function () {
      var $dropdown = $("#dropdown-station");
      if ($dropdown.is(":visible")) {
        $dropdown.hide();
      } else {
        NameplatePhotoUpload.showStationDropdown();
      }
    });

    // 点击页面其他地方关闭下拉
    $(document).on("mousedown", function (e) {
      if (!$(e.target).closest("#combobox-station").length) {
        $("#dropdown-station").hide();
        if (NameplatePhotoUpload.state.stationCode) {
          $("#input-station").val(NameplatePhotoUpload.getStationDisplay(NameplatePhotoUpload.state.stationCode));
        }
      }
    });

    // 工位输入框回车
    $("#form-area").on("keypress", "#input-station", function (e) {
      if (e.which !== 13) {
        $("#dropdown-station").hide();
        return;
      }
      $("#dropdown-station").hide();
      if (!NameplatePhotoUpload.state.stationCode) {
        var val = $(this).val().trim();
        if (val) {
          for (var i = 0; i < NameplatePhotoUpload.state.stations.length; i++) {
            if (NameplatePhotoUpload.state.stations[i].stationCode.toUpperCase() === val.toUpperCase()) {
              NameplatePhotoUpload.selectStation(NameplatePhotoUpload.state.stations[i].stationCode, NameplatePhotoUpload.state.stations[i].stationName);
              break;
            }
          }
        }
      }
    });

    // 查询按钮
    $("#form-area").on("click", "#btn-query", function () {
      NameplatePhotoUpload.doQueryPhotoConfig();
    });

    // 表单卡片头：点击折叠/展开（与订单信息一致）
    $("#form-area").on("click", "#btn-toggle-form", function () {
      NameplatePhotoUpload.toggleForm();
    });

    // 清空（header 清空图标 + 查询前清空按钮，class 委托）
    $("#form-area").on("click", ".btn-clear-form", function () {
      NameplatePhotoUpload.clearForm();
    });

    // 扫码按钮
    $("#form-area").on("click", "#btn-scan-order", function () {
      NameplatePhotoUpload.doScan("input-order", NameplatePhotoUpload.doQueryPhotoConfig);
    });

    // 订单号回车
    $("#form-area").on("keypress", "#input-order", function (e) {
      if (e.which !== 13) return;
      NameplatePhotoUpload.doQueryPhotoConfig();
    });

    // 照片卡片区：拍照/预览/删除（委托，typeCode 从 data 属性读取，避免拼选择器）
    $("#photo-cards-area").on("click", ".photo-add", function () {
      NameplatePhotoUpload.handleTakePhoto($(this).data("type"));
    });
    $("#photo-cards-area").on("click", ".photo-item img", function () {
      var $item = $(this).closest(".photo-item");
      var typeCode = $item.data("type");
      var index = parseInt($item.data("index"));
      var list = NameplatePhotoUpload.state.photos[typeCode] || [];
      if (list[index]) NameplatePhotoUpload.showPhotoPreview(list[index].url);
    });
    $("#photo-cards-area").on("click", ".photo-delete", function (e) {
      e.stopPropagation();
      var $item = $(this).closest(".photo-item");
      NameplatePhotoUpload.deletePhoto($item.data("type"), parseInt($item.data("index")));
    });

    // 文件选择
    $("#photo-input").on("change", function () {
      var files = this.files;
      if (!files || files.length === 0) return;
      var currentType = $(this).data("current-type");
      NameplatePhotoUpload.handleFileSelect(files, currentType);
      $(this).val("");
    });

    // 底部按钮区
    $("#confirm-section").on("click", "#btn-save", function () {
      NameplatePhotoUpload.handleSubmit("save");
    });
    $("#confirm-section").on("click", "#btn-confirm", function () {
      NameplatePhotoUpload.handleSubmit("submit");
    });

    // 订单信息区：模板选择/预览/折叠
    $("#order-info-area").on("click", ".pick-template-btn", function () {
      if (!NameplatePhotoUpload.state.orderInfo.templates || !NameplatePhotoUpload.state.orderInfo.templates.length) return;
      NameplatePhotoUpload.showTemplatePicker(NameplatePhotoUpload.state.orderInfo.templates, function (templateId, templateName, templateUrl) {
        if (templateId) {
          var state = NameplatePhotoUpload.state;
          state.selectedTemplateId = templateId;
          state.selectedTemplateName = templateName;
          state.selectedTemplateUrl = templateUrl;
          NameplatePhotoUpload.renderOrderInfo();
          NameplatePhotoUpload.updateButtons();
        }
      });
    });
    $("#order-info-area").on("click", ".template-image", function () {
      var url = $(this).attr("src");
      if (url) NameplatePhotoUpload.showPhotoPreview(url);
    });
    $("#order-info-area").on("click", "#btn-toggle-order-info", function () {
      NameplatePhotoUpload.state.orderInfoCollapsed = !NameplatePhotoUpload.state.orderInfoCollapsed;
      NameplatePhotoUpload.renderOrderInfo();
    });

    // ===== 弹窗骨架（常驻，事件绑一次） =====
    // Toast：点击遮罩或确定按钮关闭
    $("#template-toast").on("click", function (e) {
      if (e.target === this || $(e.target).hasClass("toast-btn")) {
        var callback = $("#template-toast").data("close-callback");
        if (callback) callback();
      }
    });
    // 二次确认：取消/遮罩关闭，确定执行回调
    $("#template-confirm").on("click", function (e) {
      if (e.target === this || $(e.target).hasClass("confirm-btn-cancel")) {
        $(this).addClass("hidden");
      } else if ($(e.target).hasClass("confirm-btn-ok")) {
        var callback = $(this).data("on-confirm");
        $(this).addClass("hidden");
        if (callback) callback();
      }
    });
    // 模板选择：列表项/取消/遮罩
    $("#picker-list").on("click", ".picker-item", function () {
      var callback = $("#template-picker").data("on-pick");
      $("#template-picker").addClass("hidden");
      if (callback) callback($(this).data("id"), $(this).data("name"), $(this).data("url"));
    });
    $("#template-picker .picker-btn").on("click", function () {
      $("#template-picker").addClass("hidden");
    });
    $("#template-picker").on("click", function (e) {
      if (e.target === this) $(this).addClass("hidden");
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
    NameplatePhotoUpload.initEvents();

    // 渲染初始表单状态（查询前：独立清空按钮可见）
    NameplatePhotoUpload.renderForm();

    // 加载工位列表
    NameplatePhotoUpload.loadStationList();
  },
};

// ============== 启动 ==============
$(function () {
  NameplatePhotoUpload.initPage();
});
