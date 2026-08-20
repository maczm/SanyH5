// ============== 配置 ==============
var CONFIG = {
  MAX_IMAGE_WIDTH: 3000,
  MAX_IMAGE_HEIGHT: 3000,
  JPEG_QUALITY: 0.8,
  MOCK_DELAY: 500,
};

/*
 * ============== 生产对接说明 ==============
 *
 * 以下 MOCK 区块（#MOCK-START 到 #MOCK-END）仅在本地开发时生效。
 * Portal 生产环境会在 iframe 加载前向 window 注入同名的真实函数，
 * JS 通过 if (typeof window.xxx != 'function') 检测：
 *   - Portal 已注入 → 跳过 mock，使用真实函数
 *   - Portal 未注入 → 启用 mock，方便本地开发调试
 *
 * 【切换到生产模式】：
 *   方式一（推荐）：删除 #MOCK-START 到 #MOCK-END 之间的全部代码，
 *                 Portal 注入的函数会自动生效，无需改其他代码。
 *   方式二：Portal 注入后 mock 自动跳过，可直接部署，mock 代码
 *           不会执行但会占用体积，建议用方式一清理。
 *
 * 各 API mock 说明：
 *   API 1 (工位列表) : 返回模拟工位数据
 *   API 2 (照片配置) : 返回照片类型（含 minCount/maxCount）和订单信息（含铭牌模板列表）
 *   API 3 (照片上传) : 直接返回 base64 当作 URL（生产需上传到 CDN/OSS）
 *   API 4 (记录提交) : 随机 10% 概率失败模拟异常。提交与保存共用本 API，
 *                      通过 data.saveType 区分：'submit'=提交检测（二次确认后触发），'save'=草稿保存（不触发检测）
 *   window.Operator  : 默认 "开发用户"（生产由 Portal 注入真实工号）
 *
 * 生产环境中，Portal 必须注入以下 5 个 window 属性：
 *   window.getStationList     — API 1：获取工位列表
 *   window.getPhotoConfig     — API 2：获取照片类型配置 + 订单信息
 *   window.uploadPhoto        — API 3：照片上传
 *   window.submitPhotoRecord  — API 4：照片记录提交/保存（data.saveType 区分：'submit' / 'save'）
 *   window.Operator           — 当前操作员姓名
 */

// ============== #MOCK-START ==============
// ↓↓↓ 以下为 Mock 代码，生产环境可全部删除 ↓↓↓

// -- Mock 工位列表 --
var mockStations = [
  { stationCode: "S001", stationName: "1号工位-外观检测" },
  { stationCode: "S002", stationName: "2号工位-尺寸测量" },
  { stationCode: "S003", stationName: "3号工位-包装终检" },
  { stationCode: "S004", stationName: "4号工位-电气测试" },
  { stationCode: "S005", stationName: "5号工位-密封检测" },
  { stationCode: "S006", stationName: "6号工位-承重测试" },
  { stationCode: "S007", stationName: "7号工位-终检复核" },
];

// -- Mock 照片配置（不同工位返回不同类型，含 minCount/maxCount） --
var mockPhotoConfigs = {
  S001: {
    photoTypes: [
      { typeCode: "appearance_front", typeName: "正面外观", minCount: 2, maxCount: 5 },
      { typeCode: "appearance_back", typeName: "背面外观", minCount: 2, maxCount: 5 },
      { typeCode: "appearance_side", typeName: "侧面外观", minCount: 1, maxCount: 3 },
    ],
    orderInfo: {
      machineCode: "MC-2024-A001",
      vin: "LSVAU2A00N2100001",
      templates: [
        { templateId: "TPL001", templateName: "普通铭牌", templateImageUrl: "../18601605145677184.jpg" },
        { templateId: "TPL002", templateName: "上装铭牌", templateImageUrl: "../18601605145677184.jpg" },
        { templateId: "TPL003", templateName: "特殊铭牌", templateImageUrl: "../18601605145677184.jpg" },
      ],
    },
  },
  S002: {
    photoTypes: [
      { typeCode: "measure_length", typeName: "长度测量", minCount: 1, maxCount: 2 },
      { typeCode: "measure_width", typeName: "宽度测量", minCount: 1, maxCount: 2 },
      { typeCode: "measure_height", typeName: "高度测量", minCount: 1, maxCount: 2 },
      { typeCode: "measure_overall", typeName: "整体尺寸", minCount: 1, maxCount: 1 },
    ],
    orderInfo: {
      machineCode: "MC-2024-B002",
      vin: "LSVAU2B00N2100002",
      templates: [{ templateId: "TPL010", templateName: "尺寸铭牌", templateImageUrl: "../18601605145677184.jpg" }],
    },
  },
  S003: {
    photoTypes: [
      { typeCode: "package_label", typeName: "标签照片", minCount: 1, maxCount: 3 },
      { typeCode: "package_seal", typeName: "封箱照片", minCount: 1, maxCount: 3 },
      { typeCode: "package_overall", typeName: "整体包装", minCount: 2, maxCount: 4 },
    ],
    orderInfo: {
      machineCode: "MC-2024-C003",
      vin: "LSVAU2C00N2100003",
      templates: [],
    },
  },
  S004: {
    photoTypes: [
      { typeCode: "elec_panel", typeName: "电控面板", minCount: 1, maxCount: 2 },
      { typeCode: "elec_wiring", typeName: "接线图", minCount: 1, maxCount: 3 },
    ],
    orderInfo: {
      machineCode: "MC-2024-D004",
      vin: "LSVAU2D00N2100004",
      templates: [
        { templateId: "TPL020", templateName: "电气铭牌A", templateImageUrl: "../18601605145677184.jpg" },
        { templateId: "TPL021", templateName: "电气铭牌B", templateImageUrl: "../18601605145677184.jpg" },
      ],
    },
  },
};

