// ============== 配置 ==============
var CONFIG = {
  MAX_IMAGE_WIDTH: 3000,
  MAX_IMAGE_HEIGHT: 3000,
  JPEG_QUALITY: 0.8,
  MAX_PHOTOS: 20,
  MOCK_DELAY: 500,
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

// ============== 状态管理 ==============
var state = {
  step: 0, // 0=初始, 1=装箱单号已搜, 2=物料已搜
  packingListNo: "",
  materialCode: "",
  selectedItem: null, // 选中的装箱对象
  results: [], // 当前搜索结果
  photos: [], // [{ url: '...' }]
  submitting: false,
};

// ============== 工具函数 ==============
function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;")
    .split('"').join("&quot;")
    .split("'").join("&#39;");
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

function buildTripleFieldRow(labels, values) {
  return (
    '<div class="field-row field-row-triple">' +
    '<span class="triple-item"><span class="field-label">' +
    escapeHtml(labels[0]) +
    '</span><span class="field-value">' +
    escapeHtml(values[0]) +
    "</span></span>" +
    '<span class="triple-item"><span class="field-label">' +
    escapeHtml(labels[1]) +
    '</span><span class="field-value">' +
    escapeHtml(values[1]) +
    "</span></span>" +
    '<span class="triple-item"><span class="field-label">' +
    escapeHtml(labels[2]) +
    '</span><span class="field-value">' +
    escapeHtml(values[2]) +
    "</span></span>" +
    "</div>"
  );
}

// 计算所需最少照片数：ceil(装箱数量 * 箱数 / 总数)，缺箱数/总数/数量非法时兜底 1 张
function calcRequiredPhotos(item, qty) {
  var containerNum = parseFloat(item && item.containerNum);
  var totalQty = parseFloat(item && item.totalQty);
  if (isNaN(qty) || qty <= 0 || !containerNum || !totalQty || containerNum <= 0 || totalQty <= 0) {
    return 1;
  }
  return Math.ceil((qty * containerNum) / totalQty);
}

function buildToastDetailRow(label, value) {
  return (
    '<div class="detail-row"><span class="detail-label">' +
    escapeHtml(label) +
    '</span><span class="detail-value">' +
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
  ).appendTo("#mom-packing-app");
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
  ).appendTo("#mom-packing-app");
  $toastEl.on("click", function (e) {
    if (e.target == this) close();
  });
  $toastEl.find(".toast-btn").on("click", close);

  if (type != "error") {
    autoDismiss = setTimeout(close, 3000);
  }
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
      '<span class="header-operator">' + escapeHtml(window.Operator) + "</span>" +
      '<span class="header-time" id="header-time">' + now() + "</span>" +
      "</div>",
  );
  setInterval(function () {
    $("#header-time").text(now());
  }, 1000);

  // 步骤指示器
  $app.append(buildStepIndicator());

  // 搜索区（固定，不滚动）
  $app.append('<div class="search-area" id="search-area"></div>');

  // 可滚动内容区
  $app.append('<div class="packing-body" id="packing-body"></div>');

  // 结果区和装箱面板容器（在滚动区内）
  var $body = $("#packing-body");
  $body.append('<div class="result-area" id="result-area" style="display:none;"></div>');
  $body.append('<div id="packing-panel-container" style="display:none;"></div>');

  // 确认按钮区（初始隐藏）
  $app.append(
    '<div class="confirm-section" id="confirm-section" style="display:none;"></div>',
  );

  // 渲染搜索区
  renderSearchSections();

  // 绑定搜索事件
  initSearchEvents();

  // 绑定确认按钮事件
  initConfirmEvent();

  // 初始加载全量数据
  loadAllData();
}

// ============== 步骤指示器 ==============
function buildStepIndicator() {
  return (
    '<div class="step-indicator">' +
    '<div class="step-item active" id="step-item-0">' +
    '<span class="step-dot">1</span>' +
    '<span class="step-label">装箱单号</span>' +
    "</div>" +
    '<div class="step-line" id="step-line-0"></div>' +
    '<div class="step-item" id="step-item-1">' +
    '<span class="step-dot">2</span>' +
    '<span class="step-label">物料编码</span>' +
    "</div>" +
    "</div>"
  );
}

