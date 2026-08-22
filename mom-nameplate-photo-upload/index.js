// ============== 配置 ==============
var CONFIG = {
  MAX_IMAGE_WIDTH: 3000,
  MAX_IMAGE_HEIGHT: 3000,
  JPEG_QUALITY: 0.8,
  MOCK_DELAY: 500,
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

  // ============== 工具函数 ==============
  h: function (str) {
    // 默认转义：所有动态插值必须经过本函数
    // 用 split/join 而非正则字面量：避免平台高亮器对正则中的 < > & " ' 误判
    if (str == null) return "";
    return String(str)
      .split("&").join("&amp;")
      .split("<").join("&lt;")
      .split(">").join("&gt;")
      .split('"').join("&quot;")
      .split("'").join("&#39;");
  },

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

  // ============== 加载动画 ==============
  showLoading: function (text) {
    $(
      `<div class="loading-mask">
        <div class="loading-box">
          <div class="loading-spinner"></div>
          <div class="loading-text">${PhotoUpload.h(text || "加载中...")}</div>
        </div>
      </div>`,
    ).appendTo("#mom-photo-upload");
  },

  hideLoading: function () {
    $(".loading-mask").remove();
  },

  // ============== Toast 消息提示框 ==============
  showToast: function (title, content, type, callback) {
    $(".toast-mask").remove();

    var icon =
      type == "error"
        ? `<div class="toast-icon-error"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>`
        : `<div class="toast-icon-success"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 13l4 4L19 7"/></svg></div>`;

    var $toastEl, autoDismiss;

    function close() {
      if (autoDismiss) clearTimeout(autoDismiss);
      if (!$toastEl || $toastEl.hasClass("closing")) return;
      $toastEl.addClass("closing");
      $toastEl.one("animationend", function () {
        $toastEl.remove();
        if (callback) callback();
      });
    }

    var contentHtml = content ? `<div class="toast-content">${content}</div>` : "";

    $toastEl = $(
      `<div class="toast-mask">
        <div class="toast-box">
          <div class="toast-icon-area">${icon}</div>
          <div class="toast-title">${PhotoUpload.h(title)}</div>
          ${contentHtml}
          <button type="button" class="toast-btn">确定</button>
        </div>
      </div>`,
    ).appendTo("#mom-photo-upload");
    $toastEl.on("click", function (e) {
      if (e.target == this) close();
    });
    $toastEl.find(".toast-btn").on("click", close);

    if (type != "error") {
      autoDismiss = setTimeout(close, 3000);
    }
  },

  // ============== 二次确认弹窗 ==============
  showConfirmDialog: function (message, onConfirm) {
    $(".toast-mask,.template-picker-mask,.confirm-mask").remove();

    var $mask = $(
      `<div class="confirm-mask">
        <div class="confirm-box">
          <div class="confirm-title">提示</div>
          <div class="confirm-content">${PhotoUpload.h(message)}</div>
          <div class="confirm-btns">
            <button type="button" class="confirm-btn-cancel">取消</button>
            <button type="button" class="confirm-btn-ok">确定</button>
          </div>
        </div>
      </div>`,
    ).appendTo("#mom-photo-upload");

    function close() {
      $mask.remove();
    }

    $mask.find(".confirm-btn-ok").on("click", function () {
      close();
      if (onConfirm) onConfirm();
    });
    $mask.find(".confirm-btn-cancel").on("click", close);
    $mask.on("click", function (e) {
      if (e.target == this) close();
    });
  },

  // ============== 模板选择弹窗 ==============
  showTemplatePicker: function (templates, callback) {
    $(".toast-mask,.template-picker-mask,.confirm-mask").remove();

    var itemsHtml = templates
      .map(
        (tpl) =>
          `<div class="picker-item" data-id="${PhotoUpload.h(tpl.templateId)}" data-name="${PhotoUpload.h(tpl.templateName)}" data-url="${PhotoUpload.h(tpl.templateImageUrl)}">
            <img src="${PhotoUpload.h(tpl.templateImageUrl)}" alt="${PhotoUpload.h(tpl.templateName)}">
            <div class="picker-item-name">${PhotoUpload.h(tpl.templateName)}</div>
          </div>`,
      )
      .join("");

    var $mask = $(
      `<div class="template-picker-mask">
        <div class="template-picker-box">
          <div class="picker-title">请选择铭牌模板</div>
          <div class="picker-list">${itemsHtml}</div>
          <button type="button" class="picker-btn">取消</button>
        </div>
      </div>`,
    ).appendTo("#mom-photo-upload");

    function close(templateId, templateName, templateUrl) {
      $mask.remove();
      if (callback) callback(templateId, templateName, templateUrl);
    }

    $mask.find(".picker-item").on("click", function () {
      close($(this).data("id"), $(this).data("name"), $(this).data("url"));
    });
    $mask.find(".picker-btn").on("click", function () {
      close("", "", "");
    });
    $mask.on("click", function (e) {
      if (e.target == this) close("", "", "");
    });
  },

  // ============== 表单渲染（骨架已静态化，此处仅切换状态与回填值） ==============
  renderForm: function () {
    var s = PhotoUpload.state;
    var $card = $("#form-card");
    var $summary = $("#form-summary");
    var $btnRow = $("#form-btn-row");
    var $clearBefore = $("#btn-clear-before");

    if (s.formCollapsed && s.configLoaded) {
      $card.addClass("hidden");
      $btnRow.addClass("hidden");
      $clearBefore.addClass("hidden");
      $summary.html(PhotoUpload.buildSummaryHtml()).removeClass("hidden");
    } else {
      $card.removeClass("hidden");
      $btnRow.toggleClass("hidden", !s.configLoaded);
      $clearBefore.toggleClass("hidden", s.configLoaded);
      $summary.addClass("hidden");
      // 回填当前值
      $("#input-station").val(s.stationCode ? PhotoUpload.getStationDisplay(s.stationCode) : "");
      $("#input-station-code").val(s.stationCode);
      $("#input-order").val(s.orderNo);
    }
  },

  buildSummaryHtml: function () {
    var s = PhotoUpload.state;
    return `<div class="summary-info">
        <span class="summary-label">工位</span>
        <span class="summary-value">${PhotoUpload.h(s.stationCode)}</span>
        <span class="summary-divider">|</span>
        <span class="summary-label">订单</span>
        <span class="summary-value">${PhotoUpload.h(s.orderNo)}</span>
      </div>
      <button type="button" class="summary-clear btn-clear-form" title="清空">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
      <button type="button" class="summary-expand btn-expand-form">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
      </button>`;
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
      for (var i = 0; i < filtered.length; i++) {
        var s = filtered[i];
        $dd.append(
          `<div class="combobox-item" data-code="${PhotoUpload.h(s.stationCode)}" data-name="${PhotoUpload.h(s.stationName)}">
            <span class="combobox-item-code">${PhotoUpload.h(s.stationCode)}</span>
            <span class="combobox-item-name">${PhotoUpload.h(s.stationName)}</span>
          </div>`,
        );
      }
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
    $("#order-info-area").empty().addClass("hidden");
    $("#photo-cards-area").empty();
    $("#confirm-section").addClass("hidden");
  },

  // ============== 表单折叠/展开/清空 ==============
  collapseForm: function () {
    PhotoUpload.state.formCollapsed = true;
    PhotoUpload.renderForm();
  },

  expandForm: function () {
    PhotoUpload.state.formCollapsed = false;
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

      // 折叠表单，订单信息默认展开
      s.formCollapsed = true;
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

  // ============== 订单信息卡片渲染 ==============
  renderOrderInfo: function () {
    var $area = $("#order-info-area");
    var s = PhotoUpload.state;
    $area.empty();

    if (!s.orderInfo || (!s.orderInfo.machineCode && (!s.orderInfo.templates || !s.orderInfo.templates.length))) {
      $area.addClass("hidden");
      return;
    }

    var arrowIcon = s.orderInfoCollapsed
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 15l-6-6-6 6"/></svg>';

    var html = `<div class="order-info-card">
      <div class="order-info-header" id="btn-toggle-order-info">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
        <span>订单信息</span>
        <span class="order-info-arrow">${arrowIcon}</span>
      </div>`;

    if (!s.orderInfoCollapsed) {
      html += `<div class="order-info-body">`;

      if (s.orderInfo.machineCode || s.orderInfo.vin) {
        html += `<div class="field-row field-row-inline">
          <span class="field-label">主机编码</span>
          <span class="field-value">${PhotoUpload.h(s.orderInfo.machineCode || "-")}</span>
          <span class="field-label" style="margin-left:12px;">VIN</span>
          <span class="field-value">${PhotoUpload.h(s.orderInfo.vin || "-")}</span>
        </div>`;
      }

      // 铭牌模板
      var templates = s.orderInfo.templates || [];
      if (templates.length > 0) {
        if (templates.length == 1) {
          html += `<div class="field-row"><span class="field-label">铭牌模板</span><span class="field-value">${PhotoUpload.h(templates[0].templateName || "")}</span></div>`;
          html += `<img class="template-image" src="${PhotoUpload.h(templates[0].templateImageUrl)}" alt="铭牌模板">`;
        } else if (s.selectedTemplateId) {
          html += `<div class="field-row template-field-row">
            <span class="field-label">铭牌模板</span>
            <span class="field-value">${PhotoUpload.h(s.selectedTemplateName)}</span>
            <button type="button" class="btn-change-template-inline" id="btn-pick-template">更换</button>
          </div>`;
          html += `<img class="template-image" src="${PhotoUpload.h(s.selectedTemplateUrl)}" alt="铭牌模板">`;
        } else {
          html += `<div class="field-row">
            <span class="field-label">铭牌模板</span>
            <button type="button" class="btn-pick-template-inline" id="btn-pick-template">点击选择（${templates.length}个可选）</button>
          </div>`;
        }
      }

      html += `</div>`;
    }

    html += `</div>`;

    $area.html(html).removeClass("hidden");
  },

  // ============== 照片类型卡片渲染 ==============
  renderPhotoTypeCards: function () {
    var $area = $("#photo-cards-area");
    var s = PhotoUpload.state;
    $area.empty();

    if (!s.photoTypes.length) {
      $area.append(
        `<div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          <p>该工位无需拍照</p>
        </div>`,
      );
      return;
    }

    for (var i = 0; i < s.photoTypes.length; i++) {
      var pt = s.photoTypes[i];
      var takenCount = (s.photos[pt.typeCode] || []).length;
      var reachedMin = takenCount >= pt.minCount;
      var reachedMax = takenCount >= pt.maxCount;

      var badgeHtml;
      var progressPct;
      if (reachedMin) {
        badgeHtml = `<span class="card-badge done"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:14px;height:14px;"><path d="M5 13l4 4L19 7"/></svg>已完成</span>`;
        progressPct = 100;
      } else {
        badgeHtml = `<span class="card-badge pending">${takenCount}/${pt.minCount}~${pt.maxCount}</span>`;
        progressPct = Math.min(100, (takenCount / pt.minCount) * 100);
      }

      var thumbsHtml = (s.photos[pt.typeCode] || [])
        .map(
          (p, j) =>
            `<div class="photo-item" data-type="${PhotoUpload.h(pt.typeCode)}" data-index="${j}">
              <img src="${PhotoUpload.h(p.url)}" alt="photo">
              <button type="button" class="photo-delete">
                <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>`,
        )
        .join("");

      var addHtml = reachedMax
        ? `<div class="photo-full-tip">已达上限</div>`
        : `<div class="photo-add" data-type="${PhotoUpload.h(pt.typeCode)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            <span>拍照</span>
          </div>`;

      var cardHtml = `<div class="photo-type-card${reachedMin ? " complete" : ""}" data-type="${PhotoUpload.h(pt.typeCode)}">
        <div class="card-header">
          <div class="card-title-row">
            <span class="card-title">${PhotoUpload.h(pt.typeName)}</span>
            ${badgeHtml}
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${progressPct}%;"></div>
          </div>
        </div>
        <div class="photo-thumb-list">${thumbsHtml}${addHtml}</div>
      </div>`;

      $area.append($(cardHtml));
    }

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
      PhotoUpload.showToast("提示", `「${pt.typeName}」已达到最大数量 ${pt.maxCount} 张`, "error");
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

  // ============== 照片预览（支持缩放拖动） ==============
  showPhotoPreview: function (url) {
    var scale = 1;
    var panX = 0;
    var panY = 0;
    var imgW = 0;
    var imgH = 0;

    var $mask = $(
      `<div class="photo-preview-mask">
        <button type="button" class="photo-preview-close">&times;</button>
        <div class="photo-preview-viewport">
          <div class="photo-preview-panner">
            <img class="photo-preview-img" src="${PhotoUpload.h(url)}" alt="preview">
          </div>
        </div>
      </div>`,
    ).appendTo("#mom-photo-upload");

    var $img = $mask.find(".photo-preview-img");
    var $panner = $mask.find(".photo-preview-panner");
    var $vp = $mask.find(".photo-preview-viewport");

    function apply() {
      $panner.css("transform", `translate(${panX}px, ${panY}px)`);
      $img.css("transform", `scale(${scale})`);
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

    function close() {
      $mask.remove();
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
    $mask.find(".photo-preview-close").on("click", close);

    // 图片加载后居中
    function init() {
      setTimeout(centerImage, 50);
    }
    if ($img[0].complete && $img[0].naturalWidth) {
      init();
    } else {
      $img.on("load", init);
    }
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
        errors.push(`「${pt.typeName}」还需拍摄 ${pt.minCount - taken} 张（至少 ${pt.minCount} 张）`);
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
      var typeSummary = PhotoUpload.state.photoTypes
        .map(function (pt) {
          var count = (PhotoUpload.state.photos[pt.typeCode] || []).length;
          return `<div class="detail-row"><span class="detail-label">${PhotoUpload.h(pt.typeName)}</span><span class="detail-value">${count} 张（${pt.minCount}~${pt.maxCount}）</span></div>`;
        })
        .join("");

      var detailHtml = [
        `<div class="detail-row"><span class="detail-label">工位</span><span class="detail-value">${PhotoUpload.h(PhotoUpload.state.stationCode)}</span></div>`,
        `<div class="detail-row"><span class="detail-label">订单号</span><span class="detail-value">${PhotoUpload.h(PhotoUpload.state.orderNo)}</span></div>`,
        `<div class="detail-row"><span class="detail-label">主机编码</span><span class="detail-value">${PhotoUpload.h(PhotoUpload.state.orderInfo.machineCode)}</span></div>`,
        `<div class="detail-row"><span class="detail-label">VIN</span><span class="detail-value">${PhotoUpload.h(PhotoUpload.state.orderInfo.vin || "-")}</span></div>`,
        `<div class="detail-row"><span class="detail-label">照片总数</span><span class="detail-value">${totalPhotos} 张</span></div>`,
        typeSummary,
      ].join("");

      PhotoUpload.showToast(actionText + "成功", detailHtml, "success", function () {
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

    // 收起/展开/清空（class 委托，覆盖展开态与折叠态两处按钮）
    $("#form-area").on("click", ".btn-collapse-form", function () {
      PhotoUpload.collapseForm();
    });
    $("#form-area").on("click", ".btn-expand-form", function () {
      PhotoUpload.expandForm();
    });
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
    $("#order-info-area").on("click", "#btn-pick-template", function () {
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
  },

  // ============== 页面初始化 ==============
  initPage: function () {
    // 缓存按钮初始文案（骨架在 index.html，JS 恢复时用，避免双重定义）
    $("#btn-confirm").data("label", $("#btn-confirm").text());
    $("#btn-save").data("label", $("#btn-save").text());

    // 头部：操作员 + 时钟
    $("#header-operator").text(PhotoUpload.h(window.Operator));

    function now() {
      var d = new Date();
      var pad = function (n) { return n < 10 ? "0" + n : n; };
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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
