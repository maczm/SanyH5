// ============== 配置 ==============
var CONFIG = {
  MAX_IMAGE_WIDTH: 3000,
  MAX_IMAGE_HEIGHT: 3000,
  JPEG_QUALITY: 0.8,
  API_TIMEOUT: 10000, // API 超时兜底（毫秒）
  RETURN_DELAY: 600, // 关重件绑定入口：保存成功后延迟多久调用返回方法（先让成功提示渲染出来）
  RESIZE_DEBOUNCE: 150, // resize 去抖（弹窗尺寸变化、软键盘弹出/收起）
  MIN_USABLE_HEIGHT: 680, // 可视高度低于此值即认为高度受限：两个折叠区各自限高并自身滚动，保住底部按钮
  MIN_PAGE_HEIGHT: 400, // 弹窗形态页面高度下限：宿主给得再矮也按 400px 渲染（超出部分内部滚动）
  MAX_PAGE_HEIGHT: 600, // 页面高度上限：宿主给得再高也按 600px 渲染（不允许超出区间）
};

/*
 * ============== 生产对接说明 ==============
 *
 * Mock 机制：
 *   本地开发：同目录 mock.js 提供全部 Mock API 兜底（生产不部署该文件，Portal 只取
 *             index.html / index.js / index.css 三个文件）
 *   Portal 生产：iframe 加载前向 window 注入同名真实函数，
 *   JS 通过 typeof window.xxx 非 function 类型判断自动使用真实函数
 *
 * 页面结构：全部骨架在 index.html（含弹窗预埋与 template 标签循环模板），
 *          JS 只负责克隆模板、赋值（text/val/attr）与显隐切换，不拼接 HTML。
 *
 * 各 API 说明：
 *   API 1 (工位列表) : 获取工位列表
 *   API 2 (照片配置) : 获取照片类型配置（含 minCount/maxCount）和订单信息（含铭牌模板列表）
 *   API 3 (照片上传) : 上传单张照片（前端压缩为 JPEG Base64，生产需上传 CDN/OSS 返回 URL）
 *   API 4 (记录保存) : 保存工位照片信息（saveType 固定 "save"、toKeyPart 标识关重件绑定入口；不触发 AI 检测）
 *   window.Operator  : 当前操作员姓名（Portal 注入）
 *
 * 入口模式（关重件绑定 KeyPart 页面进入）：
 *   window.fromKeyPart === "KeyPart" 时按钮文案为「保存并返回」，并读取
 *   window.KeyPartStationCode / window.KeyPartOrderNo 预填工位与订单号（齐备则自动查询）；
 *   保存成功后调用 window.KeyPart_ReturnFromPhotoUpload() 交回关重件绑定页面
 *   （Portal 注入并实现，页面不自行做任何导航/关闭）
 *
 * Portal 必须注入以下 4 个 window 属性：
 *   window.getStationList     — API 1：获取工位列表
 *   window.getPhotoConfig     — API 2：获取照片类型配置 + 订单信息
 *   window.uploadPhoto        — API 3：照片上传
 *   window.submitPhotoRecord  — API 4：照片记录保存
 *   window.Operator           — 当前操作员姓名
 */