function updateStepIndicator(step) {
  for (var i = 0; i < 2; i++) {
    var $item = $("#step-item-" + i);
    $item.removeClass("active completed");
    if (i < step) {
      $item.addClass("completed");
      $item
        .find(".step-dot")
        .html(
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:14px;height:14px;"><path d="M5 13l4 4L19 7"/></svg>',
        );
    } else if (i == step) {
      $item.addClass("active");
      $item.find(".step-dot").text(i + 1);
    } else {
      $item.find(".step-dot").text(i + 1);
    }
    if (i < 1) {
      $("#step-line-" + i).toggleClass("done", i < step);
    }
  }
}

// ============== 搜索区渲染 ==============
function renderSearchSections() {
  var $area = $("#search-area");
  $area.empty();

  var steps = [
    { key: "packingListNo", label: "装箱单号", inputId: "input-packinglist", btnId: "btn-search-packinglist", scanId: "btn-scan-packinglist", searchFn: "doSearchPackingList", scanFn: "doScan('input-packinglist', doSearchPackingList)" },
    { key: "materialCode", label: "物料编码", inputId: "input-material", btnId: "btn-search-material", scanId: "btn-scan-material", searchFn: "doSearchMaterial", scanFn: "doScan('input-material', doSearchMaterial)" },
  ];

  for (var i = 0; i < steps.length; i++) {
    var s = steps[i];
    var val = state[s.key] || "";

    if (i < state.step) {
      // 已完成：摘要行
      $area.append(
        '<div class="step-row completed" data-step="' + i + '">' +
          '<span class="step-chip">✓</span>' +
          '<span class="step-name">' + s.label + '</span>' +
          '<span class="step-value">' + escapeHtml(val) + '</span>' +
          '<button type="button" class="step-expand">▾</button>' +
        "</div>",
      );
    } else if (i == state.step) {
      // 当前展开
      $area.append(
        '<div class="step-row active" data-step="' + i + '">' +
          '<span class="step-chip">' + (i + 1) + "</span>" +
          '<span class="step-name">' + s.label + "</span>" +
          '<div class="step-input-row">' +
          '<input class="search-input" id="' + s.inputId + '" type="text" value="' + escapeHtml(val) + '">' +
          '<button type="button" class="icon-btn btn-search" id="' + s.btnId + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>' +
          "</button>" +
          '<button type="button" class="icon-btn btn-scan" id="' + s.scanId + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2"/></svg>' +
          "</button>" +
          "</div>" +
          "</div>",
      );
    } else {
      // 锁定
      $area.append(
        '<div class="step-row locked" data-step="' + i + '">' +
          '<span class="step-chip">' + (i + 1) + "</span>" +
          '<span class="step-name">' + s.label + "</span>" +
          '<span class="step-hint">请先完成上一步</span>' +
          "</div>",
      );
    }
  }
}