// -- Mock API 1：工位列表 --
if (typeof window.getStationList != "function") {
  window.getStationList = function (callback) {
    setTimeout(function () {
      callback({ code: 0, msg: "success", data: mockStations });
    }, CONFIG.MOCK_DELAY);
  };
}

// -- Mock API 2：照片类型配置 + 订单信息 --
if (typeof window.getPhotoConfig != "function") {
  window.getPhotoConfig = function (params, callback) {
    setTimeout(function () {
      var config = mockPhotoConfigs[params.stationCode];
      if (config) {
        callback({ code: 0, msg: "success", data: config });
      } else {
        callback({
          code: 0,
          msg: "success",
          data: {
            photoTypes: [
              { typeCode: "default", typeName: "通用照片", minCount: 1, maxCount: 3 },
            ],
            orderInfo: {
              machineCode: "MC-UNKNOWN",
              vin: "",
              templates: [],
            },
          },
        });
      }
    }, CONFIG.MOCK_DELAY);
  };
}

// -- Mock API 3：照片上传 --
if (typeof window.uploadPhoto != "function") {
  window.uploadPhoto = function (params, callback) {
    setTimeout(function () {
      // Mock: 直接返回 base64 作为 URL
      callback({ code: 0, msg: "success", data: { url: params.base64 } });
    }, 300);
  };
}

// -- Mock API 4：记录提交/保存（saveType 区分） --
if (typeof window.submitPhotoRecord != "function") {
  window.submitPhotoRecord = function (data, callback) {
    setTimeout(function () {
      if (Math.random() < 0.1) {
        callback({ code: 1, msg: "系统繁忙，请稍后重试" });
      } else {
        callback({ code: 0, msg: data.saveType == "save" ? "保存成功" : "提交成功" });
      }
    }, 800);
  };
}

// -- Mock 操作员 --
if (!window.Operator) {
  window.Operator = "开发用户";
}

// ↑↑↑ 以上为 Mock 代码，生产环境可全部删除 ↑↑↑
// ============== #MOCK-END ==============

// ============== 状态管理 ==============
var state = {
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
    templates: [],      // [{ templateId, templateImageUrl }]
  },
  selectedTemplateId: "",
  selectedTemplateName: "",
  selectedTemplateUrl: "",
  stations: [],         // 工位列表缓存
};

// ============== 工具函数 ==============
function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildFieldRow(label, value) {
  return (
    '<div class="field-row"><span class="field-label">' +
    escapeHtml(label) +
    '</span><span class="field-value">' +
    escapeHtml(value) +
    "</span></div>"
  );
}

// ============== 加载动画 ==============
function showLoading(text) {
  $(
    '<div class="loading-mask">' +
      '<div class="loading-box">' +
      '<div class="loading-spinner"></div>' +
      '<div class="loading-text">' +
      escapeHtml(text || "加载中...") +
      "</div>" +
      "</div>" +
      "</div>",
  ).appendTo("#mom-photo-upload");
}

function hideLoading() {
  $(".loading-mask").remove();
}

// ============== Toast 消息提示框 ==============
function showToast(title, content, type, callback) {
  $(".toast-mask").remove();

  var icon =
    type == "error"
      ? '<div class="toast-icon-error"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>'
      : '<div class="toast-icon-success"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 13l4 4L19 7"/></svg></div>';

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

  var contentHtml = "";
  if (content) {
    contentHtml = '<div class="toast-content">' + content + "</div>";
  }

  $toastEl = $(
    '<div class="toast-mask">' +
      '<div class="toast-box">' +
      '<div class="toast-icon-area">' +
      icon +
      "</div>" +
      '<div class="toast-title">' +
      escapeHtml(title) +
      "</div>" +
      contentHtml +
      '<button type="button" class="toast-btn">确定</button>' +
      "</div>" +
      "</div>",
  ).appendTo("#mom-photo-upload");
  $toastEl.on("click", function (e) {
    if (e.target == this) close();
  });
  $toastEl.find(".toast-btn").on("click", close);

  if (type != "error") {
    autoDismiss = setTimeout(close, 3000);
  }
}

