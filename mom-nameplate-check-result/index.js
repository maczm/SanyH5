// ============================================================
// 铭牌检查结果 - 纯数据展示页
//
// 数据来源：优先读取父页面注入的 window.checkResultData，
//          结构遵循 index.json 的信封格式 { code, mes, data }：
//          {
//            code: "",        // 业务码（展示页不依赖）
//            mes: "",         // 提示信息
//            data: {
//              acceptNo: "",          // 受理单号
//              completedAt: "",       // 检查完成时间
//              status: "",            // 任务状态：PENDING/PROCESSING/COMPLETED/FAILED
//              overallConclusion: "", // 整体结论：PASS/FAIL/UNCLEAR/RETRY
//              checkResults: [{       // 检查项列表
//                checkCode: "",       // 检查项编码
//                checkName: "",       // 检查项名称
//                conclusion: "",      // 该项结论：PASS/FAIL/SKIPPED（可空）
//                reason: "",          // 不合格原因
//                fieldDetails: [{     // 字段级明细
//                  fieldNameCn: "",   // 字段中文名
//                  fieldNameEn: "",   // 字段英文名
//                  conclusion: "",    // 字段结论：PASS/FAIL/SKIPPED（可空）
//                  recognizedValue: "", // 识别值（铭牌上识别出的值）
//                  correctValue: ""   // 正确值（公告值/标准值）
//                }]
//              }]
//            }
//          }
//
// 接入方式：父页面在加载 iframe 前设置 window.checkResultData 即可，
//          值为 JS 对象或 JSON 字符串均可，页面会自动解析；
//          未注入时使用下方 MOCK_RESULT 演示数据。
// ============================================================

// ============== 演示数据（结论/状态为英文字典枚举） ==============
var MOCK_RESULT = {
  code: 200,
  mes: "操作成功",
  data: {
    acceptNo: "AR20260811001",
    completedAt: "2026-08-14 10:45:32",
    status: "COMPLETED",
    overallConclusion: "FAIL",
    checkResults: [
      {
        checkCode: "CHECK_QR",
        checkName: "二维码可读性",
        conclusion: "PASS",
        reason: "",
        fieldDetails: [
          {
            fieldNameCn: "二维码内容",
            fieldNameEn: "QRContent",
            conclusion: "PASS",
            recognizedValue: "DFH5180XXY|LSVAU2A00N2100001|2024-06-08",
            correctValue: "DFH5180XXY|LSVAU2A00N2100001|2024-06-08",
          },
          {
            fieldNameCn: "二维码解析状态",
            fieldNameEn: "QRStatus",
            conclusion: "PASS",
            recognizedValue: "可正常解析",
            correctValue: "可正常解析",
          },
          {
            fieldNameCn: "二维码容错等级",
            fieldNameEn: "QRLevel",
            conclusion: "PASS",
            recognizedValue: "H",
            correctValue: "H",
          },
          {
            fieldNameCn: "二维码版本",
            fieldNameEn: "QRVersion",
            conclusion: "PASS",
            recognizedValue: "Model 2",
            correctValue: "Model 2",
          },
        ],
      },
      {
        checkCode: "CHECK_OCR",
        checkName: "铭牌字符识别比对",
        conclusion: "FAIL",
        reason: "以下字段识别值与公告值不一致：发动机号、车辆颜色",
        fieldDetails: [
          {
            fieldNameCn: "制造厂名称",
            fieldNameEn: "Manufacturer",
            conclusion: "PASS",
            recognizedValue: "东风商用车有限公司",
            correctValue: "东风商用车有限公司",
          },
          {
            fieldNameCn: "中文品牌",
            fieldNameEn: "Brand",
            conclusion: "PASS",
            recognizedValue: "东风",
            correctValue: "东风",
          },
          {
            fieldNameCn: "主机编码",
            fieldNameEn: "MachineCode",
            conclusion: "PASS",
            recognizedValue: "MC-2024-A001",
            correctValue: "MC-2024-A001",
          },
          {
            fieldNameCn: "产品型号",
            fieldNameEn: "ProductModel",
            conclusion: "PASS",
            recognizedValue: "DFH5180XXY",
            correctValue: "DFH5180XXY",
          },
          {
            fieldNameCn: "车辆识别代号",
            fieldNameEn: "VIN",
            conclusion: "PASS",
            recognizedValue: "LSVAU2A00N2100001",
            correctValue: "LSVAU2A00N2100001",
          },
          {
            fieldNameCn: "发动机号",
            fieldNameEn: "EngineNo",
            conclusion: "FAIL",
            recognizedValue: "WP10H202406001",
            correctValue: "WP10H2024060A1",
          },
          {
            fieldNameCn: "发动机型号",
            fieldNameEn: "EngineModel",
            conclusion: "PASS",
            recognizedValue: "WP10H375E50",
            correctValue: "WP10H375E50",
          },
          {
            fieldNameCn: "额定功率(kW)",
            fieldNameEn: "RatedPower",
            conclusion: "PASS",
            recognizedValue: "276",
            correctValue: "276",
          },
          {
            fieldNameCn: "排放标准",
            fieldNameEn: "EmissionStandard",
            conclusion: "PASS",
            recognizedValue: "国六",
            correctValue: "国六",
          },
          {
            fieldNameCn: "车辆颜色",
            fieldNameEn: "VehicleColor",
            conclusion: "FAIL",
            recognizedValue: "红色",
            correctValue: "白色",
          },
          {
            fieldNameCn: "整备质量(kg)",
            fieldNameEn: "CurbWeight",
            conclusion: "PASS",
            recognizedValue: "6200",
            correctValue: "6200",
          },
          {
            fieldNameCn: "最大总质量(kg)",
            fieldNameEn: "GrossWeight",
            conclusion: "PASS",
            recognizedValue: "18000",
            correctValue: "18000",
          },
          {
            fieldNameCn: "生产日期",
            fieldNameEn: "ProductDate",
            conclusion: "PASS",
            recognizedValue: "2024-06-08",
            correctValue: "2024-06-08",
          },
        ],
      },
      {
        checkCode: "CHECK_INFO",
        checkName: "铭牌信息完整性检查",
        conclusion: "SKIPPED",
        reason: "该检查项不适用于当前车辆类型，已跳过",
        fieldDetails: [
          {
            fieldNameCn: "铭牌存在状态",
            fieldNameEn: "PlateExist",
            conclusion: "SKIPPED",
            recognizedValue: "存在",
            correctValue: "存在",
          },
          {
            fieldNameCn: "铭牌文字清晰度",
            fieldNameEn: "TextClearness",
            conclusion: "SKIPPED",
            recognizedValue: "清晰",
            correctValue: "清晰",
          },
          {
            fieldNameCn: "铭牌固定状态",
            fieldNameEn: "PlateFix",
            conclusion: "SKIPPED",
            recognizedValue: "固定牢固",
            correctValue: "固定牢固",
          },
        ],
      },
    ],
  },
};