// ============== 搜索事件 ==============
function initSearchEvents() {
  // 搜索按钮：委托绑定
  $("#search-area").on("click", ".btn-search", function () {
    var id = this.id;
    if (id == "btn-search-packinglist") doSearchPackingList();
    else if (id == "btn-search-material") doSearchMaterial();
  });

  // 扫码按钮：委托绑定
  $("#search-area").on("click", ".btn-scan", function () {
    var id = this.id;
    if (id == "btn-scan-packinglist") doScan("input-packinglist", doSearchPackingList);
    else if (id == "btn-scan-material") doScan("input-material", doSearchMaterial);
  });

  // 输入框回车：委托绑定
  $("#search-area").on("keypress", ".search-input", function (e) {
    if (e.which != 13) return;
    var id = this.id;
    if (id == "input-packinglist") doSearchPackingList();
    else if (id == "input-material") doSearchMaterial();
  });

  // 点击已完成步骤 → 回退重新编辑
  $("#search-area").on("click", ".step-row.completed", function () {
    var step = parseInt($(this).data("step"));
    state.step = step;
    updateStepIndicator(step);
    renderSearchSections();
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
    // 桌面端回退：创建临时 file input 无法扫码，提示手动输入
    showToast("提示", "扫码功能仅在移动端可用，请手动输入", "error");
  }
}

// ============== 初始加载全量数据 ==============
function loadAllData() {
  state.packingListNo = '';

  showLoading('加载中...');
  console.log('[API] loadAllData searchByPackingList', { packingListNo: '' });
  window.searchByPackingList({ packingListNo: '' }, function (res) {
    console.log('[API] loadAllData 返回', res);
    hideLoading();
    if (res.code != 0) {
      showToast('加载失败', res.msg || '获取数据失败', 'error');
      state.results = [];
      renderResultList([]);
      return;
    }
    state.results = res.data;
    renderResultList(res.data);
  });
}

// ============== 搜索逻辑 ==============
function doSearchPackingList() {
  var no = $("#input-packinglist").val().trim();
  if (!no) {
    showToast("提示", "请输入装箱单号", "error");
    return;
  }
  state.packingListNo = no;

  showLoading("查询中...");
  console.log("[API] searchByPackingList", { packingListNo: no });
  window.searchByPackingList(
    { packingListNo: no },
    function (res) {
      console.log("[API] searchByPackingList 返回", res);
      hideLoading();
      if (res.code != 0) {
        showToast("查询失败", res.msg || "未找到该装箱单号", "error");
        state.results = [];
        renderResultList([]);
        return;
      }
      state.results = res.data;
      state.step = 1;
      updateStepIndicator(1);

      // 重置后续值
      state.materialCode = "";
      renderSearchSections();

      renderResultList(res.data);
      removePackingPanel();
    },
  );
}

function doSearchMaterial() {
  var code = $("#input-material").val().trim();
  if (!code) {
    showToast("提示", "请输入物料编码", "error");
    return;
  }
  if (!state.packingListNo) {
    showToast("提示", "请先搜索装箱单号", "error");
    return;
  }
  state.materialCode = code;

  showLoading("查询中...");
  console.log("[API] searchByMaterialCode", { packingListNo: state.packingListNo, materialCode: code });
  window.searchByMaterialCode(
    {
      packingListNo: state.packingListNo,
      materialCode: code,
    },
    function (res) {
      console.log("[API] searchByMaterialCode 返回", res);
      hideLoading();
      if (res.code != 0) {
        showToast("查询失败", res.msg || "未找到该物料信息", "error");
        state.results = [];
        renderResultList([]);
        return;
      }
      state.results = res.data;
      state.step = 2;
      updateStepIndicator(2);

      renderSearchSections();
      renderResultList(res.data);
      removePackingPanel();
    },
  );
}

// ============== 搜索结果卡片列表 ==============
function buildResultCard(item) {
  return $(
    '<div class="result-card">' +
      buildFieldRow("批次编码", item.batchCode) +
      buildFieldRow("批次描述", item.batchDescription) +
      buildFieldRow("装箱单号", item.packingListNo) +
      buildFieldRow("箱号", item.boxNo) +
      buildFieldRow("箱数", item.containerNum) +
      buildFieldRow("物料编码", item.materialCode) +
      buildFieldRow("物料名称", item.materialName) +
      buildTripleFieldRow(["总数", "待装箱数", "已装箱数"], [item.totalQty, item.pendingQty, item.packedQty]) +
      "</div>",
  ).on("click", function () {
    selectItem(item);
  });
}

function buildEmptyState(msg) {
  return (
    '<div class="empty-state">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
    '<path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>' +
    "</svg>" +
    "<p>" +
    escapeHtml(msg || "没有找到匹配的结果") +
    "</p>" +
    "</div>"
  );
}

function renderResultList(items) {
  var $list = $("#result-area");
  $list.empty();

  if (!items || items.length == 0) {
    $list.append(buildEmptyState("未找到匹配结果"));
  } else {
    for (var i = 0; i < items.length; i++) {
      // stepIndex for tracking which step produced this result
      $list.append(buildResultCard(items[i]));
    }
  }
  $list.show();

  // 滚动到结果
  setTimeout(function () {
    $list[0].scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, 100);
}

// ============== 选中装箱对象 ==============
function selectItem(item) {
  state.selectedItem = item;
  state.step = 2;

  // 更新对应值
  if (item.batchCode) state.batchCode = item.batchCode;
  if (item.packingListNo) state.packingListNo = item.packingListNo;
  if (item.materialCode) state.materialCode = item.materialCode;

  updateStepIndicator(2);
  renderSearchSections();

  // 重置照片
  state.photos = [];

  // 渲染装箱面板
  renderPackingPanel(item);
}

// ============== 装箱面板 ==============
function renderPackingPanel(item) {
  removePackingPanel();
  // removePackingPanel 会清空 state.selectedItem，这里恢复为当前装箱对象
  // （进度条/照片校验等依赖它计算所需照片数）
  state.selectedItem = item;

  var panelHtml =
    '<div class="packing-panel" id="packing-panel">' +
    '<div class="section-header">' +
    '<span class="section-step filled">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:14px;height:14px;"><path d="M5 13l4 4L19 7"/></svg>' +
    "</span>" +
    '<span class="section-title">装箱信息</span>' +
    "</div>" +
    '<div class="packing-card" id="packing-card">' +
    buildFieldRow("批次编码", item.batchCode) +
    buildFieldRow("批次描述", item.batchDescription) +
    buildFieldRow("装箱单号", item.packingListNo) +
    buildFieldRow("箱号", item.boxNo) +
    buildFieldRow("箱数", item.containerNum) +
    buildFieldRow("物料编码", item.materialCode) +
    buildFieldRow("物料名称", item.materialName) +
    buildTripleFieldRow(["总数", "待装箱数", "已装箱数"], [item.totalQty, item.pendingQty, item.packedQty]) +
    "</div>" +
    // 数量输入
    '<div class="qty-section">' +
    '<div class="qty-label">本次装箱数量</div>' +
    '<input class="qty-input" id="packing-qty" type="number" inputmode="decimal" step="any" value="' +
    item.pendingQty +
    '" min="1" max="' +
    item.pendingQty +
    '">' +
    '<div class="qty-hint">待装箱数: ' +
    item.pendingQty +
    "</div>" +
    '<div class="qty-error" id="err-qty" style="display:none;"></div>' +
    "</div>" +
    // 拍照区域
    '<div class="photo-section" id="photo-section">' +
    '<div class="photo-header">' +
    '<span class="photo-label">照片</span>' +
    '<span class="photo-required" id="photo-required-tip">(至少' +
    calcRequiredPhotos(item, item.pendingQty) +
    "张)</span>" +
    '<span class="photo-error" id="err-photo" style="display:none;"></span>' +
    "</div>" +
    // 照片进度条
    '<div class="photo-progress">' +
    '<div class="photo-progress-bar"><div class="photo-progress-fill" id="photo-progress-fill"></div></div>' +
    '<span class="photo-progress-text" id="photo-progress-text">0/' +
    calcRequiredPhotos(item, item.pendingQty) +
    "张</span>" +
    "</div>" +
    '<div class="photo-scroll" id="photo-scroll">' +
    '<div class="photo-add" id="photo-add-btn">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>' +
    "<span>拍照</span>" +
    "</div>" +
    "</div>" +
    '<input type="file" id="photo-input" accept="image/*" capture="environment" style="position:absolute;opacity:0;width:0;height:0;overflow:hidden;">' +
    "</div>" +
    "</div>";

  $("#packing-panel-container").html(panelHtml).show();

  // 显示确认按钮
  $("#confirm-section")
    .html('<button type="button" class="btn-confirm" id="btn-confirm">确认装箱</button>')
    .show();

  // 绑定事件
  initPackingEvents(item);

  // 初始刷新照片进度条（当前 0 张）
  updatePhotoProgress();

  // 滚动到面板
  setTimeout(function () {
    $("#packing-panel")[0].scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, 150);
}

function removePackingPanel() {
  $("#packing-panel-container").empty().hide();
  $("#confirm-section").empty().hide();
  state.selectedItem = null;
  state.photos = [];
  state.submitting = false;
}

// ============== 装箱面板事件 ==============
function initPackingEvents(item) {
  // 数量输入校验
  $("#packing-qty").on("input", function () {
    var val = $(this).val().trim();
    var qty = parseFloat(val);

    // 数量变化时同步更新照片最少张数提示与进度条
    $("#photo-required-tip").text("(至少" + calcRequiredPhotos(item, qty) + "张)");
    updatePhotoProgress();

    $(this).removeClass("has-error");
    $("#err-qty").hide().text("");

    if (val == "") return;
    if (isNaN(qty) || qty <= 0) {
      $(this).addClass("has-error");
      $("#err-qty").text("数量必须为正数").show();
    } else if (qty > item.pendingQty) {
      $(this).addClass("has-error");
      $("#err-qty")
        .text("不能超过待装箱数 " + item.pendingQty)
        .show();
    }
  });

  // 拍照
  $("#photo-add-btn").on("click", function () {
    $("#photo-input").click();
  });

  $("#photo-input").on("change", function () {
    var files = this.files;
    if (!files || files.length == 0) return;
    handleFileSelect(files, item);
    // 重置 input 以允许重复选同一文件
    $(this).val("");
  });

  // 确认按钮
  $("#btn-confirm").on("click", function () {
    handleSubmit(item);
  });
}

// ============== 照片处理 ==============
function handleFileSelect(files, item) {
  var remaining = CONFIG.MAX_PHOTOS - state.photos.length;
  if (remaining <= 0) {
    showToast("提示", "最多上传" + CONFIG.MAX_PHOTOS + "张照片", "error");
    return;
  }

  var file = files[0];

  // 压缩并上传
  compressImage(file, function (base64) {
    showLoading("上传中...");
    console.log("[API] uploadPackingImage", { id: item.ID, base64: base64.substring(0, 80) + "..." });
    window.uploadPackingImage(
      {
        id: item.ID,
        base64: base64,
      },
      function (res) {
        console.log("[API] uploadPackingImage 返回", res);
        hideLoading();
        if (res.code != 0) {
          showToast("上传失败", res.msg || "请重试", "error");
          return;
        }
        state.photos.push({ url: res.data.url });
        renderPhotoList();
      },
    );
  });
}

function compressImage(file, callback) {
  var reader = new FileReader();
  reader.onload = function (e) {
    var img = new Image();
    img.onload = function () {
      var width = img.width;
      var height = img.height;

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

// 更新照片进度条：当前张数 / 所需最少张数，达标时变绿
function updatePhotoProgress() {
  var qtyVal = parseFloat(($("#packing-qty").val() || "").trim());
  var required = calcRequiredPhotos(state.selectedItem, qtyVal);
  var taken = state.photos.length;
  var pct = Math.min(100, (taken / required) * 100);

  $("#photo-progress-text").text(taken + "/" + required + "张");
  var $fill = $("#photo-progress-fill");
  $fill.css("width", pct + "%");
  $fill.toggleClass("complete", taken >= required);
}

function renderPhotoList() {
  var $scroll = $("#photo-scroll");
  $scroll.empty();

  // 已上传的照片
  for (var i = 0; i < state.photos.length; i++) {
    (function (index) {
      var $item = $(
        '<div class="photo-item">' +
          '<img src="' +
          escapeHtml(state.photos[index].url) +
          '" alt="photo ' +
          index +
          '">' +
          '<button type="button" class="photo-delete">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
          "</button>" +
          "</div>",
      );
      $item.find("img").on("click", function () {
        showPhotoPreview(index);
      });
      $item.find(".photo-delete").on("click", function (e) {
        e.stopPropagation();
        deletePhoto(index);
      });
      $scroll.append($item);
    })(i);
  }

  // 添加上传按钮
  if (state.photos.length < CONFIG.MAX_PHOTOS) {
    $scroll.append(
      '<div class="photo-add" id="photo-add-btn">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>' +
        "<span>拍照</span>" +
        "</div>",
    );
    $("#photo-add-btn").on("click", function () {
      $("#photo-input").click();
    });
  }

  // 照片数量已达标时清除错误状态
  var qtyVal = parseFloat(($("#packing-qty").val() || "").trim());
  if (state.photos.length >= calcRequiredPhotos(state.selectedItem, qtyVal)) {
    $("#err-photo").hide().text("");
  }

  // 刷新进度条
  updatePhotoProgress();

  // 滚动到最右
  $scroll[0].scrollLeft = $scroll[0].scrollWidth;
}

function showPhotoPreview(index) {
  var $mask = $(
    '<div class="photo-preview-mask">' +
      '<button type="button" class="photo-preview-close">&times;</button>' +
      '<img src="' +
      escapeHtml(state.photos[index].url) +
      '" alt="preview">' +
      "</div>",
  ).appendTo("#mom-packing-app");

  var close = function () {
    $mask.remove();
  };
  $mask.on("click", function (e) {
    if (e.target == this) close();
  });
  $mask.find(".photo-preview-close").on("click", close);
}

function deletePhoto(index) {
  state.photos.splice(index, 1);
  renderPhotoList();
}

// ============== 提交 ==============
function handleSubmit(item) {
  if (state.submitting) return;

  // 校验数量
  var qtyStr = $("#packing-qty").val().trim();
  var qty = parseFloat(qtyStr);
  var qtyValid = true;

  $("#packing-qty").removeClass("has-error");
  $("#err-qty").hide().text("");

  if (!qtyStr) {
    $("#packing-qty").addClass("has-error");
    $("#err-qty").text("请输入本次装箱数量").show();
    qtyValid = false;
  } else if (isNaN(qty) || qty <= 0) {
    $("#packing-qty").addClass("has-error");
    $("#err-qty").text("数量必须为正数").show();
    qtyValid = false;
  } else if (qty > item.pendingQty) {
    $("#packing-qty").addClass("has-error");
    $("#err-qty")
      .text("不能超过待装箱数 " + item.pendingQty)
      .show();
    qtyValid = false;
  }

  // 校验照片（至少 ceil(装箱数量 * 箱数 / 总数) 张）
  var photoValid = true;
  $("#err-photo").hide().text("");
  var requiredPhotos = calcRequiredPhotos(item, qty);
  if (state.photos.length < requiredPhotos) {
    $("#err-photo")
      .text("照片数量不足，至少需拍摄" + requiredPhotos + "张（当前" + state.photos.length + "张）")
      .show();
    photoValid = false;
  }

  if (!qtyValid || !photoValid) return;

  // 提交
  state.submitting = true;
  var $btn = $("#btn-confirm");
  $btn.prop("disabled", true).text("提交中...");

  showLoading("提交中...");

  var photoUrls = state.photos.map(function (p) {
    return p.url;
  });

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
    packingQty: qty,
    photos: photoUrls,
    operator: window.Operator,
  };

  console.log("[API] submitPacking", submitData);
  window.submitPacking(submitData, function (res) {
    console.log("[API] submitPacking 返回", res);
    hideLoading();
    state.submitting = false;
    $btn.prop("disabled", false).text("确认装箱");

    if (res.code != 0) {
      showToast("提交失败", res.msg || "请稍后重试", "error");
      return;
    }

    // 成功
    var detailHtml = [
      buildToastDetailRow("批次编码", item.batchCode),
      buildToastDetailRow("批次描述", item.batchDescription),
      buildToastDetailRow("装箱单号", item.packingListNo),
      buildToastDetailRow("箱号", item.boxNo),
      buildToastDetailRow("物料编码", item.materialCode),
      buildToastDetailRow("物料名称", item.materialName),
      buildToastDetailRow("装箱数量", qty),
      buildToastDetailRow("照片数量", state.photos.length),
    ].join("");

    showToast("装箱成功", detailHtml, "success", function () {
      resetAfterPacking();
    });
  });
}

function initConfirmEvent() {
  // 确认按钮绑定在 renderPackingPanel 中动态绑定
}

// ============== 重置 ==============
function resetAll() {
  state.step = 0;
  state.packingListNo = "";
  state.materialCode = "";
  state.selectedItem = null;
  state.results = [];
  state.photos = [];
  state.submitting = false;

  updateStepIndicator(0);

  // 重新渲染搜索区
  renderSearchSections();

  // 隐藏搜索结果
  $("#result-area").empty().hide();

  // 移除装箱面板
  removePackingPanel();

  // 滚动到顶部
  $("#packing-body")[0].scrollTop = 0;
}

function resetAfterPacking() {
  // 保留 packingListNo，清除其他状态
  state.materialCode = "";
  state.selectedItem = null;
  state.photos = [];
  state.submitting = false;
  state.step = 1; // 回到物料编码搜索：装箱单号已搜

  updateStepIndicator(1);
  renderSearchSections();

  // 移除装箱面板
  removePackingPanel();

  // 滚动到顶部
  $("#packing-body")[0].scrollTop = 0;

  // 用当前装箱单号重新查询，获取最新数据
  showLoading('刷新中...');
  window.searchByPackingList({ packingListNo: state.packingListNo }, function (res) {
    hideLoading();
    if (res.code == 0) {
      state.results = res.data;
      renderResultList(res.data);
    }
  });
}

// ============== 启动 ==============
$(function () {
  initPage();
});