// ============== 模板选择弹窗 ==============
function showTemplatePicker(templates, callback) {
  $(".toast-mask,.template-picker-mask").remove();

  var itemsHtml = "";
  for (var i = 0; i < templates.length; i++) {
    var tpl = templates[i];
    itemsHtml +=
      '<div class="picker-item" data-id="' + escapeHtml(tpl.templateId) + '" data-name="' + escapeHtml(tpl.templateName) + '" data-url="' + escapeHtml(tpl.templateImageUrl) + '">' +
        '<img src="' + escapeHtml(tpl.templateImageUrl) + '" alt="' + escapeHtml(tpl.templateName) + '">' +
        '<div class="picker-item-name">' + escapeHtml(tpl.templateName) + '</div>' +
      '</div>';
  }

  var $mask = $(
    '<div class="template-picker-mask">' +
      '<div class="template-picker-box">' +
        '<div class="picker-title">请选择铭牌模板</div>' +
        '<div class="picker-list">' + itemsHtml + '</div>' +
        '<button type="button" class="picker-btn">取消</button>' +
      '</div>' +
    '</div>',
  ).appendTo("#mom-photo-upload");

  function close(templateId, templateName, templateUrl) {
    $mask.remove();
    if (callback) callback(templateId, templateName, templateUrl);
  }

  $mask.find(".picker-item").on("click", function () {
    var id = $(this).data("id");
    var name = $(this).data("name");
    var url = $(this).data("url");
    close(id, name, url);
  });

  $mask.find(".picker-btn").on("click", function () {
    close("", "", "");
  });

  $mask.on("click", function (e) {
    if (e.target == this) close("", "", "");
  });
}

// ============== 页面初始化 ==============
function initPage() {
  var $app = $(".app-container");

  // 头部
  function now() {
    var d = new Date();
    var pad = function (n) { return n < 10 ? "0" + n : n; };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }
  $app.append(
    '<div class="page-header">' +
      '<span class="header-title">照片上传</span>' +
      '<span class="header-operator">' + escapeHtml(window.Operator) + "</span>" +
      '<span class="header-time" id="header-time">' + now() + "</span>" +
      "</div>",
  );
  setInterval(function () {
    $("#header-time").text(now());
  }, 1000);

  // 表单区
  $app.append('<div class="form-area" id="form-area"></div>');

  // 订单信息区（初始隐藏）
  $app.append('<div class="order-info-area" id="order-info-area" style="display:none;"></div>');

  // 照片类型卡片区域（初始隐藏）
  $app.append('<div class="photo-cards-area" id="photo-cards-area" style="display:none;"></div>');

  // 确认按钮区（初始隐藏）：提交检测 + 保存
  $app.append(
    '<div class="confirm-section" id="confirm-section" style="display:none;">' +
      '<button type="button" class="btn-confirm" id="btn-confirm">提交检测</button>' +
      '<button type="button" class="btn-save" id="btn-save">保存</button>' +
      "</div>",
  );

  // 隐藏的文件选择 input
  $app.append(
    '<input type="file" id="photo-input" accept="image/*" style="position:absolute;opacity:0;width:0;height:0;overflow:hidden;">',
  );

  // 渲染表单
  renderForm();

  // 加载工位列表
  loadStationList();

  // 绑定事件
  initEvents();
}

// ============== 表单渲染 ==============
function renderForm() {
  var $area = $("#form-area");
  $area.empty();

  if (state.formCollapsed && state.configLoaded) {
    // 折叠态：摘要栏
    $area.html(
      '<div class="form-summary" id="form-summary">' +
        '<div class="summary-info">' +
          '<span class="summary-label">工位</span>' +
          '<span class="summary-value">' + escapeHtml(state.stationCode) + '</span>' +
          '<span class="summary-divider">|</span>' +
          '<span class="summary-label">订单</span>' +
          '<span class="summary-value">' + escapeHtml(state.orderNo) + '</span>' +
        '</div>' +
        '<button type="button" class="summary-clear" id="btn-clear-form" title="清空">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
        '</button>' +
        '<button type="button" class="summary-expand" id="btn-expand-form">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>' +
        '</button>' +
      '</div>',
    );
    return;
  }

  var html =
    '<div class="form-card">' +
      // 工位选择
      '<div class="form-group">' +
        '<label class="form-label">工位选择</label>' +
        '<div class="combobox-wrapper" id="combobox-station">' +
          '<input class="combobox-input" id="input-station" type="text" ' +
            'placeholder="输入工位编码或名称筛选" autocomplete="off" ' +
            'value="' + escapeHtml(state.stationCode ? getStationDisplay(state.stationCode) : "") + '">' +
          '<input type="hidden" id="input-station-code" value="' + escapeHtml(state.stationCode) + '">' +
          '<svg class="combobox-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>' +
          '<div class="combobox-dropdown" id="dropdown-station" style="display:none;"></div>' +
        '</div>' +
      '</div>' +
      // 订单号输入
      '<div class="form-group">' +
        '<label class="form-label">订单号</label>' +
        '<div class="input-row">' +
          '<input class="search-input" id="input-order" type="text" placeholder="请输入或扫码订单号" value="' + escapeHtml(state.orderNo) + '">' +
          '<button type="button" class="icon-btn btn-scan" id="btn-scan-order">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>' +
      // 查询按钮
      '<button type="button" class="btn-query" id="btn-query">查询照片配置</button>' +
      // 查询后显示收起和清空按钮
      (state.configLoaded
        ? '<div class="form-btn-row">' +
            '<button type="button" class="btn-collapse-form" id="btn-collapse-form">收起 ▲</button>' +
            '<button type="button" class="btn-clear-form" id="btn-clear-form">清空</button>' +
          '</div>'
        : '<button type="button" class="btn-clear-form" id="btn-clear-form" style="margin-top:8px;">清空</button>') +
    '</div>';

  $area.html(html);
}