// ============== 工具函数 ==============
function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/\x26/g, "&amp;")  // \x26 = &（十六进制转义，避免高亮器将裸 & 误判）
    .replace(/\x3C/g, "&lt;")   // \x3C = <
    .replace(/\x3E/g, "&gt;")   // \x3E = >
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// 安全 JSON 解析：非字符串原样返回；字符串解析失败返回 null
function safeParse(jsonStr) {
  if (typeof jsonStr !== "string") return jsonStr;
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error("[check-result] JSON.parse 失败:", e.message);
    return null;
  }
}

// 结论标准化：返回 pass/fail/unclear/retry/skipped/unrated 状态键，
// 兼容中英文写法；空值/缺失返回 unrated，未知值按 fail 保守处理
function conclusionState(val) {
  if (val == null || String(val).trim() === "") return "unrated";
  var s = String(val).trim().toLowerCase();
  var groups = [
    ["pass", ["合格", "通过", "pass", "ok", "success", "yes", "true", "1", "是"]],
    ["fail", ["不合格", "不通过", "fail", "no", "false", "0", "否"]],
    ["unclear", ["不确定", "无法确定", "unclear", "unknown", "inconclusive"]],
    ["retry", ["需重试", "重试", "retry"]],
    ["skipped", ["跳过", "skip", "skipped"]],
  ];
  for (var i = 0; i < groups.length; i++) {
    if (groups[i][1].indexOf(s) !== -1) return groups[i][0];
  }
  return "fail";
}

// 状态键 -> 中文文案
var CONCLUSION_LABELS = {
  pass: "通过",
  fail: "不通过",
  unclear: "不确定",
  retry: "需重试",
  skipped: "跳过",
  unrated: "未评",
};

function conclusionLabel(state) {
  return CONCLUSION_LABELS[state] || "";
}

// 任务状态标准化：返回 pending/processing/completed/failed，未知/缺失按 completed 处理
function statusState(val) {
  var m = { pending: "pending", processing: "processing", completed: "completed", failed: "failed" };
  if (val == null) return "completed";
  return m[String(val).trim().toLowerCase()] || "completed";
}

// 任务状态英文枚举 -> 中文文案
function statusLabel(val) {
  if (val == null) return "";
  var m = { pending: "待处理", processing: "处理中", completed: "已完成", failed: "失败" };
  var s = String(val).trim().toLowerCase();
  return m[s] || val;
}

