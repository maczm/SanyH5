// ============== 铭牌检查结果 - 纯数据展示页 ==============
// 数据来源：父页面注入的 window.checkResultData（JS 对象或 JSON 字符串），
// 结构遵循信封格式 { code, mes, data }：
//   data: {
//     acceptNo, completedAt, status: PENDING/PROCESSING/COMPLETED/FAILED,
//     overallConclusion: PASS/FAIL/UNCLEAR/RETRY,
//     checkResults: [{ checkCode, checkName, conclusion, reason, fieldDetails: [...] }]
//   }
//   fieldDetails 项：{ fieldNameCn, fieldNameEn, conclusion: MATCH/MISMATCH/PASS/FAIL,
//     unit（如 kW/kg）, recognizedValue, correctValue }
// 未注入时使用下方 MOCK_RESULT 演示数据。
//
// 页面结构：全部骨架在 index.html（含 template 标签循环模板），JS 只克隆赋值。

// ============== 演示数据 ==============
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
          { fieldNameCn: "二维码内容", fieldNameEn: "QRContent", conclusion: "PASS", recognizedValue: "DFH5180XXY|LSVAU2A00N2100001|2024-06-08", correctValue: "DFH5180XXY|LSVAU2A00N2100001|2024-06-08" },
        ],
      },
      {
        checkCode: "CHECK_OCR",
        checkName: "铭牌字符识别比对",
        conclusion: "FAIL",
        reason: "以下字段识别值与公告值不一致：发动机号、车辆颜色",
        fieldDetails: [
          { fieldNameCn: "制造厂名称", fieldNameEn: "Manufacturer", conclusion: "PASS", recognizedValue: "东风商用车有限公司", correctValue: "东风商用车有限公司" },
          { fieldNameCn: "发动机号", fieldNameEn: "EngineNo", conclusion: "FAIL", recognizedValue: "WP10H202406001", correctValue: "WP10H2024060A1" },
          { fieldNameCn: "车辆颜色", fieldNameEn: "VehicleColor", conclusion: "FAIL", recognizedValue: "红色", correctValue: "白色" },
        ],
      },
      {
        checkCode: "CHECK_INFO",
        checkName: "铭牌信息完整性检查",
        conclusion: "SKIPPED",
        reason: "该检查项不适用于当前车辆类型，已跳过",
        fieldDetails: [],
      },
    ],
  },
};