// ============== 应用命名空间 ==============
// 所有页面逻辑挂在 NameplatePhotoUpload 下，避免全局函数互相覆盖（Portal 同 iframe 切页场景）
var NameplatePhotoUpload = {
  // ============== 状态管理 ==============
  // photoTypes/photos 为查询结果，仅在本页流转；其余为入口与 UI 状态
  state: {
    fromKeyPart: false,
    stationCode: "",
    orderNo: "",
    photoTypes: [], // [{ typeCode, typeName, minCount, maxCount }]
    photos: {}, // { typeCode: [{ url: 字符串 }] }
    saving: false,
    configLoaded: false,
    formCollapsed: false,
    orderInfoCollapsed: false,
    orderInfoCollapsedByUser: false, // 用户手动操作过订单信息折叠：自动紧凑/展开逻辑不再覆盖其意图
    orderInfo: {
      machineCode: "",
      vin: "",
      templates: [], // [{ templateId, templateName, templateImageUrl }]
    },
    selectedTemplateId: "",
    selectedTemplateName: "",
    selectedTemplateUrl: "",
    stations: [],
    stationsLoaded: false, // 工位列表是否已返回（区分「加载中」与「无匹配」）
    sessionId: 0, // 会话标识：查询/清空/换工位时递增，用于丢弃过期异步回调（防串单）
  },

  _toastTimer: null,
  _loadingCount: 0,       // loading 引用计数（并发上传时避免提前消失）
  _initRetryCount: 0,

  // ============== 模板克隆 ==============
  /**
   * 克隆 template 标签骨架并返回 jQuery 对象（取根元素，保证 .data() 落在真实 DOM 节点上）
   * @param {string} templateClassName - template 元素的 class 名（不含点）
   */
  cloneTemplate: function (templateClassName) {
    var frag = document.querySelector("." + templateClassName).content.cloneNode(true);
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
          if (dv.getUint32(offset + 4, false) === 0x45786966) { // Exif 魔数
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
    $(".loading-text").text(text || "加载中...");
    $(".template-loading").removeClass("hidden");
  },

  hideLoading: function () {
    NameplatePhotoUpload._loadingCount = Math.max(0, NameplatePhotoUpload._loadingCount - 1);
    if (NameplatePhotoUpload._loadingCount === 0) {
      $(".template-loading").addClass("hidden");
    }
  },

  // ============== Toast 消息提示框（骨架预埋，仅显隐+填值） ==============
  // content 支持三种形态：null（无内容区）/ string（单行文本）/ array（[{label,value}] 详情行）
  showToast: function (title, content, type, callback) {
    var $toast = $(".template-toast");
    if (NameplatePhotoUpload._toastTimer) {
      clearTimeout(NameplatePhotoUpload._toastTimer);
      NameplatePhotoUpload._toastTimer = null;
    }

    $(".toast-title").text(title);
    $(".template-toast .toast-icon-error").toggleClass("hidden", type !== "error");
    $(".template-toast .toast-icon-success").toggleClass("hidden", type === "error");

    var $content = $(".toast-content");
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

  // ============== 模板选择弹窗（骨架预埋 + 列表克隆） ==============
  /**
   * 关闭并清空模板选择弹窗：换单/换工位重新查询时必须调用，
   * 否则上一单的强制选择弹窗会继续留在屏幕上，操作工会对着上一单的模板去选、去保存
   */
  dismissTemplatePicker: function () {
    var $picker = $(".template-picker");
    if (!$picker.length) return;
    $picker.addClass("hidden").removeData("on-pick").removeData("force-choose");
    $(".picker-list").empty();
  },

  /**
   * 打开模板选择弹窗
   * @param {Array} templates - 模板列表
   * @param {Function} callback - 选中回调 (templateId, templateName, templateImageUrl)
   * 多个模板时进入强制选择：点「取消」不关闭并提示（未选择不允许保存，遮罩点击仍可暂退以便换单）
   */
  showTemplatePicker: function (templates, callback) {
    var $list = $(".picker-list");
    $list.empty();
    templates.forEach(function (template) {
      var $item = NameplatePhotoUpload.cloneTemplate("template-picker-item");
      $item.find("img").attr("src", template.templateImageUrl).attr("alt", template.templateName);
      $item.find(".picker-item-name").text(template.templateName);
      $item.data("id", template.templateId).data("name", template.templateName).data("url", template.templateImageUrl);
      $list.append($item);
    });
    $(".template-picker")
      .data("on-pick", callback)
      .data("force-choose", templates.length > 1)
      .removeClass("hidden");
  },

  // ============== 表单渲染（骨架已静态化，此处仅切换状态与回填值） ==============
  // 与订单信息一致：查询后显示卡片头（点击折叠/展开），查询前无头完整显示
  renderForm: function () {
    var state = NameplatePhotoUpload.state;
    var $header = $(".btn-toggle-form");
    var $body = $(".form-card-body");

    if (state.configLoaded) {
      $header.removeClass("hidden");
      $(".form-arrow .arrow-down").toggleClass("hidden", !state.formCollapsed);
      $(".form-arrow .arrow-up").toggleClass("hidden", state.formCollapsed);
      $body.toggleClass("hidden", state.formCollapsed);
    } else {
      $header.addClass("hidden");
      $body.removeClass("hidden");
    }

    // 收起时卡片头显示当前工位/订单摘要（展开时不需要，输入框里已有）
    var collapsed = state.configLoaded && state.formCollapsed;
    $(".form-summary-station").text(collapsed ? state.stationCode : "");
    $(".form-summary-order").text(collapsed ? state.orderNo : "");

    $(".input-station").val(state.stationCode ? NameplatePhotoUpload.getStationDisplay(state.stationCode) : "");
    $(".input-station-code").val(state.stationCode);
    $(".input-order").val(state.orderNo);

    // 表单状态变化的统一出口（初始化/清空/重置/查询都经此）：按钮文案与可用态一并重算，
    // 否则保存成功后重置时按钮会残留「保存中...」与禁用态
    NameplatePhotoUpload.applySaveButtonLabel();
    NameplatePhotoUpload.updateButtons();
  },

  /** 关重件绑定（KeyPart）页面入口标识：Portal 注入 window.fromKeyPart === "KeyPart" */
  isKeyPartEntry: function () {
    return window.fromKeyPart === "KeyPart";
  },

  /** 延迟执行包装（resize 等高频事件用，只保留最后一次） */
  debounce: function (delay, action) {
    var timer = null;
    return function () {
      var args = arguments;
      var context = this;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        action.apply(context, args);
      }, delay);
    };
  },

  // ============== 视口适配（弹窗/矮屏宿主） ==============
  /**
   * 是否处于「关重件绑定跳转进来的弹窗」形态。
   * 只有这种形态才做高度钳制与矮屏折叠；从普通入口/整屏打开时保持铺满视口的常规行为。
   */
  isPopupMode: function () {
    return !!NameplatePhotoUpload.state.fromKeyPart;
  },

  /**
   * 是否按"紧凑布局"呈现（查询条件区与订单信息区默认收起）。
   * - 弹窗形态（关重件绑定跳转）：**无条件收起**（不论弹窗多高，都把纵向空间留给拍照）；
   * - 普通入口：仅当高度受限（视口 < CONFIG.MIN_USABLE_HEIGHT）时才收起，否则保持展开（原有行为）。
   */
  isCompactViewport: function () {
    if (NameplatePhotoUpload.isPopupMode()) return true;
    return $(window).height() < CONFIG.MIN_USABLE_HEIGHT;
  },

  /**
   * 页面尺寸。
   *
   * 弹窗形态（关重件绑定跳转）：钉住高度并**钳制在 [MIN_PAGE_HEIGHT, MAX_PAGE_HEIGHT]**（默认 400~600px）。
   *   背景：宿主弹层（如 Apriso 的 .apr-popup）按内容自适应高度，页面若把内容高度透给宿主，
   *   查询条件/订单信息一折叠展开弹窗就跟着变高变矮；钉住后文档高度恒定，折叠展开只在页面内部
   *   重新分配空间（照片卡片区自身滚动），宿主量到的尺寸不变。钳制则保证不超出约定区间。
   *
   * 普通形态（非关重件入口）：不钳制，按视口铺满（保持原来的整屏行为）。
   *
   * 偏移只取父层 padding-top / border-top 与自身 margin-top（**不能用 offset().top**：
   * 宿主 padding 会让 offset().top > 0，从而把高度算小并写死，实测线上被压成 340px）。
   */
  fitPageHeight: function () {
    var $root = $(".mom-photo-upload");
    if (!$root.length) return;
    var popupMode = NameplatePhotoUpload.isPopupMode();
    var $host = $root.parent();
    var hostPaddingTop = parseFloat($host.css("padding-top")) || 0;
    var hostBorderTop = parseFloat($host.css("border-top-width")) || 0;
    var rootMarginTop = parseFloat($root.css("margin-top")) || 0;
    var topOffset = Math.round(hostPaddingTop + hostBorderTop + rootMarginTop);
    var rawHeight = $(window).height() - topOffset;
    var finalHeight = popupMode
      ? Math.min(CONFIG.MAX_PAGE_HEIGHT, Math.max(CONFIG.MIN_PAGE_HEIGHT, rawHeight))
      : rawHeight;
    // 高度受限（矮弹窗或矮嵌入式宿主）时给折叠区限高，保证底部按钮不被挤出可视区
    var constrained = popupMode || $(window).height() < CONFIG.MIN_USABLE_HEIGHT;
    $root.toggleClass("is-popup-mode", popupMode).toggleClass("page-compact", constrained).css("height", finalHeight + "px");
    // 记录本次计算，便于现场核查（不参与逻辑）
    $root.attr("data-host-top-offset", topOffset);
    $root.attr("data-page-height", finalHeight);
    $root.attr("data-page-height-clamped", finalHeight === rawHeight ? "0" : "1");
  },

  /**
   * 紧凑布局：**仅弹窗形态（关重件绑定跳转）**下，矮屏时把查询条件区与订单信息区都收起，
   * 把纵向空间留给拍照（卡片头仍显示工位/订单/模板摘要与模板缩略图）；用户手动操作过折叠则尊重其意图。
   * 普通入口 / 整屏：保持展开，与原有行为一致。
   */
  applyCompactLayout: function () {
    var state = NameplatePhotoUpload.state;
    if (!state.configLoaded) return;
    var compact = NameplatePhotoUpload.isCompactViewport();
    if (!state.orderInfoCollapsedByUser && state.orderInfoCollapsed !== compact) {
      state.orderInfoCollapsed = compact;
      NameplatePhotoUpload.renderOrderInfo();
    }
    if (state.formCollapsed !== compact) {
      state.formCollapsed = compact;
      NameplatePhotoUpload.renderForm();
    }
  },

  /**
   * 返回关重件绑定页面：调用 Portal 注入的 window.KeyPart_ReturnFromPhotoUpload()
   * （该函数由 Portal 侧实现；未注入时静默跳过，本地开发不影响流程）
   * 延迟一小段再调，让「保存成功」提示先渲染出来，避免整页切走导致用户看不到结果
   */
  returnToKeyPartPage: function () {
    setTimeout(function () {
      if (typeof window.KeyPart_ReturnFromPhotoUpload === "function") {
        window.KeyPart_ReturnFromPhotoUpload();
      }
    }, CONFIG.RETURN_DELAY);
  },

  /** 按钮文案随入口切换：关重件绑定进入为「保存并返回」（返回动作由 Portal 处理），否则为「保存」 */
  applySaveButtonLabel: function () {
    $(".btn-save").text(NameplatePhotoUpload.state.fromKeyPart ? "保存并返回" : "保存");
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
      NameplatePhotoUpload.state.stationsLoaded = true;

      if (NameplatePhotoUpload.state.stationCode) {
        $(".input-station").val(NameplatePhotoUpload.getStationDisplay(NameplatePhotoUpload.state.stationCode));
        $(".input-station-code").val(NameplatePhotoUpload.state.stationCode);
      }

      // 列表就绪前打开的下拉：重新渲染，避免停留「工位加载中...」
      if (!$(".dropdown-station").hasClass("hidden")) {
        NameplatePhotoUpload.showStationDropdown();
      }
    });
  },

  // ============== 工位筛选 ==============
  filterStations: function (keyword) {
    if (!keyword) return NameplatePhotoUpload.state.stations;
    var keywordLower = keyword.toLowerCase();
    return NameplatePhotoUpload.state.stations.filter(function (station) {
      var code = (station.stationCode || "").toLowerCase();
      var name = (station.stationName || "").toLowerCase();
      return code.indexOf(keywordLower) !== -1 || name.indexOf(keywordLower) !== -1;
    });
  },

  showStationDropdown: function () {
    var keyword = $(".input-station").val().trim();
    var filtered = NameplatePhotoUpload.filterStations(keyword);
    var $dropdown = $(".dropdown-station");
    $dropdown.empty();

    if (!filtered.length) {
      // 列表未就绪与筛选无果要区分，否则用户看到一个永远不会刷新的空下拉
      var emptyTemplate = NameplatePhotoUpload.state.stationsLoaded
        ? "template-combobox-empty"
        : "template-combobox-loading";
      $dropdown.append(NameplatePhotoUpload.cloneTemplate(emptyTemplate));
    } else {
      filtered.forEach(function (state) {
        var $item = NameplatePhotoUpload.cloneTemplate("template-combobox-item");
        $item.find(".combobox-item-code").text(state.stationCode);
        $item.find(".combobox-item-name").text(state.stationName);
        $item.data("code", state.stationCode).data("name", state.stationName);
        $dropdown.append($item);
      });
    }
    $dropdown.removeClass("hidden");
  },

  selectStation: function (stationCode, stationName) {
    NameplatePhotoUpload.state.stationCode = stationCode;
    $(".input-station").val(stationCode + " - " + stationName);
    $(".input-station-code").val(stationCode);
    $(".dropdown-station").addClass("hidden");

    if (NameplatePhotoUpload.state.configLoaded) {
      NameplatePhotoUpload.state.configLoaded = false;
      NameplatePhotoUpload.hideResultAreas();
    }
  },

  hideResultAreas: function () {
    NameplatePhotoUpload.state.sessionId++; // 清空/切换会话：丢弃在途回调
    $(".order-info-area").addClass("hidden");
    $(".photo-cards-area .photo-type-card").remove(); // 保留预埋的 empty-state 骨架
    $(".empty-no-photo").addClass("hidden");
    $(".confirm-section").addClass("hidden");
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
    state.orderInfoCollapsedByUser = false;
    state.orderInfo = { machineCode: "", vin: "", templates: [] };
    state.selectedTemplateId = "";
    state.selectedTemplateName = "";
    state.selectedTemplateUrl = "";

    NameplatePhotoUpload.hideResultAreas();
    NameplatePhotoUpload.renderForm();
    window.scrollTo({ top: 0, behavior: "smooth" });
  },

  // ============== 扫码 ==============
  doScan: function (inputSelector, callback) {
    try {
      if (window.parent && typeof window.parent.OpenCamera === "function") {
        window.parent.OpenCamera(function (res) {
          console.log("[Scan] OpenCamera 返回", res);
          var val = res.data || res.value || (typeof res === "string" ? res : "");
          if (val) {
            $(inputSelector).val(val);
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

  // ============== 模板选中态（接口回显 → 单模板自动选中 → 多模板由操作员弹窗选择） ==============
  /**
   * 按优先级决定铭牌模板选中态：
   *   1) 接口回显 orderInfo.selectedTemplateId（上次保存的模板）→ 在当前候选里匹配成功后选中；
   *   2) 候选只有一个 → 自动选中；
   *   3) 其他情况（多个候选且没有可用的回显、或回显的模板已下线）→ 交给查询成功后的弹窗强制选择。
   * 仅当回显 ID 能在当前候选里匹配到才生效，名称与图片一律取当前候选值，避免用上已失效的旧值。
   */
  applyTemplateSelection: function (templates) {
    var state = NameplatePhotoUpload.state;
    state.selectedTemplateId = "";
    state.selectedTemplateName = "";
    state.selectedTemplateUrl = "";

    var restoredTemplateId = "";
    if (state.orderInfo && state.orderInfo.selectedTemplateId) {
      restoredTemplateId = state.orderInfo.selectedTemplateId;
    }
    if (restoredTemplateId) {
      for (var i = 0; i < templates.length; i++) {
        if (templates[i].templateId === restoredTemplateId) {
          state.selectedTemplateId = templates[i].templateId;
          state.selectedTemplateName = templates[i].templateName || "";
          state.selectedTemplateUrl = templates[i].templateImageUrl;
          return;
        }
      }
    }

    if (templates.length === 1) {
      state.selectedTemplateId = templates[0].templateId;
      state.selectedTemplateName = templates[0].templateName || "";
      state.selectedTemplateUrl = templates[0].templateImageUrl;
    }
  },

  // ============== 查询照片配置 ==============
  doQueryPhotoConfig: function () {
    var state = NameplatePhotoUpload.state;
    var stationCode = $(".input-station-code").val() || state.stationCode;
    var orderNo = $(".input-order").val().trim();

    if (!stationCode) {
      var typedVal = $(".input-station").val().trim();
      if (typedVal) {
        for (var i = 0; i < state.stations.length; i++) {
          var full = state.stations[i].stationCode + " - " + state.stations[i].stationName;
          if (full === typedVal) {
            stationCode = state.stations[i].stationCode;
            state.stationCode = stationCode;
            $(".input-station-code").val(stationCode);
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

    NameplatePhotoUpload.dismissTemplatePicker();
    NameplatePhotoUpload.showLoading("查询中...");
    var querySessionSnapshot = ++state.sessionId; // 换单/换工位会自增：丢弃过期查询回调，防止旧结果覆盖新单
    console.log("[API] getPhotoConfig", { stationCode: stationCode, orderNo: orderNo });
    NameplatePhotoUpload.apiCall(window.getPhotoConfig, [{ stationCode: stationCode, orderNo: orderNo }], function (res) {
      console.log("[API] getPhotoConfig 返回", res);
      NameplatePhotoUpload.hideLoading();
      if (querySessionSnapshot !== NameplatePhotoUpload.state.sessionId) return; // 已有更新的查询，丢弃
      if (res.code !== 0) {
        NameplatePhotoUpload.showToast("查询失败", res.msg || "获取照片配置失败", "error");
        return;
      }

      state.photoTypes = res.data.photoTypes || [];
      state.orderInfo = res.data.orderInfo || { machineCode: "", vin: "", templates: [] };
      state.photos = {};
      state.configLoaded = true;

      var templates = state.orderInfo.templates || [];
      NameplatePhotoUpload.applyTemplateSelection(templates);

      for (var i = 0; i < state.photoTypes.length; i++) {
        state.photos[state.photoTypes[i].typeCode] = [];
      }

      // 回显上一次已保存的照片（后端 data.photos，与保存报文同结构）：静默回填、不弹提示，
      // 回填后与本次拍摄的照片同等对待（可删、可继续拍、可重新保存）
      var savedPhotoGroups = res.data.photos || [];
      for (var g = 0; g < savedPhotoGroups.length; g++) {
        var group = savedPhotoGroups[g];
        if (!group) continue;
        var groupTypeCode = group.photoType;
        if (!groupTypeCode || !state.photos[groupTypeCode]) continue; // 类型已不在当前配置里的旧照片忽略
        var groupUrls = group.urlList || [];
        for (var u = 0; u < groupUrls.length; u++) {
          if (groupUrls[u]) state.photos[groupTypeCode].push({ url: groupUrls[u] });
        }
      }

      // 查询成功：先保持展开，再由 applyCompactLayout 按形态决定是否收起
      // （弹窗形态：两区收起腾出拍照空间；普通入口：保持展开，与原有整屏行为一致）
      state.formCollapsed = false;
      state.orderInfoCollapsedByUser = false; // 新订单：重置用户折叠意图
      state.orderInfoCollapsed = false;
      NameplatePhotoUpload.applyCompactLayout();
      NameplatePhotoUpload.renderForm();
      NameplatePhotoUpload.renderOrderInfo();
      NameplatePhotoUpload.renderPhotoTypeCards();
      NameplatePhotoUpload.updateButtons();
      $(".photo-cards-area").removeClass("hidden");
      // 无照片类型（无需拍照工位）：不显示保存按钮
      if (state.photoTypes.length) {
        $(".confirm-section").removeClass("hidden");
      } else {
        $(".confirm-section").addClass("hidden");
      }

      // 表单已自动收起，滚动定位到内容区顶部（订单信息），让订单信息与照片卡片一起进入视野
      setTimeout(function () {
        var contentTop = $(".photo-cards-area")[0];
        if (contentTop) contentTop.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);

      // 多个铭牌模板且尚未确定选中：查询后自动弹窗强制选择（未选不允许保存）
      var queriedTemplates = state.orderInfo.templates || [];
      if (queriedTemplates.length > 1 && !state.selectedTemplateId) {
        NameplatePhotoUpload.showTemplatePicker(queriedTemplates, function (templateId, templateName, templateUrl) {
          state.selectedTemplateId = templateId;
          state.selectedTemplateName = templateName;
          state.selectedTemplateUrl = templateUrl;
          NameplatePhotoUpload.renderOrderInfo();
          NameplatePhotoUpload.updateButtons();
        });
      }
    });
  },

  // ============== 订单信息渲染（body 多态块切换，骨架在 index.html） ==============
  renderOrderInfo: function () {
    var state = NameplatePhotoUpload.state;
    var $area = $(".order-info-area");

    // 无订单信息：整区隐藏
    if (!state.orderInfo || (!state.orderInfo.machineCode && (!state.orderInfo.templates || !state.orderInfo.templates.length))) {
      $area.addClass("hidden");
      return;
    }
    $area.removeClass("hidden");

    $(".order-info-arrow .arrow-down").toggleClass("hidden", !state.orderInfoCollapsed);
    $(".order-info-arrow .arrow-up").toggleClass("hidden", state.orderInfoCollapsed);

    $(".order-info-body").toggleClass("hidden", state.orderInfoCollapsed);

    // 收起时卡片头显示「主机编码 · VIN · 模板名」摘要 + 模板缩略图（展开时不需要，body 里已有）
    // 有模板名却没有图（未选模板 / 模板无图 / 图加载失败）：缩略图位改显示说明文字，不留空图框
    var summaryTemplates = state.orderInfo.templates || [];
    var summaryTemplateName = state.selectedTemplateName || (summaryTemplates.length === 1 ? summaryTemplates[0].templateName || "" : "");
    var summaryTemplateUrl = state.selectedTemplateUrl || (summaryTemplates.length === 1 ? summaryTemplates[0].templateImageUrl || "" : "");
    var summaryText = summaryTemplateName;
    if (!summaryTemplateName) {
      if (!summaryTemplates.length) {
        summaryText = "未查到铭牌模板";
      } else if (summaryTemplates.length > 1) {
        summaryText = "请选择铭牌模板";
      }
    }
    $(".order-info-summary-template").text(state.orderInfoCollapsed ? summaryText : "");
    $(".order-info-summary-code").text(state.orderInfoCollapsed ? state.orderInfo.machineCode || "-" : "");
    $(".order-info-summary-vin").text(state.orderInfoCollapsed ? state.orderInfo.vin || "" : "");
    $(".order-info-card").toggleClass("is-collapsed", state.orderInfoCollapsed);

    /**
     * 缩略图位三态：有图→显示图；有模板名没图→占位说明「无模板图」；没查到/未选模板→整位收起
     * 目的：收起态卡片头不留空图框、也不露浏览器的破图图标
     */
    function updateTemplateThumb() {
      var hasName = !!summaryTemplateName;
      var hasUrl = !!summaryTemplateUrl;
      if (!hasName) {
        $(".order-info-header-thumb").addClass("hidden").removeClass("is-empty");
        return;
      }
      $(".order-info-header-thumb").removeClass("hidden").toggleClass("is-empty", !hasUrl);
    }
    updateTemplateThumb();

    var $headerImage = $(".template-header-image");
    $headerImage.off("error.templateThumb").on("error.templateThumb", function () {
      $(".order-info-header-thumb").addClass("is-empty");
    });
    if (state.orderInfoCollapsed && summaryTemplateUrl) {
      $headerImage.attr("src", summaryTemplateUrl);
    } else {
      // 展开态 / 无模板 / 无图：清空 src，避免残留上一单的图或空白请求
      $headerImage.removeAttr("src");
    }

    if (state.orderInfoCollapsed) return;

    // 态A：主机编码 + VIN
    var hasMachineVin = !!(state.orderInfo.machineCode || state.orderInfo.vin);
    $(".block-machine-vin").toggleClass("hidden", !hasMachineVin);
    $(".machine-code-value").text(state.orderInfo.machineCode || "-");
    $(".vin-value").text(state.orderInfo.vin || "-");

    // 态B/C/D/E：模板四态互斥
    $(".block-template-single").addClass("hidden");
    $(".block-template-selected").addClass("hidden");
    $(".block-template-none").addClass("hidden");
    $(".block-template-missing").addClass("hidden");

    var templates = state.orderInfo.templates || [];
    if (templates.length === 1) {
      // 单模板：自动选中（无需用户操作）
      $(".block-template-single").removeClass("hidden");
      $(".template-single-name-value").text(templates[0].templateName || "");
      $(".template-single-image").attr("src", templates[0].templateImageUrl);
    } else if (templates.length > 1 && state.selectedTemplateId) {
      // 多模板已选
      $(".block-template-selected").removeClass("hidden");
      $(".template-selected-name-value").text(state.selectedTemplateName);
      $(".template-selected-image").attr("src", state.selectedTemplateUrl);
    } else if (templates.length > 1) {
      // 多模板未选：必须选择（保存按钮同步置灰）
      $(".block-template-none").removeClass("hidden");
      $(".block-template-none .btn-pick-template-inline").text("点击选择（" + templates.length + "个可选）");
    } else {
      // 订单未查到铭牌记录：仅提示，不卡控保存
      $(".block-template-missing").removeClass("hidden");
    }
  },

  // ============== 照片类型卡片渲染（克隆 template-photo-card / template-photo-item） ==============
  renderPhotoTypeCards: function () {
    var $area = $(".photo-cards-area");
    var state = NameplatePhotoUpload.state;
    $area.find(".photo-type-card").remove();
    $(".empty-no-photo").addClass("hidden");

    if (!state.photoTypes.length) {
      // 空态提示：骨架在 index.html；无照片类型不显示保存按钮
      $(".empty-no-photo").removeClass("hidden");
      $(".confirm-section").addClass("hidden");
      return;
    }

    state.photoTypes.forEach(function (photoType) {
      var $card = NameplatePhotoUpload.cloneTemplate("template-photo-card");
      $card.attr("data-type", photoType.typeCode);
      $card.find(".card-title").text(photoType.typeName);
      $card.find(".photo-add").attr("data-type", photoType.typeCode);

      var takenCount = (state.photos[photoType.typeCode] || []).length;
      var reachedMax = takenCount >= photoType.maxCount;
      var minCount = photoType.minCount;
      var maxCount = photoType.maxCount;

      // 徽章只说人话：done（已完成）/ pending（还需 N 张）/ optional（可不拍）
      // minCount=0 表示该类型可不拍，不能当成"已完成"（一张没拍也报完成会误导）
      var badgeText = "";
      var badgeState = "pending";
      if (minCount === 0) {
        // 可不拍：始终把上限写出来（拍了多少也一并告知）
        badgeState = "optional";
        badgeText = takenCount === 0 ? "最多 " + maxCount + " 张" : "最多 " + maxCount + " 张（已拍 " + takenCount + " 张）";
      } else if (takenCount >= minCount) {
        badgeState = "done";
        // 刚好达到最少数写 x/y；超过后写 3/1 像出错，改为"已拍 X 张"并带上限。
        // 已达上限时不再重复"最多 Z 张"（卡内已有「已达上限」提示，X=Z 写两遍反而绕）
        if (takenCount === minCount) {
          badgeText = "已完成（已拍 " + takenCount + "/" + minCount + "）";
        } else if (reachedMax) {
          badgeText = "已完成（已拍 " + takenCount + " 张）";
        } else {
          badgeText = "已完成（已拍 " + takenCount + " 张，最多 " + maxCount + " 张）";
        }
      } else {
        badgeText = "还需 " + (minCount - takenCount) + " 张（已拍 " + takenCount + "/" + minCount + "）";
      }
      $card.find(".card-badge").toggleClass("done", badgeState === "done");
      $card.find(".card-badge").toggleClass("pending", badgeState === "pending");
      $card.find(".card-badge").toggleClass("optional", badgeState === "optional");
      $card.find(".badge-check").toggleClass("hidden", badgeState !== "done");
      $card.find(".badge-text").text(badgeText);

      var progressPct = minCount === 0 ? (takenCount > 0 ? 100 : 0) : Math.min(100, (takenCount / minCount) * 100);
      $card.find(".progress-fill").css("width", progressPct + "%");
      $card.toggleClass("complete", minCount > 0 && takenCount >= minCount);

      var $list = $card.find(".photo-thumb-list");
      (state.photos[photoType.typeCode] || []).forEach(function (photo, j) {
        var $item = NameplatePhotoUpload.cloneTemplate("template-photo-item");
        $item.attr("data-type", photoType.typeCode).attr("data-index", j);
        $item.find("img").attr("src", photo.url);
        $list.append($item);
      });

      $card.find(".photo-add").toggleClass("hidden", reachedMax);
      $card.find(".photo-full-tip").toggleClass("hidden", !reachedMax);

      $area.append($card);
    });

    NameplatePhotoUpload.updateButtons();
  },

  // ============== 拍照处理 ==============
  handleTakePhoto: function (typeCode) {
    $(".photo-input").data("current-type", typeCode);
    $(".photo-input").click();
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
    var $mask = $(".template-preview");
    var $image = $(".preview-image");
    var $panner = $(".preview-panner");
    var $viewport = $(".preview-viewport");

    var scale = 1;
    var panX = 0;
    var panY = 0;
    var imageWidth = 0;
    var imageHeight = 0;

    // 解绑旧事件，避免重复绑定（缩放状态每次打开重置）
    $image.off("dblclick load");
    $viewport.off("wheel touchstart touchmove touchend touchcancel");
    $mask.off("mousedown");
    $(".template-preview .photo-preview-close").off("click");

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

    $image.on("dblclick", function (e) {
      e.preventDefault();
      var pos = getViewportPos(e.clientX, e.clientY);
      if (scale > 1.05) {
        centerImage();
      } else {
        zoomAt(pos.x, pos.y, 2.5);
      }
    });

    $viewport.on("wheel", function (e) {
      e.preventDefault();
      var pos = getViewportPos(e.originalEvent.clientX, e.originalEvent.clientY);
      var delta = e.originalEvent.deltaY > 0 ? -0.2 : 0.2;
      zoomAt(pos.x, pos.y, scale + delta);
    });

    var dragBaseX, dragBaseY, isDragging;
    var pinchDist0, pinchScale0, pinchPanX0, pinchPanY0;

    $viewport.on("touchstart", function (e) {
      var touches = e.originalEvent.touches;
      if (touches.length === 1) {
        isDragging = true;
        dragBaseX = touches[0].clientX - panX;
        dragBaseY = touches[0].clientY - panY;
      } else if (touches.length === 2) {
        isDragging = false;
        pinchScale0 = scale;
        pinchPanX0 = panX;
        pinchPanY0 = panY;
        var dx = touches[0].clientX - touches[1].clientX;
        var dy = touches[0].clientY - touches[1].clientY;
        pinchDist0 = Math.sqrt(dx * dx + dy * dy);
      }
    });

    $viewport.on("touchmove", function (e) {
      var touches = e.originalEvent.touches;
      if (touches.length === 1 && isDragging) {
        panX = touches[0].clientX - dragBaseX;
        panY = touches[0].clientY - dragBaseY;
        apply();
      } else if (touches.length === 2 && pinchDist0 > 0) {
        var dx = touches[0].clientX - touches[1].clientX;
        var dy = touches[0].clientY - touches[1].clientY;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var newScale = Math.max(0.5, Math.min(5, pinchScale0 * (dist / pinchDist0)));

        var cx = (touches[0].clientX + touches[1].clientX) / 2;
        var cy = (touches[0].clientY + touches[1].clientY) / 2;
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

    $mask.on("mousedown", function (e) {
      if (e.target === this) close();
    });
    $(".template-preview .photo-preview-close").on("click", close);

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

  // ============== 数据构建（保存报文） ==============
  buildPhotoList: function () {
    var state = NameplatePhotoUpload.state;
    return state.photoTypes.map(function (photoType) {
      return {
        photoType: photoType.typeCode,
        urlList: (state.photos[photoType.typeCode] || []).map(function (photo) {
          return photo.url;
        }),
      };
    });
  },

  buildSubmitData: function (photoList) {
    var state = NameplatePhotoUpload.state;
    return {
      stationCode: state.stationCode,
      orderNo: state.orderNo,
      operator: window.Operator,
      machineCode: state.orderInfo.machineCode,
      vin: state.orderInfo.vin,
      templateId: state.selectedTemplateId,
      templateImageUrl: state.selectedTemplateUrl,
      saveType: "save", // 页面只做保存，不再提交 AI 检测
      toKeyPart: state.fromKeyPart, // 是否关重件绑定页面入口（按钮文案「保存并返回」场景）
      photos: photoList,
    };
  },

  // ============== 按钮状态（配置已加载 + 至少 1 张照片；多模板未选时拦截） ==============
  updateButtons: function () {
    var $saveButton = $(".btn-save");
    var state = NameplatePhotoUpload.state;

    if (!state.configLoaded || !state.photoTypes.length) {
      $saveButton.prop("disabled", true).removeAttr("aria-disabled").addClass("btn-disabled");
      return;
    }

    var totalTaken = 0;
    for (var i = 0; i < state.photoTypes.length; i++) {
      totalTaken += (state.photos[state.photoTypes[i].typeCode] || []).length;
    }

    // 无照片：原生置灰（点击无意义）
    if (!totalTaken) {
      $saveButton.prop("disabled", true).removeAttr("aria-disabled").addClass("btn-disabled");
      return;
    }

    // 有照片但多模板未选：保留占位、置灰外观但可点击，点击给「请先选择铭牌模板」提示
    // （原生 disabled 不派发 click，提示无从触发，故用 aria-disabled + .btn-disabled）
    var templateMismatch = NameplatePhotoUpload.hasTemplateMismatch();
    $saveButton.prop("disabled", false);
    $saveButton.toggleClass("btn-disabled", templateMismatch);
    if (templateMismatch) {
      $saveButton.attr("aria-disabled", "true");
    } else {
      $saveButton.removeAttr("aria-disabled");
    }
  },

  /** 多个铭牌模板但未选择：不允许保存（订单未查到模板时不拦） */
  hasTemplateMismatch: function () {
    var state = NameplatePhotoUpload.state;
    var templates = state.orderInfo.templates || [];
    return templates.length > 1 && !state.selectedTemplateId;
  },

  /** 保存前拦截：多模板未选时提示并给出选择入口 */
  ensureTemplateSelected: function () {
    if (!NameplatePhotoUpload.hasTemplateMismatch()) return true;
    NameplatePhotoUpload.showToast("提示", "请先选择铭牌模板", "error");
    NameplatePhotoUpload.renderOrderInfo();
    return false;
  },

  // ============== 保存（未达最少数也可存：草稿保存） ==============
  handleSave: function () {
    var state = NameplatePhotoUpload.state;
    if (state.saving) return;

    if (!NameplatePhotoUpload.ensureTemplateSelected()) return;

    var totalTaken = 0;
    for (var i = 0; i < state.photoTypes.length; i++) {
      totalTaken += (state.photos[state.photoTypes[i].typeCode] || []).length;
    }

    if (!totalTaken) {
      NameplatePhotoUpload.showToast("提示", "请至少拍摄一张照片", "error");
      return;
    }

    NameplatePhotoUpload.doSubmit();
  },

  doSubmit: function () {
    var actionText = "保存";
    var photoList = NameplatePhotoUpload.buildPhotoList();
    var submitData = NameplatePhotoUpload.buildSubmitData(photoList);

    NameplatePhotoUpload.state.saving = true;
    var $saveButton = $(".btn-save");
    $saveButton.prop("disabled", true).text("保存中...");

    NameplatePhotoUpload.showLoading(actionText + "中...");

    console.log("[API] submitPhotoRecord", submitData);
    NameplatePhotoUpload.apiCall(window.submitPhotoRecord, [submitData], function (res) {
      console.log("[API] submitPhotoRecord 返回", res);
      NameplatePhotoUpload.hideLoading();
      NameplatePhotoUpload.state.saving = false;
      // 恢复按钮：文案由入口决定（保留 data-label 供骨架文案变更时兜底）
      $saveButton.prop("disabled", false).text($saveButton.data("label"));
      NameplatePhotoUpload.applySaveButtonLabel();

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

      // 关重件绑定入口：保存成功后交回关重件绑定页面（返回方法由 Portal 实现）
      if (NameplatePhotoUpload.state.fromKeyPart) {
        NameplatePhotoUpload.returnToKeyPartPage();
      }
    });
  },

  // ============== 重置表单 ==============
  resetForm: function () {
    var state = NameplatePhotoUpload.state;
    state.stationCode = "";
    state.orderNo = "";
    state.photoTypes = [];
    state.photos = {};
    state.saving = false;
    state.configLoaded = false;
    state.formCollapsed = false;
    state.orderInfoCollapsed = false;
    state.orderInfoCollapsedByUser = false;
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
    $(".form-area").on("focus input click", ".input-station", function () {
      NameplatePhotoUpload.showStationDropdown();
    });
    $(".form-area").on("input", ".input-station", function () {
      $(".input-station-code").val("");
      NameplatePhotoUpload.state.stationCode = "";
      if (NameplatePhotoUpload.state.configLoaded) {
        NameplatePhotoUpload.state.configLoaded = false;
        NameplatePhotoUpload.hideResultAreas();
      }
    });

    // 下拉选项点击（mousedown 先于 document 关闭逻辑）
    $(".form-area").on("mousedown", ".combobox-item", function () {
      NameplatePhotoUpload.selectStation($(this).data("code"), $(this).data("name"));
    });

    // 下拉箭头点击
    $(".form-area").on("click", ".combobox-arrow", function () {
      var $dropdown = $(".dropdown-station");
      if (!$dropdown.hasClass("hidden")) {
        $dropdown.addClass("hidden");
      } else {
        NameplatePhotoUpload.showStationDropdown();
      }
    });

    // 点击页面其他地方关闭下拉
    $(document).on("mousedown", function (e) {
      if (!$(e.target).closest(".combobox-station").length) {
        $(".dropdown-station").addClass("hidden");
        if (NameplatePhotoUpload.state.stationCode) {
          $(".input-station").val(NameplatePhotoUpload.getStationDisplay(NameplatePhotoUpload.state.stationCode));
        }
      }
    });

    // 工位输入框回车
    $(".form-area").on("keypress", ".input-station", function (e) {
      if (e.which !== 13) {
        $(".dropdown-station").addClass("hidden");
        return;
      }
      $(".dropdown-station").addClass("hidden");
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
    $(".form-area").on("click", ".btn-query", function () {
      NameplatePhotoUpload.doQueryPhotoConfig();
    });

    // 表单卡片头：点击折叠/展开（与订单信息一致）
    $(".form-area").on("click", ".btn-toggle-form", function () {
      NameplatePhotoUpload.toggleForm();
    });

    // 清空（header 清空图标 + 查询前清空按钮，class 委托）
    // 清空按钮在卡片头内部，必须阻止冒泡，否则会连带触发卡片头的折叠切换
    $(".form-area").on("click", ".btn-clear-form", function (e) {
      e.stopPropagation();
      NameplatePhotoUpload.clearForm();
    });

    // 扫码按钮
    $(".form-area").on("click", ".btn-scan-order", function () {
      NameplatePhotoUpload.doScan(".input-order", NameplatePhotoUpload.doQueryPhotoConfig);
    });

    // 订单号回车
    $(".form-area").on("keypress", ".input-order", function (e) {
      if (e.which !== 13) return;
      NameplatePhotoUpload.doQueryPhotoConfig();
    });

    // 照片卡片区：拍照/预览/删除（委托，typeCode 从 data 属性读取，避免拼选择器）
    $(".photo-cards-area").on("click", ".photo-add", function () {
      NameplatePhotoUpload.handleTakePhoto($(this).data("type"));
    });
    $(".photo-cards-area").on("click", ".photo-item img", function () {
      var $item = $(this).closest(".photo-item");
      var typeCode = $item.data("type");
      var index = parseInt($item.data("index"));
      var list = NameplatePhotoUpload.state.photos[typeCode] || [];
      if (list[index]) NameplatePhotoUpload.showPhotoPreview(list[index].url);
    });
    $(".photo-cards-area").on("click", ".photo-delete", function (e) {
      e.stopPropagation();
      var $item = $(this).closest(".photo-item");
      NameplatePhotoUpload.deletePhoto($item.data("type"), parseInt($item.data("index")));
    });

    // 文件选择
    $(".photo-input").on("change", function () {
      var files = this.files;
      if (!files || files.length === 0) return;
      var currentType = $(this).data("current-type");
      NameplatePhotoUpload.handleFileSelect(files, currentType);
      $(this).val("");
    });

    // 底部按钮区
    // 保存按钮（文案由入口决定：保存 / 保存并返回）
    $(".confirm-section").on("click", ".btn-save", function () {
      NameplatePhotoUpload.handleSave();
    });

    // 订单信息区：模板选择/预览/折叠
    $(".order-info-area").on("click", ".pick-template-btn", function () {
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
    // 模板图点击：只做预览，不触发卡片头的折叠切换
    $(".order-info-area").on("click", ".template-image", function (e) {
      e.stopPropagation();
      var url = $(this).attr("src");
      if (url) NameplatePhotoUpload.showPhotoPreview(url);
    });
    $(".order-info-area").on("click", ".btn-toggle-order-info", function () {
      NameplatePhotoUpload.state.orderInfoCollapsed = !NameplatePhotoUpload.state.orderInfoCollapsed;
      // 记录用户意图：此后紧凑视口的自动收起/展开不再覆盖
      NameplatePhotoUpload.state.orderInfoCollapsedByUser = true;
      NameplatePhotoUpload.renderOrderInfo();
    });

    // ===== 弹窗骨架（常驻，事件绑一次） =====
    // Toast：点击遮罩或确定按钮关闭
    $(".template-toast").on("click", function (e) {
      if (e.target === this || $(e.target).hasClass("toast-btn")) {
        var callback = $(".template-toast").data("close-callback");
        if (callback) callback();
      }
    });
    // 模板选择：列表项/取消/遮罩（强制选择模式下「取消」不关闭并提示）
    $(".picker-list").on("click", ".picker-item", function () {
      var callback = $(".template-picker").data("on-pick");
      $(".template-picker").addClass("hidden");
      if (callback) callback($(this).data("id"), $(this).data("name"), $(this).data("url"));
    });
    $(".template-picker .picker-btn").on("click", function () {
      if ($(".template-picker").data("force-choose")) {
        NameplatePhotoUpload.showToast("提示", "该订单有多个铭牌模板，请先选择后再保存", "error");
        return;
      }
      $(".template-picker").addClass("hidden");
    });
    $(".template-picker").on("click", function (e) {
      if (e.target === this) $(this).addClass("hidden");
    });
  },

  // ============== 页面初始化 ==============
  initPage: function () {
    // Portal 表单环境：HTML 片段可能晚于 JS 就绪注入，先等根容器出现再初始化（选择器空集合会崩）
    if (!$(".mom-photo-upload").length) {
      NameplatePhotoUpload._initRetryCount++;
      if (NameplatePhotoUpload._initRetryCount > 100) return;
      setTimeout(function () {
        NameplatePhotoUpload.initPage();
      }, 50);
      return;
    }

    // 缓存按钮初始文案（骨架在 index.html，JS 恢复时用，避免双重定义）
    $(".btn-save").data("label", $(".btn-save").text());

    NameplatePhotoUpload.state.fromKeyPart = NameplatePhotoUpload.isKeyPartEntry();

    NameplatePhotoUpload.initEvents();

    // 渲染初始表单状态（按钮文案按入口切换、查询前置灰）
    NameplatePhotoUpload.renderForm();

    // 高度链兜底（宿主没给高度链时才生效）与紧凑视口布局，并在尺寸变化时重算
    NameplatePhotoUpload.fitPageHeight();
    NameplatePhotoUpload.applyCompactLayout();
    $(window).on(
      "resize",
      NameplatePhotoUpload.debounce(CONFIG.RESIZE_DEBOUNCE, function () {
        NameplatePhotoUpload.fitPageHeight();
        NameplatePhotoUpload.applyCompactLayout();
      }),
    );

    NameplatePhotoUpload.loadStationList();

    // 关重件绑定页面入口：用带入的工位与订单号预填并自动查询，省去现场重复输入
    var keyPartStationCode = window.KeyPartStationCode || "";
    var keyPartOrderNo = window.KeyPartOrderNo || "";
    if (NameplatePhotoUpload.state.fromKeyPart && keyPartStationCode && keyPartOrderNo) {
      NameplatePhotoUpload.prefillKeyPartOrder(keyPartStationCode, keyPartOrderNo);
    }
  },

  /**
   * 关重件绑定入口预填：先落下订单号，工位编码待工位列表就绪后按编码匹配（匹配不到只填编码原文）
   * 两者齐备后自动发起一次照片配置查询
   */
  prefillKeyPartOrder: function (keyPartStationCode, keyPartOrderNo) {
    $(".input-order").val(keyPartOrderNo);
    NameplatePhotoUpload.state.orderNo = keyPartOrderNo;

    function matchStation() {
      var stations = NameplatePhotoUpload.state.stations || [];
      for (var i = 0; i < stations.length; i++) {
        if (stations[i].stationCode === keyPartStationCode) {
          NameplatePhotoUpload.selectStation(stations[i].stationCode, stations[i].stationName);
          return;
        }
      }
      NameplatePhotoUpload.state.stationCode = keyPartStationCode;
      $(".input-station").val(keyPartStationCode);
      $(".input-station-code").val(keyPartStationCode);
    }

    if (NameplatePhotoUpload.state.stationsLoaded) {
      matchStation();
      NameplatePhotoUpload.doQueryPhotoConfig();
    } else {
      // 等列表就绪再匹配；超时放弃（工位列表接口自身有超时兜底与失败提示，不在此永久轮询）
      var waited = 0;
      var waitStationList = setInterval(function () {
        waited += 100;
        if (!NameplatePhotoUpload.state.stationsLoaded) {
          if (waited >= 10000) clearInterval(waitStationList);
          return;
        }
        clearInterval(waitStationList);
        matchStation();
        NameplatePhotoUpload.doQueryPhotoConfig();
      }, 100);
    }
  },
};

// ============== 启动 ==============
$(function () {
  NameplatePhotoUpload.initPage();
});