// 检查项徽章配置：状态键 -> { 文案, 样式类 }
function ckBadge(state) {
  var map = {
    pass: { text: "合格", cls: "ck-pass" },
    fail: { text: "不合格", cls: "ck-fail" },
    skipped: { text: "跳过", cls: "ck-skip" },
    unclear: { text: "不确定", cls: "ck-unclear" },
    retry: { text: "需重试", cls: "ck-retry" },
    unrated: { text: "未评", cls: "ck-unrated" },
  };
  return map[state] || map.unrated;
}

function nowStr() {
  var d = new Date();
  var pad = function (n) { return n < 10 ? "0" + n : n; };
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
}

// ============== 页面初始化 ==============
function initPage() {
  var $app = $(".app-container");

  // 头部
  $app.append(
    '<div class="page-header">' +
      '<span class="header-title">铭牌检查结果</span>' +
      '<span class="header-time" id="header-time">' + nowStr() + "</span>" +
      "</div>",
  );
  setInterval(function () {
    $("#header-time").text(nowStr());
  }, 1000);

  // 可滚动内容区
  $app.append('<div class="result-body" id="result-body"></div>');

  renderResult();
}

// ============== 结果渲染 ==============
function renderResult() {
  // 优先取父页面注入数据（支持 JS 对象或 JSON 字符串），否则用演示数据
  var payload = window.checkResultData || MOCK_RESULT;
  if (typeof payload === "string") {
    payload = safeParse(payload);
    if (payload === null) {
      showEmptyState("检查结果数据解析失败，请检查 window.checkResultData 是否为合法 JSON");
      return;
    }
  }
  var data = (payload && payload.data) ? payload.data : payload;

  var $body = $("#result-body");
  $body.empty();

  if (!data) {
    showEmptyState("暂无检查结果数据");
    return;
  }

  var state = statusState(data.status);

  // 任务未完成或失败：仅展示任务状态横幅
  if (state === "pending" || state === "processing" || state === "failed") {
    $body.append(buildTaskBanner(data, state));
    return;
  }

  // 任务已完成：展示整体结论横幅 + 检查项列表
  $body.append(buildStatusBanner(data));

  var list = data.checkResults || [];
  if (list.length) {
    var listHtml = "";
    for (var i = 0; i < list.length; i++) {
      listHtml += buildCheckCard(list[i]);
    }
    $body.append('<div class="check-list">' + listHtml + "</div>");
  } else {
    $body.append('<div class="field-empty">暂无检查明细数据</div>');
  }
}

function showEmptyState(msg) {
  $("#result-body").html(
    '<div class="empty-state">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
      '<path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>' +
      "</svg>" +
      "<p>" + escapeHtml(msg) + "</p>" +
      "</div>",
  );
}

// ============== 任务状态横幅（待处理/处理中/失败） ==============
function buildTaskBanner(data, state) {
  var cfgMap = {
    pending: { title: "任务待处理", sub: "检查任务尚未开始，请稍后刷新查看", cls: "processing" },
    processing: { title: "检查处理中", sub: "任务处理中，请稍候查看结果", cls: "processing" },
    failed: { title: "检查任务失败", sub: "任务执行失败，请稍后重试或联系管理员", cls: "fail" },
  };
  var cfg = cfgMap[state];

  var icon = state === "failed"
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>'
    : '<span class="sb-spinner"></span>';

  return (
    '<div class="status-banner ' + cfg.cls + '">' +
      '<div class="sb-icon">' + icon + "</div>" +
      '<div class="sb-title">' + cfg.title + "</div>" +
      '<div class="sb-sub">' + cfg.sub + "</div>" +
      '<div class="sb-meta">' +
        "<span>受理单号：" + escapeHtml(data.acceptNo || "-") + "</span>" +
        (data.status ? "<span>状态：" + escapeHtml(statusLabel(data.status)) + "</span>" : "") +
      "</div>" +
    "</div>"
  );
}