function getStationDisplay(stationCode) {
  for (var i = 0; i < state.stations.length; i++) {
    if (state.stations[i].stationCode == stationCode) {
      return state.stations[i].stationCode + " - " + state.stations[i].stationName;
    }
  }
  return stationCode;
}

// ============== 加载工位列表 ==============
function loadStationList() {
  console.log("[API] getStationList");
  window.getStationList(function (res) {
    console.log("[API] getStationList 返回", res);
    if (res.code != 0) {
      showToast("加载失败", res.msg || "获取工位列表失败", "error");
      return;
    }
    state.stations = res.data || [];

    if (state.stationCode) {
      $("#input-station").val(getStationDisplay(state.stationCode));
      $("#input-station-code").val(state.stationCode);
    }
  });
}

// ============== 工位筛选 ==============
function filterStations(keyword) {
  if (!keyword) return state.stations;
  var kw = keyword.toLowerCase();
  return state.stations.filter(function (s) {
    return s.stationCode.toLowerCase().indexOf(kw) != -1 ||
           s.stationName.toLowerCase().indexOf(kw) != -1;
  });
}

function showStationDropdown() {
  var keyword = $("#input-station").val().trim();
  var filtered = filterStations(keyword);
  var $dd = $("#dropdown-station");
  $dd.empty();

  if (!filtered.length) {
    $dd.append('<div class="combobox-empty">无匹配工位</div>');
  } else {
    for (var i = 0; i < filtered.length; i++) {
      var s = filtered[i];
      $dd.append(
        '<div class="combobox-item" data-code="' + escapeHtml(s.stationCode) + '" data-name="' + escapeHtml(s.stationName) + '">' +
          '<span class="combobox-item-code">' + escapeHtml(s.stationCode) + '</span>' +
          '<span class="combobox-item-name">' + escapeHtml(s.stationName) + '</span>' +
        '</div>',
      );
    }
  }

  $dd.show();
}

function selectStation(stationCode, stationName) {
  state.stationCode = stationCode;
  $("#input-station").val(stationCode + " - " + stationName);
  $("#input-station-code").val(stationCode);
  $("#dropdown-station").hide();

  if (state.configLoaded) {
    state.configLoaded = false;
    hideResultAreas();
  }
}

function hideResultAreas() {
  $("#order-info-area").empty().hide();
  $("#photo-cards-area").empty().hide();
  $("#confirm-section").hide();
}

// ============== 表单折叠/展开/清空 ==============
function collapseForm() {
  state.formCollapsed = true;
  renderForm();
}

function expandForm() {
  state.formCollapsed = false;
  renderForm();
}