// ============== 应用命名空间 ==============
var NameplateCheckResult = {
  _pollTimer: null,

  // ============== 模板克隆 ==============
  cloneTemplate: function (id) {
    var fragment = document.getElementById(id).content.cloneNode(true);
    return $(fragment.firstElementChild);
  },

  // ============== 状态标准化 ==============
  /**
   * 结论标准化：返回 pass/fail/unclear/retry/skipped/unrated/unknown。
   * 空值/缺失 → unrated；未知值 → unknown（显示原文，避免静默归为 fail 误导）。
   */
  conclusionState: function (value) {
    if (value === null || value === undefined || String(value).trim() === "") return "unrated";
    var normalized = String(value).trim().toLowerCase();
    var groups = [
      ["pass", ["合格", "通过", "pass", "ok", "success", "yes", "true", "1", "是", "match"]],
      ["fail", ["不合格", "不通过", "fail", "no", "false", "0", "否", "mismatch"]],
      ["unclear", ["不确定", "无法确定", "unclear", "unknown", "inconclusive"]],
      ["retry", ["需重试", "重试", "retry"]],
      ["skipped", ["跳过", "skip", "skipped"]],
    ];
    for (var i = 0; i < groups.length; i++) {
      if (groups[i][1].indexOf(normalized) !== -1) return groups[i][0];
    }
    return "unknown";
  },

  /** 任务状态标准化：pending/processing/completed/failed/unknown（未知不静默归 completed） */
  statusState: function (value) {
    if (value === null || value === undefined) return "unknown";
    var map = { pending: "pending", processing: "processing", completed: "completed", failed: "failed" };
    return map[String(value).trim().toLowerCase()] || "unknown";
  },

  /** 状态键 → 中文文案（unknown 显示原文） */
  conclusionLabel: function (state, original) {
    var map = { pass: "通过", fail: "不通过", unclear: "不确定", retry: "需重试", skipped: "跳过", unrated: "未评" };
    if (state === "unknown") return original || "未知";
    return map[state] || "";
  },

  /** 任务状态 → 中文文案 */
  statusLabel: function (value) {
    if (value === null || value === undefined) return "";
    var map = { pending: "待处理", processing: "处理中", completed: "已完成", failed: "失败" };
    return map[String(value).trim().toLowerCase()] || String(value);
  },

  /** 检查项徽章配置 */
  checkBadge: function (state) {
    var map = {
      pass: { text: "合格", cls: "ck-pass" },
      fail: { text: "不合格", cls: "ck-fail" },
      skipped: { text: "跳过", cls: "ck-skip" },
      unclear: { text: "不确定", cls: "ck-unclear" },
      retry: { text: "需重试", cls: "ck-retry" },
      unrated: { text: "未评", cls: "ck-unrated" },
      unknown: { text: "未知", cls: "ck-unclear" },
    };
    return map[state] || map.unrated;
  },

  /** 字段级徽章配置 */
  fieldBadge: function (state) {
    var map = {
      pass: { text: "一致", cls: "f-pass" },
      fail: { text: "不一致", cls: "f-fail" },
      skipped: { text: "跳过", cls: "f-skip" },
      unclear: { text: "不确定", cls: "f-unclear" },
      retry: { text: "需重试", cls: "f-retry" },
      unrated: { text: "未评", cls: "f-unrated" },
      unknown: { text: "未知", cls: "f-unclear" },
    };
    return map[state] || map.unrated;
  },

  // ============== 页面初始化 ==============
  initPage: function () {
    function now() {
      var d = new Date();
      var pad = function (n) { return n < 10 ? "0" + n : n; };
      return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
    }
    $("#header-time").text(now());
    setInterval(function () {
      $("#header-time").text(now());
    }, 1000);

    NameplateCheckResult.renderResult();
  },

  // ============== 结果渲染 ==============
  /**
   * 渲染检查结果页：优先取父页面注入数据（支持 JS 对象或 JSON 字符串），
   * 注入数据缺失或解析失败时展示空态；按任务状态分支渲染——
   * pending/processing/failed 仅展示任务横幅并视需要启动轮询，
   * completed 展示整体结论横幅与检查项列表，终态时停止轮询。
   */
  renderResult: function () {
    // 优先取父页面注入数据（支持 JS 对象或 JSON 字符串），否则用演示数据
    var payload = window.checkResultData || MOCK_RESULT;
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch (e) {
        NameplateCheckResult.showEmptyState("检查结果数据解析失败，请检查 window.checkResultData 是否为合法 JSON");
        return;
      }
    }
    var data = (payload && payload.data) ? payload.data : payload;

    var $body = $("#result-body");
    $body.empty();

    if (!data) {
      NameplateCheckResult.showEmptyState("暂无检查结果数据");
      return;
    }

    var state = NameplateCheckResult.statusState(data.status);

    // 任务未完成或失败：仅展示任务状态横幅
    if (state === "pending" || state === "processing" || state === "failed") {
      $body.append(NameplateCheckResult.buildTaskBanner(data, state));
      NameplateCheckResult.startPollingIfNeeded(state);
      return;
    }

    // 任务已完成：整体结论横幅 + 检查项列表
    $body.append(NameplateCheckResult.buildStatusBanner(data));

    var list = data.checkResults || [];
    if (list.length) {
      var $listWrap = $('<div class="check-list"></div>');
      list.forEach(function (item) {
        $listWrap.append(NameplateCheckResult.buildCheckCard(item));
      });
      $body.append($listWrap);
    } else {
      var $empty = NameplateCheckResult.cloneTemplate("template-empty-state");
      $empty.find("p").text("暂无检查明细数据");
      $body.append($empty);
    }

    // 状态已终态：停止轮询
    NameplateCheckResult.stopPolling();
  },

  /**
   * pending/processing 状态轮询：每 10s 重读 window.checkResultData 并重渲染。
   * 宿主更新该变量后页面自动刷新结果；每次轮询均无条件重渲染，不做数据引用比对。
   */
  startPollingIfNeeded: function (state) {
    if (state !== "pending" && state !== "processing") return;
    NameplateCheckResult.stopPolling();
    NameplateCheckResult._pollTimer = setInterval(function () {
      var current = window.checkResultData;
      if (current && typeof current === "object") {
        NameplateCheckResult.renderResult();
      }
    }, 10000);
  },

  stopPolling: function () {
    if (NameplateCheckResult._pollTimer) {
      clearInterval(NameplateCheckResult._pollTimer);
      NameplateCheckResult._pollTimer = null;
    }
  },

  showEmptyState: function (message) {
    var $empty = NameplateCheckResult.cloneTemplate("template-empty-state");
    $empty.find("p").text(message);
    $("#result-body").html($empty);
  },

  // ============== 任务状态横幅（待处理/处理中/失败） ==============
  buildTaskBanner: function (data, state) {
    var configMap = {
      pending: { title: "任务待处理", sub: "检查任务尚未开始，请稍后刷新查看", cls: "processing" },
      processing: { title: "检查处理中", sub: "任务处理中，请稍候查看结果", cls: "processing" },
      failed: { title: "检查任务失败", sub: "任务执行失败，请稍后重试或联系管理员", cls: "fail" },
    };
    var config = configMap[state] || configMap.processing;

    var $banner = NameplateCheckResult.cloneTemplate("template-task-banner");
    $banner.removeClass("processing").addClass(config.cls);
    $banner.find(".sb-title").text(config.title);
    $banner.find(".sb-sub").text(config.sub);
    $banner.find(".task-accept-no").text("受理单号：" + (data.acceptNo || "-"));
    if (data.status) {
      $banner.find(".task-status").text("状态：" + NameplateCheckResult.statusLabel(data.status)).removeClass("hidden");
    }
    if (state === "failed") {
      $banner.find(".sb-icon").html('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>');
    }
    return $banner;
  },

  // ============== 整体结论横幅 ==============
  /**
   * 渲染整体结论横幅：按 overallConclusion 归一化状态（unrated 兜底为 unclear），
   * 填充标题/副文案/图标/受理单号/完成时间，并按状态统计检查项（unrated/unknown 计入跳过类）。
   * 参数 data：信封 data 部分（overallConclusion/acceptNo/completedAt/checkResults）；返回横幅 jQuery 节点。
   */
  buildStatusBanner: function (data) {
    var state = NameplateCheckResult.conclusionState(data.overallConclusion);
    if (state === "unrated") state = "unclear"; // 整体结论缺失兜底为不确定

    var subMap = {
      pass: "铭牌检查通过",
      fail: "铭牌检查未通过，请查看下方明细",
      unclear: "整体结论不确定，请人工复核",
      retry: "整体结论需重试，请重新发起检查",
    };
    var iconMap = {
      pass: '<path d="M5 13l4 4L19 7"/>',
      fail: '<path d="M18 6L6 18M6 6l12 12"/>',
      unclear: '<path d="M12 22a10 10 0 100-20 10 10 0 000 20zM9.09 9a3 3 0 015.83 1c0 2-3 3-3 3m.01 4h.01"/>',
      retry: '<path d="M23 4v6h-6M20.49 15a9 9 0 11-2.12-9.36L23 10"/>',
    };

    var $banner = NameplateCheckResult.cloneTemplate("template-status-banner");
    $banner.addClass(state);
    $banner.find(".sb-icon svg").html(iconMap[state] || iconMap.unclear);
    $banner.find(".sb-title").text(NameplateCheckResult.conclusionLabel(state, data.overallConclusion));
    $banner.find(".sb-sub").text(subMap[state] || "");
    $banner.find(".accept-no").text("受理单号：" + (data.acceptNo || "-"));
    $banner.find(".completed-at").text("完成时间：" + (data.completedAt || "-"));
    if (data.status) {
      $banner.find(".banner-status").text("状态：" + NameplateCheckResult.statusLabel(data.status)).removeClass("hidden");
    }

    // 按状态统计检查项（unrated/unknown 计入跳过类）
    var total = 0;
    var passed = 0;
    var failedCount = 0;
    var skipped = 0;
    var list = data.checkResults || [];
    list.forEach(function (item) {
      total++;
      var itemState = NameplateCheckResult.conclusionState(item.conclusion);
      if (itemState === "pass") passed++;
      else if (itemState === "fail") failedCount++;
      else skipped++;
    });

    if (total > 0) {
      var $summary = $banner.find(".sb-summary");
      $summary.removeClass("hidden");
      NameplateCheckResult.appendChip($summary, "检查项", total, "");
      NameplateCheckResult.appendChip($summary, "通过", passed, "sum-pass");
      NameplateCheckResult.appendChip($summary, "未通过", failedCount, "sum-fail");
      if (skipped > 0) {
        NameplateCheckResult.appendChip($summary, "跳过", skipped, "sum-skip");
      }
    }

    return $banner;
  },

  appendChip: function ($summary, label, count, cls) {
    var $chip = NameplateCheckResult.cloneTemplate("template-sum-chip");
    $chip.prepend(label + " ");
    $chip.find("b").text(count);
    if (cls) $chip.addClass(cls);
    $summary.append($chip);
  },

  // ============== 检查项卡片 ==============
  buildCheckCard: function (item) {
    var state = NameplateCheckResult.conclusionState(item.conclusion);
    var badge = NameplateCheckResult.checkBadge(state);
    var cardCls = state === "fail" ? " card-fail" : (state === "skipped" || state === "unrated") ? " card-skip" : (state === "unclear" || state === "retry" || state === "unknown") ? " card-warn" : "";

    var $card = NameplateCheckResult.cloneTemplate("template-check-card");
    if (cardCls) $card.addClass(cardCls.trim());
    $card.find(".check-name").text(item.checkName);
    if (item.checkCode) {
      $card.find(".check-code").text(item.checkCode).removeClass("hidden");
    }
    var $badge = $card.find(".ck-badge");
    $badge.addClass(badge.cls).text(badge.text);

    if (item.reason) {
      $card.find(".check-reason").removeClass("hidden");
      $card.find(".reason-text").text(item.reason);
    }

    var $fieldList = $card.find(".field-list");
    var details = item.fieldDetails || [];
    if (details.length) {
      details.forEach(function (detail) {
        $fieldList.append(NameplateCheckResult.buildFieldRow(detail));
      });
    } else {
      var $empty = NameplateCheckResult.cloneTemplate("template-empty-state");
      $empty.find("p").text("该检查项无字段明细");
      $fieldList.append($empty);
    }

    return $card;
  },

  // ============== 字段明细行 ==============
  buildFieldRow: function (detail) {
    var state = NameplateCheckResult.conclusionState(detail.conclusion);
    var badge = NameplateCheckResult.fieldBadge(state);

    var $row = NameplateCheckResult.cloneTemplate("template-field-row");
    if (state === "fail") $row.addClass("mismatch");

    if (detail.unit) {
      $row.find(".fv-unit").text(detail.unit).removeClass("hidden");
    }

    $row.find(".field-name-cn").text(detail.fieldNameCn || "-");
    if (detail.fieldNameEn) {
      $row.find(".field-name-en").text(detail.fieldNameEn).removeClass("hidden");
    }

    var recognizedValue = detail.recognizedValue || "-";
    var $recognized = $row.find(".fv").first().find(".fv-val");
    if (state === "fail") {
      $recognized.addClass("val-mismatch");
    }
    $recognized.text(recognizedValue);
    $row.find(".fv").eq(1).find(".fv-val").text(detail.correctValue || "-");

    var $fieldBadge = $row.find(".f-badge");
    $fieldBadge.addClass(badge.cls).text(badge.text);

    return $row;
  },
};

// ============== 启动 ==============
$(function () {
  NameplateCheckResult.initPage();
});