// ============== 总体结论横幅 ==============
function buildStatusBanner(data) {
  var state = conclusionState(data.overallConclusion);
  // 整体结论缺失时（理论不会发生，字段为必填）按"不确定"兜底展示
  if (state === "unrated") state = "unclear";

  var title = conclusionLabel(state) || "检查结果";
  var subMap = {
    pass: "铭牌检查通过",
    fail: "铭牌检查未通过，请查看下方明细",
    unclear: "整体结论不确定，请人工复核",
    retry: "整体结论需重试，请重新发起检查",
  };
  var sub = subMap[state] || "";

  var iconMap = {
    pass: '<path d="M5 13l4 4L19 7"/>',
    fail: '<path d="M18 6L6 18M6 6l12 12"/>',
    unclear: '<path d="M12 22a10 10 0 100-20 10 10 0 000 20zM9.09 9a3 3 0 015.83 1c0 2-3 3-3 3m.01 4h.01"/>',
    retry: '<path d="M23 4v6h-6M20.49 15a9 9 0 11-2.12-9.36L23 10"/>',
  };
  var icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' + iconMap[state] + "</svg>";

  // 按状态统计检查项（unrated 计入跳过）
  var total = 0;
  var passed = 0;
  var failed = 0;
  var skipped = 0;
  var list = data.checkResults || [];
  for (var i = 0; i < list.length; i++) {
    total++;
    var st = conclusionState(list[i].conclusion);
    if (st === "pass") passed++;
    else if (st === "fail") failed++;
    else skipped++;
  }

  var summary = "";
  if (total > 0) {
    summary =
      '<div class="sb-summary">' +
        '<span class="sum-chip">检查项 <b>' + total + "</b></span>" +
        '<span class="sum-chip sum-pass">通过 <b>' + passed + "</b></span>" +
        '<span class="sum-chip sum-fail">未通过 <b>' + failed + "</b></span>" +
        (skipped > 0 ? '<span class="sum-chip sum-skip">跳过 <b>' + skipped + "</b></span>" : "") +
      "</div>";
  }

  return (
    '<div class="status-banner ' + state + '">' +
      '<div class="sb-icon">' + icon + "</div>" +
      '<div class="sb-title">' + escapeHtml(title) + "</div>" +
      '<div class="sb-sub">' + sub + "</div>" +
      '<div class="sb-meta">' +
        "<span>受理单号：" + escapeHtml(data.acceptNo || "-") + "</span>" +
        "<span>完成时间：" + escapeHtml(data.completedAt || "-") + "</span>" +
        (data.status ? "<span>状态：" + escapeHtml(statusLabel(data.status)) + "</span>" : "") +
      "</div>" +
      summary +
    "</div>"
  );
}

// ============== 检查项卡片 ==============
function buildCheckCard(item) {
  var state = conclusionState(item.conclusion);
  var badge = ckBadge(state);
  var cardCls = state === "fail" ? " card-fail" : (state === "skipped" || state === "unrated") ? " card-skip" : (state === "unclear" || state === "retry") ? " card-warn" : "";

  var html =
    '<div class="check-card' + cardCls + '">' +
      '<div class="check-card-header">' +
        '<div class="check-title-wrap">' +
          '<span class="check-name">' + escapeHtml(item.checkName) + "</span>" +
          (item.checkCode ? '<span class="check-code">' + escapeHtml(item.checkCode) + "</span>" : "") +
        "</div>" +
        '<span class="ck-badge ' + badge.cls + '">' + badge.text + "</span>" +
      "</div>";

  // 不合格原因
  if (item.reason) {
    html +=
      '<div class="check-reason">' +
        '<span class="reason-label">原因</span>' +
        "<span>" + escapeHtml(item.reason) + "</span>" +
      "</div>";
  }

  // 字段级明细
  var details = item.fieldDetails || [];
  if (details.length) {
    html += '<div class="field-list">';
    for (var i = 0; i < details.length; i++) {
      html += buildFieldRow(details[i]);
    }
    html += "</div>";
  } else {
    html += '<div class="field-empty">该检查项无字段明细</div>';
  }

  html += "</div>";
  return html;
}

// ============== 字段明细行 ==============
function buildFieldRow(d) {
  var state = conclusionState(d.conclusion);
  var rowCls = state === "fail" ? "field-row mismatch" : "field-row";

  var badgeMap = {
    pass: { text: "一致", cls: "f-pass" },
    fail: { text: "不一致", cls: "f-fail" },
    skipped: { text: "跳过", cls: "f-skip" },
    unclear: { text: "不确定", cls: "f-unclear" },
    retry: { text: "需重试", cls: "f-retry" },
    unrated: { text: "未评", cls: "f-unrated" },
  };
  var badge = badgeMap[state] || badgeMap.unrated;

  var recognized = state === "fail"
    ? '<span class="val-mismatch">' + escapeHtml(d.recognizedValue || "-") + "</span>"
    : escapeHtml(d.recognizedValue || "-");

  return (
    '<div class="' + rowCls + '">' +
      '<div class="field-label-wrap">' +
        '<span class="field-name-cn">' + escapeHtml(d.fieldNameCn || "-") + "</span>" +
        (d.fieldNameEn ? '<span class="field-name-en">' + escapeHtml(d.fieldNameEn) + "</span>" : "") +
      "</div>" +
      '<div class="field-values">' +
        '<div class="fv">' +
          '<span class="fv-label">识别值</span>' +
          '<span class="fv-val">' + recognized + "</span>" +
        "</div>" +
        '<div class="fv">' +
          '<span class="fv-label">正确值</span>' +
          '<span class="fv-val">' + escapeHtml(d.correctValue || "-") + "</span>" +
        "</div>" +
      "</div>" +
      '<span class="f-badge ' + badge.cls + '">' + badge.text + "</span>" +
    "</div>"
  );
}

// ============== 启动 ==============
$(function () {
  initPage();
});