function clearForm() {
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

  hideResultAreas();
  renderForm();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ============== 事件绑定 ==============
function initEvents() {
  // 工位输入框
  $("#form-area").on("focus", "#input-station", function () {
    showStationDropdown();
  });
  $("#form-area").on("input", "#input-station", function () {
    $("#input-station-code").val("");
    state.stationCode = "";
    if (state.configLoaded) {
      state.configLoaded = false;
      hideResultAreas();
    }
    showStationDropdown();
  });
  $("#form-area").on("click", "#input-station", function () {
    showStationDropdown();
  });

  // 下拉选项点击
  $("#form-area").on("mousedown", ".combobox-item", function () {
    var code = $(this).data("code");
    var name = $(this).data("name");
    selectStation(code, name);
  });

  // 下拉箭头点击
  $("#form-area").on("click", ".combobox-arrow", function () {
    var $dd = $("#dropdown-station");
    if ($dd.is(":visible")) {
      $dd.hide();
    } else {
      showStationDropdown();
    }
  });

  // 点击页面其他地方关闭下拉
  $(document).on("mousedown", function (e) {
    if (!$(e.target).closest("#combobox-station").length) {
      $("#dropdown-station").hide();
      if (state.stationCode) {
        $("#input-station").val(getStationDisplay(state.stationCode));
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
    if (!state.stationCode) {
      var val = $(this).val().trim();
      if (val) {
        for (var i = 0; i < state.stations.length; i++) {
          if (state.stations[i].stationCode.toUpperCase() == val.toUpperCase()) {
            selectStation(state.stations[i].stationCode, state.stations[i].stationName);
            break;
          }
        }
      }
    }
  });

  // 查询按钮
  $("#form-area").on("click", "#btn-query", function () {
    doQueryPhotoConfig();
  });

  // 收起表单
  $("#form-area").on("click", "#btn-collapse-form", function () {
    collapseForm();
  });

  // 清空表单
  $("#form-area").on("click", "#btn-clear-form", function () {
    clearForm();
  });

  // 展开表单
  $("#form-area").on("click", "#btn-expand-form", function () {
    expandForm();
  });

  // 扫码按钮
  $("#form-area").on("click", "#btn-scan-order", function () {
    doScan("input-order", doQueryPhotoConfig);
  });

  // 订单号回车
  $("#form-area").on("keypress", "#input-order", function (e) {
    if (e.which != 13) return;
    doQueryPhotoConfig();
  });

  // 照片拍照按钮
  $("#photo-cards-area").on("click", ".btn-take-photo", function () {
    var typeCode = $(this).data("type");
    handleTakePhoto(typeCode);
  });

  // 文件选择
  $("#photo-input").on("change", function () {
    var files = this.files;
    if (!files || files.length == 0) return;
    var currentType = $(this).data("current-type");
    handleFileSelect(files, currentType);
    $(this).val("");
  });

  // 保存按钮（与提交检测交互一致，仅 saveType 不同）
  $("#confirm-section").on("click", "#btn-save", function () {
    handleSubmit("save");
  });

  // 提交检测按钮
  $("#confirm-section").on("click", "#btn-confirm", function () {
    handleSubmit("submit");
  });

  // 订单信息区：选择铭牌模板按钮
  $("#order-info-area").on("click", "#btn-pick-template", function () {
    if (!state.orderInfo.templates || !state.orderInfo.templates.length) return;
    showTemplatePicker(state.orderInfo.templates, function (templateId, templateName, templateUrl) {
      if (templateId) {
        state.selectedTemplateId = templateId;
        state.selectedTemplateName = templateName;
        state.selectedTemplateUrl = templateUrl;
        renderOrderInfo();
        updateSubmitButton();
      }
    });
  });

  // 订单信息区：模板图点击预览
  $("#order-info-area").on("click", ".template-image", function () {
    var url = $(this).attr("src");
    if (url) showPhotoPreview(url);
  });

  // 订单信息区：折叠/展开
  $("#order-info-area").on("click", "#btn-toggle-order-info", function () {
    state.orderInfoCollapsed = !state.orderInfoCollapsed;
    renderOrderInfo();
  });
}

// ============== 扫码 ==============
function doScan(inputId, callback) {
  if (window.parent && typeof window.parent.OpenCamera == "function") {
    window.parent.OpenCamera(function (res) {
      console.log("[Scan] OpenCamera 返回", res);
      var val = res.data || res.value || (typeof res == "string" ? res : "");
      if (val) {
        $("#" + inputId).val(val);
        callback();
      }
    });
  } else {
    showToast("提示", "扫码功能仅在移动端可用，请手动输入", "error");
  }
}

// ============== 查询照片配置 ==============
function doQueryPhotoConfig() {
  var stationCode = $("#input-station-code").val() || state.stationCode;
  var orderNo = $("#input-order").val().trim();

  if (!stationCode) {
    var typedVal = $("#input-station").val().trim();
    if (typedVal) {
      for (var i = 0; i < state.stations.length; i++) {
        var full = state.stations[i].stationCode + " - " + state.stations[i].stationName;
        if (full == typedVal) {
          stationCode = state.stations[i].stationCode;
          state.stationCode = stationCode;
          $("#input-station-code").val(stationCode);
          break;
        }
      }
    }
  }

  if (!stationCode) {
    showToast("提示", "请选择工位", "error");
    return;
  }
  if (!orderNo) {
    showToast("提示", "请输入订单号", "error");
    return;
  }

  state.stationCode = stationCode;
  state.orderNo = orderNo;

  showLoading("查询中...");
  console.log("[API] getPhotoConfig", { stationCode: stationCode, orderNo: orderNo });
  window.getPhotoConfig(
    { stationCode: stationCode, orderNo: orderNo },
    function (res) {
      console.log("[API] getPhotoConfig 返回", res);
      hideLoading();
      if (res.code != 0) {
        showToast("查询失败", res.msg || "获取照片配置失败", "error");
        return;
      }

      state.photoTypes = res.data.photoTypes || [];
      state.orderInfo = res.data.orderInfo || { machineCode: "", vin: "", templates: [] };
      state.photos = {};
      state.configLoaded = true;

      // 铭牌模板处理
      var templates = state.orderInfo.templates || [];
      if (templates.length == 1) {
        // 仅一个模板，自动选中
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

      // 折叠表单，订单信息默认展开
      state.formCollapsed = true;
      state.orderInfoCollapsed = false;
      renderForm();
      renderOrderInfo();
      renderPhotoTypeCards();
      $("#order-info-area").show();
      $("#photo-cards-area").show();
      $("#confirm-section").show();

      setTimeout(function () {
        $("#order-info-area")[0].scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    },
  );
}

// ============== 订单信息卡片渲染 ==============
function renderOrderInfo() {
  var $area = $("#order-info-area");
  $area.empty();

  if (!state.orderInfo || (!state.orderInfo.machineCode && (!state.orderInfo.templates || !state.orderInfo.templates.length))) {
    $area.hide();
    return;
  }

  var arrowIcon = state.orderInfoCollapsed
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 15l-6-6-6 6"/></svg>';

  var html =
    '<div class="order-info-card">' +
      '<div class="order-info-header" id="btn-toggle-order-info">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>' +
        '<span>订单信息</span>' +
        '<span class="order-info-arrow">' + arrowIcon + '</span>' +
      '</div>';

  if (!state.orderInfoCollapsed) {
    html += '<div class="order-info-body">';

    if (state.orderInfo.machineCode || state.orderInfo.vin) {
      html +=
        '<div class="field-row field-row-inline">' +
          '<span class="field-label">主机编码</span>' +
          '<span class="field-value">' + escapeHtml(state.orderInfo.machineCode || "-") + '</span>' +
          '<span class="field-label" style="margin-left:12px;">VIN</span>' +
          '<span class="field-value">' + escapeHtml(state.orderInfo.vin || "-") + '</span>' +
        '</div>';
    }

    // 铭牌模板
    var templates = state.orderInfo.templates || [];
    if (templates.length > 0) {
      if (templates.length == 1) {
        // 单模板：field-row 样式对齐主机编码
        html += buildFieldRow("铭牌模板", templates[0].templateName || "");
        html += '<img class="template-image" src="' + escapeHtml(templates[0].templateImageUrl) + '" alt="铭牌模板">';
      } else if (state.selectedTemplateId) {
        // 多模板已选择：field-row + 更换按钮 + 图片
        html +=
          '<div class="field-row template-field-row">' +
            '<span class="field-label">铭牌模板</span>' +
            '<span class="field-value">' + escapeHtml(state.selectedTemplateName) + '</span>' +
            '<button type="button" class="btn-change-template-inline" id="btn-pick-template">更换</button>' +
          '</div>';
        html += '<img class="template-image" src="' + escapeHtml(state.selectedTemplateUrl) + '" alt="铭牌模板">';
      } else {
        // 多模板未选择
        html +=
          '<div class="field-row">' +
            '<span class="field-label">铭牌模板</span>' +
            '<button type="button" class="btn-pick-template-inline" id="btn-pick-template">点击选择（' + templates.length + '个可选）</button>' +
          '</div>';
      }
    }

    html += '</div>';
  }

  html += '</div>';

  $area.html(html).show();
}

// ============== 照片类型卡片渲染 ==============
function renderPhotoTypeCards() {
  var $area = $("#photo-cards-area");
  $area.empty();

  if (!state.photoTypes.length) {
    $area.append(
      '<div class="empty-state">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>' +
        "<p>该工位无需拍照</p>" +
        "</div>",
    );
    return;
  }

  for (var i = 0; i < state.photoTypes.length; i++) {
    var pt = state.photoTypes[i];
    var takenCount = (state.photos[pt.typeCode] || []).length;
    var reachedMin = takenCount >= pt.minCount;
    var reachedMax = takenCount >= pt.maxCount;

    var badgeHtml;
    var progressPct;
    if (reachedMin) {
      badgeHtml = '<span class="card-badge done"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:14px;height:14px;"><path d="M5 13l4 4L19 7"/></svg>已完成</span>';
      progressPct = 100;
    } else {
      badgeHtml = '<span class="card-badge pending">' + takenCount + "/" + pt.minCount + "~" + pt.maxCount + "</span>";
      progressPct = Math.min(100, (takenCount / pt.minCount) * 100);
    }

    var cardHtml =
      '<div class="photo-type-card' + (reachedMin ? " complete" : "") + '">' +
        '<div class="card-header">' +
          '<div class="card-title-row">' +
            '<span class="card-title">' + escapeHtml(pt.typeName) + '</span>' +
            badgeHtml +
          '</div>' +
          '<div class="progress-bar">' +
            '<div class="progress-fill" style="width:' + progressPct + '%;"></div>' +
          '</div>' +
        '</div>' +
        '<div class="photo-thumb-list" id="thumb-list-' + escapeHtml(pt.typeCode) + '">';

    var photosOfType = state.photos[pt.typeCode] || [];
    for (var j = 0; j < photosOfType.length; j++) {
      cardHtml += buildPhotoThumb(pt.typeCode, j, photosOfType[j].url);
    }

    if (!reachedMax) {
      cardHtml +=
          '<div class="photo-add" data-type="' + escapeHtml(pt.typeCode) + '">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>' +
            "<span>拍照</span>" +
          '</div>';
    } else {
      cardHtml +=
          '<div class="photo-full-tip">已达上限</div>';
    }

    cardHtml +=
        '</div>' +
      '</div>';

    $area.append($(cardHtml));
  }

  for (var k = 0; k < state.photoTypes.length; k++) {
    var tc = state.photoTypes[k].typeCode;
    bindThumbEvents(tc);
  }

  $area.find(".photo-add").on("click", function () {
    var typeCode = $(this).data("type");
    handleTakePhoto(typeCode);
  });

  updateSubmitButton();
}

function buildPhotoThumb(typeCode, index, url) {
  return (
    '<div class="photo-item" data-type="' + escapeHtml(typeCode) + '" data-index="' + index + '">' +
      '<img src="' + escapeHtml(url) + '" alt="photo">' +
      '<button type="button" class="photo-delete">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
      '</button>' +
    '</div>'
  );
}

function bindThumbEvents(typeCode) {
  var $list = $("#thumb-list-" + typeCode);
  if (!$list.length) return;

  $list.find(".photo-item img").on("click", function () {
    var url = $(this).attr("src");
    showPhotoPreview(url);
  });

  $list.find(".photo-delete").on("click", function (e) {
    e.stopPropagation();
    var $item = $(this).closest(".photo-item");
    var index = parseInt($item.data("index"));
    deletePhoto(typeCode, index);
  });
}

// ============== 拍照处理 ==============
function handleTakePhoto(typeCode) {
  $("#photo-input").data("current-type", typeCode);
  $("#photo-input").click();
}

function handleFileSelect(files, typeCode) {
  if (!typeCode) return;

  var pt = findPhotoType(typeCode);
  if (!pt) return;

  var takenCount = (state.photos[typeCode] || []).length;
  if (takenCount >= pt.maxCount) {
    showToast("提示", "「" + pt.typeName + "」已达到最大数量 " + pt.maxCount + " 张", "error");
    return;
  }

  var file = files[0];

  compressImage(file, function (base64) {
    showLoading("上传中...");
    console.log("[API] uploadPhoto", {
      photoType: typeCode,
      stationCode: state.stationCode,
      orderNo: state.orderNo,
      base64: base64.substring(0, 80) + "...",
    });
    window.uploadPhoto(
      {
        photoType: typeCode,
        stationCode: state.stationCode,
        orderNo: state.orderNo,
        base64: base64,
      },
      function (res) {
        console.log("[API] uploadPhoto 返回", res);
        hideLoading();
        if (res.code != 0) {
          showToast("上传失败", res.msg || "请重试", "error");
          return;
        }
        if (!state.photos[typeCode]) {
          state.photos[typeCode] = [];
        }
        state.photos[typeCode].push({ url: res.data.url });
        renderPhotoTypeCards();
      },
    );
  });
}

function findPhotoType(typeCode) {
  for (var i = 0; i < state.photoTypes.length; i++) {
    if (state.photoTypes[i].typeCode == typeCode) return state.photoTypes[i];
  }
  return null;
}

// ============== 照片压缩 ==============
function compressImage(file, callback) {
  var reader = new FileReader();
  reader.onload = function (e) {
    var img = new Image();
    img.onload = function () {
      var width = img.width;
      var height = img.height;

      if (width > CONFIG.MAX_IMAGE_WIDTH) {
        height = Math.round((height * CONFIG.MAX_IMAGE_WIDTH) / width);
        width = CONFIG.MAX_IMAGE_WIDTH;
      }
      if (height > CONFIG.MAX_IMAGE_HEIGHT) {
        width = Math.round((width * CONFIG.MAX_IMAGE_HEIGHT) / height);
        height = CONFIG.MAX_IMAGE_HEIGHT;
      }

      var canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      var ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      var base64 = canvas.toDataURL("image/jpeg", CONFIG.JPEG_QUALITY);
      callback(base64);
    };
    img.onerror = function () {
      showToast("错误", "图片读取失败，请重试", "error");
    };
    img.src = e.target.result;
  };
  reader.onerror = function () {
    showToast("错误", "图片读取失败，请重试", "error");
  };
  reader.readAsDataURL(file);
}

// ============== 照片删除 ==============
function deletePhoto(typeCode, index) {
  if (!state.photos[typeCode]) return;
  state.photos[typeCode].splice(index, 1);
  renderPhotoTypeCards();
}

// ============== 照片预览（支持缩放拖动） ==============
function showPhotoPreview(url) {
  var scale = 1;
  var panX = 0;
  var panY = 0;
  var imgW = 0;
  var imgH = 0;

  var $mask = $(
    '<div class="photo-preview-mask">' +
      '<button type="button" class="photo-preview-close">&times;</button>' +
      '<div class="photo-preview-viewport">' +
        '<div class="photo-preview-panner">' +
          '<img class="photo-preview-img" src="' + escapeHtml(url) + '" alt="preview">' +
        '</div>' +
      '</div>' +
      "</div>",
  ).appendTo("#mom-photo-upload");

  var $img = $mask.find(".photo-preview-img");
  var $panner = $mask.find(".photo-preview-panner");
  var $vp = $mask.find(".photo-preview-viewport");

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
    // (fx - panX') / s' = (fx - panX) / s
    // => panX' = fx - (fx - panX) * (s' / s)
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
  var pinchDist0, pinchScale0, pinchPanX0, pinchPanY0, pinchCx0, pinchCy0;

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
      pinchCx0 = (t[0].clientX + t[1].clientX) / 2;
      pinchCy0 = (t[0].clientY + t[1].clientY) / 2;
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
    // 等待一帧确保布局完成
    setTimeout(centerImage, 50);
  }
  if ($img[0].complete && $img[0].naturalWidth) {
    init();
  } else {
    $img.on("load", init);
  }
}

// ============== 按钮状态（保存 + 提交检测，交互一致） ==============
function updateSubmitButton() {
  var $btn = $("#btn-confirm");
  var $save = $("#btn-save");

  // 两按钮可用条件一致：已加载配置 + 模板已选（如有）+ 全部达到 minCount
  if (!state.configLoaded || !state.photoTypes.length) {
    $btn.prop("disabled", true).text("提交检测");
    $save.prop("disabled", true).addClass("btn-disabled");
    return;
  }

  // 有模板时必须选了模板才能提交
  var templates = state.orderInfo.templates || [];
  if (templates.length > 0 && !state.selectedTemplateId) {
    $btn.prop("disabled", true).addClass("btn-disabled");
    $save.prop("disabled", true).addClass("btn-disabled");
    return;
  }

  var allReachedMin = true;
  for (var i = 0; i < state.photoTypes.length; i++) {
    var pt = state.photoTypes[i];
    var taken = (state.photos[pt.typeCode] || []).length;
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
}

// ============== 数据构建（保存/提交共用） ==============
function buildPhotoList() {
  var photoList = [];
  for (var i = 0; i < state.photoTypes.length; i++) {
    var pt = state.photoTypes[i];
    var photosOfType = state.photos[pt.typeCode] || [];
    var urlList = [];
    for (var j = 0; j < photosOfType.length; j++) {
      urlList.push(photosOfType[j].url);
    }
    photoList.push({
      photoType: pt.typeCode,
      urlList: urlList,
    });
  }
  return photoList;
}

function buildSubmitData(photoList, saveType) {
  return {
    stationCode: state.stationCode,
    orderNo: state.orderNo,
    operator: window.Operator,
    machineCode: state.orderInfo.machineCode,
    vin: state.orderInfo.vin,
    templateId: state.selectedTemplateId,
    templateImageUrl: state.selectedTemplateUrl,
    saveType: saveType, // 'submit'=提交检测 / 'save'=草稿保存
    photos: photoList,
  };
}

// ============== 二次确认弹窗 ==============
function showConfirmDialog(message, onConfirm) {
  $(".toast-mask,.template-picker-mask,.confirm-mask").remove();

  var $mask = $(
    '<div class="confirm-mask">' +
      '<div class="confirm-box">' +
        '<div class="confirm-title">提示</div>' +
        '<div class="confirm-content">' + escapeHtml(message) + "</div>" +
        '<div class="confirm-btns">' +
          '<button type="button" class="confirm-btn-cancel">取消</button>' +
          '<button type="button" class="confirm-btn-ok">确定</button>' +
        "</div>" +
      "</div>" +
    "</div>",
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
}

// ============== 提交/保存（交互一致，仅 saveType 区分后台逻辑） ==============
function handleSubmit(saveType) {
  if (state.submitting) return;

  // 有模板时必须选择
  var templates = state.orderInfo.templates || [];
  if (templates.length > 0 && !state.selectedTemplateId) {
    showToast("提示", "请选择铭牌模板", "error");
    return;
  }

  // 照片数量校验
  var errors = [];
  for (var i = 0; i < state.photoTypes.length; i++) {
    var pt = state.photoTypes[i];
    var taken = (state.photos[pt.typeCode] || []).length;
    if (taken < pt.minCount) {
      errors.push("「" + pt.typeName + "」还需拍摄 " + (pt.minCount - taken) + " 张（至少 " + pt.minCount + " 张）");
    }
  }

  if (errors.length) {
    showToast("照片未完成", errors.join("<br>"), "error");
    return;
  }

  // 二次确认：全部工位铭牌是否上传完毕
  showConfirmDialog("车辆所有工位铭牌是否全部上传", function () {
    doSubmit(saveType);
  });
}

function doSubmit(saveType) {
  var isSave = saveType == "save";
  var actionText = isSave ? "保存" : "提交";
  var photoList = buildPhotoList();
  var submitData = buildSubmitData(photoList, saveType);

  state.submitting = true;
  var $btn = $("#btn-confirm");
  $btn.prop("disabled", true).text(actionText + "中...");

  showLoading(actionText + "中...");

  console.log("[API] submitPhotoRecord(" + saveType + ")", submitData);
  window.submitPhotoRecord(submitData, function (res) {
    console.log("[API] submitPhotoRecord(" + saveType + ") 返回", res);
    hideLoading();
    state.submitting = false;
    $btn.prop("disabled", false).text("提交检测");

    if (res.code != 0) {
      showToast(actionText + "失败", res.msg || "请稍后重试", "error");
      return;
    }

    var totalPhotos = 0;
    for (var k = 0; k < photoList.length; k++) {
      totalPhotos += photoList[k].urlList.length;
    }
    var typeSummary = "";
    for (var i = 0; i < state.photoTypes.length; i++) {
      var pt = state.photoTypes[i];
      var count = (state.photos[pt.typeCode] || []).length;
      typeSummary +=
        '<div class="detail-row"><span class="detail-label">' +
        escapeHtml(pt.typeName) +
        '</span><span class="detail-value">' +
        count + " 张（" + pt.minCount + "~" + pt.maxCount + "）" +
        "</span></div>";
    }

    var detailHtml =
      '<div class="detail-row"><span class="detail-label">工位</span><span class="detail-value">' +
      escapeHtml(state.stationCode) +
      "</span></div>" +
      '<div class="detail-row"><span class="detail-label">订单号</span><span class="detail-value">' +
      escapeHtml(state.orderNo) +
      "</span></div>" +
      '<div class="detail-row"><span class="detail-label">主机编码</span><span class="detail-value">' +
      escapeHtml(state.orderInfo.machineCode) +
      "</span></div>" +
      '<div class="detail-row"><span class="detail-label">VIN</span><span class="detail-value">' +
      escapeHtml(state.orderInfo.vin || "-") +
      "</span></div>" +
      '<div class="detail-row"><span class="detail-label">照片总数</span><span class="detail-value">' +
      totalPhotos +
      " 张</span></div>" +
      typeSummary;

    showToast(actionText + "成功", detailHtml, "success", function () {
      resetForm();
    });
  });
}

// ============== 重置表单 ==============
function resetForm() {
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

  hideResultAreas();
  renderForm();
  loadStationList();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ============== 启动 ==============
$(function () {
  initPage();
});
