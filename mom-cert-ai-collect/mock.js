// ============== Mock 数据与 API（仅本地开发用） ==============
// 生产环境不部署本文件；Portal 在 iframe 加载前注入同名 window 函数，本文件的 typeof 检测会跳过 Mock。
// 本地联调探针：window.CertificateAiCollectMock / window.CertificateAiCollectMockState

var providedMockConfig = window.CertificateAiCollectMock || {};
var mockConfig = {
  delay: typeof providedMockConfig.delay === "number" ? providedMockConfig.delay : 300,
  startDelay: typeof providedMockConfig.startDelay === "number" ? providedMockConfig.startDelay : 120,
  recognitionDelay:
    typeof providedMockConfig.recognitionDelay === "number" ? providedMockConfig.recognitionDelay : 1200,
  // result：识别接口回调直接返回最终状态/结果（页面优先使用返回数据）
  // pending：识别接口只返回受理结果，最终结果由状态查询兜底
  recognitionReturnMode:
    providedMockConfig.recognitionReturnMode === "pending" ? "pending" : "result",
  scanDelay: typeof providedMockConfig.scanDelay === "number" ? providedMockConfig.scanDelay : 250,
  // 默认 50% 通过，方便看到失败分支；可通过 window.CertificateAiCollectMock.successRate 调整
  successRate: typeof providedMockConfig.successRate === "number" ? providedMockConfig.successRate : 0.5,
  // pass / fail / error / timeout；留空时按 successRate 随机
  forceOutcome: typeof providedMockConfig.forceOutcome === "string" ? providedMockConfig.forceOutcome : "",
  // 模拟并发冲突；保存时直接返回冲突信息
  forceConflict: !!providedMockConfig.forceConflict,
  conflictOperator: providedMockConfig.conflictOperator || "张三",
  conflictTime: providedMockConfig.conflictTime || "2026-10-27 10:00:00",
  // "" / "network" / "business"
  forceStatusError: providedMockConfig.forceStatusError || "",
  forceStartError: providedMockConfig.forceStartError || "",
  forceSaveError: providedMockConfig.forceSaveError || "",
  scanResult: typeof providedMockConfig.scanResult === "string" ? providedMockConfig.scanResult : "12223214",
};
window.CertificateAiCollectMock = mockConfig;

if (typeof window.CertificateAiCollectOrderNo !== "string" || !window.CertificateAiCollectOrderNo) {
  window.CertificateAiCollectOrderNo = "12223213";
}

var mockSubcategoryTemplates = [
  {
    mainCategoryCode: "Main-001",
    mainCategoryName: "整车合格证",
    mainCategorySort: 1,
    subcategoryCode: "Main-Sub-001",
    subcategoryName: "合格证正面",
    required: true,
    minCount: 1,
    maxCount: 1,
    sort: 1,
    requirementDescription: "请拍正视图，无反光",
  },
  {
    mainCategoryCode: "Main-001",
    mainCategoryName: "整车合格证",
    mainCategorySort: 1,
    subcategoryCode: "Main-Sub-002",
    subcategoryName: "合格证背面",
    required: true,
    minCount: 2,
    maxCount: 3,
    sort: 2,
    requirementDescription: "需上传 2-3 张细节图",
  },
  {
    mainCategoryCode: "Main-002",
    mainCategoryName: "环保信息",
    mainCategorySort: 2,
    subcategoryCode: "Main-Sub-003",
    subcategoryName: "环保清单（选填）",
    required: false,
    minCount: 1,
    maxCount: 1,
    sort: 1,
    requirementDescription: "选填；如上传需 1 张",
  },
  {
    mainCategoryCode: "Main-002",
    mainCategoryName: "环保信息",
    mainCategorySort: 2,
    subcategoryCode: "Main-Sub-006",
    subcategoryName: "环保附件（无需采集）",
    required: false,
    minCount: 0,
    maxCount: 0,
    sort: 2,
    requirementDescription: "系统默认无需采集，不传图也不影响状态",
  },
  {
    mainCategoryCode: "Main-003",
    mainCategoryName: "附属铭牌",
    mainCategorySort: 3,
    subcategoryCode: "Main-Sub-004",
    subcategoryName: "铭牌正面",
    required: true,
    minCount: 1,
    maxCount: 1,
    sort: 1,
    requirementDescription: "保持字迹清晰",
  },
  {
    mainCategoryCode: "Main-003",
    mainCategoryName: "附属铭牌",
    mainCategorySort: 3,
    subcategoryCode: "Main-Sub-005",
    subcategoryName: "铭牌反面（选填）",
    required: false,
    minCount: 0,
    maxCount: 1,
    sort: 2,
    requirementDescription: "纯选填，不需要采集可不传",
  },
];

var mockOrders = [
  {
    orderInfo: {
      orderNo: "12223213",
      hostCode: "kev12223213",
      vin: "LSVAA4182E2123456",
      monthSequence: "2601-1234",
    },
  },
  {
    orderInfo: {
      orderNo: "12223214",
      hostCode: "kev12223214",
      vin: "LSVAA4182E2123457",
      monthSequence: "2601-1235",
    },
  },
];

var mockRecords = {};
var mockRecognitionHistory = [];
var mockUidSeed = 0;

function mockUid(prefix) {
  mockUidSeed++;
  return (prefix || "id") + "-" + Date.now().toString(36) + "-" + mockUidSeed + "-" + Math.random().toString(36).slice(2, 7);
}

function formatDateTime(value) {
  var date = value instanceof Date ? value : new Date();
  function pad(number) {
    return number < 10 ? "0" + number : String(number);
  }
  return (
    date.getFullYear() +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    pad(date.getDate()) +
    " " +
    pad(date.getHours()) +
    ":" +
    pad(date.getMinutes()) +
    ":" +
    pad(date.getSeconds())
  );
}

function cloneImages(images) {
  var list = Object.prototype.toString.call(images) === "[object Array]" ? images : [];
  return list.map(function (image, index) {
    if (typeof image === "string") {
      return { fuid: mockUid("img"), dataUrl: image, url: "", sort: index };
    }
    var source = image || {};
    return {
      fuid: source.fuid || mockUid("img"),
      dataUrl: source.dataUrl || "",
      url: source.url || "",
      fileName: source.fileName || "",
      size: source.size || 0,
      contentType: source.contentType || "",
      width: source.width || 0,
      height: source.height || 0,
      sort: typeof source.sort === "number" ? source.sort : index,
    };
  });
}

function recordKey(orderNo, mainCategoryCode, subcategoryCode) {
  return orderNo + "::" + mainCategoryCode + "::" + subcategoryCode;
}

function findMockOrder(searchKey) {
  var keyword = String(searchKey || "").trim().toLowerCase();
  if (!keyword) return null;
  for (var i = 0; i < mockOrders.length; i++) {
    var orderInfo = mockOrders[i].orderInfo;
    var searchableValues = [orderInfo.orderNo, orderInfo.hostCode, orderInfo.vin, orderInfo.monthSequence];
    for (var j = 0; j < searchableValues.length; j++) {
      if (String(searchableValues[j] || "").toLowerCase().indexOf(keyword) !== -1) {
        return orderInfo;
      }
    }
  }
  return null;
}

function buildSubcategoriesForOrder(orderNo) {
  return mockSubcategoryTemplates.map(function (item) {
    var record = mockRecords[recordKey(orderNo, item.mainCategoryCode, item.subcategoryCode)];
    var activeRecord = record && record.active ? record : null;
    return {
      mainCategoryCode: item.mainCategoryCode,
      mainCategoryName: item.mainCategoryName,
      mainCategorySort: item.mainCategorySort,
      subcategoryCode: item.subcategoryCode,
      subcategoryName: item.subcategoryName,
      required: item.required,
      minCount: item.minCount,
      maxCount: item.maxCount,
      sort: item.sort,
      requirementDescription: item.requirementDescription,
      status: activeRecord ? activeRecord.status : "uncollected",
      result: activeRecord ? activeRecord.result : null,
      failureType: activeRecord ? activeRecord.failureType : "",
      aiResult: activeRecord ? activeRecord.aiResult : "",
      recognitionTime: activeRecord ? activeRecord.recognitionTime : "",
      requestId: activeRecord ? activeRecord.requestId : "",
      images: activeRecord ? cloneImages(activeRecord.images) : [],
    };
  });
}

function buildStatusForOrder(orderNo) {
  var result = [];
  Object.keys(mockRecords).forEach(function (key) {
    var record = mockRecords[key];
    if (!record || !record.active || record.orderNo !== orderNo) return;
    result.push({
      mainCategoryCode: record.mainCategoryCode,
      subcategoryCode: record.subcategoryCode,
      requestId: record.requestId,
      status: record.status,
      result: record.result,
      failureType: record.failureType || "",
      aiResult: record.aiResult || "",
      recognitionTime: record.recognitionTime || "",
    });
  });
  return result;
}

function applyRecognitionOutcome(record, historyEntry) {
  var outcome = mockConfig.forceOutcome;
  if (!outcome) outcome = Math.random() < mockConfig.successRate ? "pass" : "fail";

  var now = formatDateTime();
  record.recognitionTime = now;
  record.updatedAt = now;
  historyEntry.responseTime = now;

  if (outcome === "pass") {
    record.status = "success";
    record.result = "pass";
    record.failureType = "";
    record.aiResult = "照片清晰，校验通过";
    historyEntry.status = "success";
    historyEntry.conclusion = record.aiResult;
    historyEntry.failureType = "";
  } else if (outcome === "fail") {
    record.status = "fail";
    record.result = "fail";
    record.failureType = "aiRejected";
    record.aiResult = "图片模糊，无法识别";
    historyEntry.status = "fail";
    historyEntry.conclusion = record.aiResult;
    historyEntry.failureType = "aiRejected";
  } else if (outcome === "error") {
    record.status = "fail";
    record.result = null;
    record.failureType = "apiError";
    record.aiResult = "模拟识别服务异常，请重试";
    historyEntry.status = "fail";
    historyEntry.conclusion = record.aiResult;
    historyEntry.failureType = "apiError";
  } else {
    record.status = "fail";
    record.result = null;
    record.failureType = "timeout";
    record.aiResult = "识别超时，请重试";
    historyEntry.status = "fail";
    historyEntry.conclusion = record.aiResult;
    historyEntry.failureType = "timeout";
  }
}

// -- Mock API：查询采集任务（含 active=1 的已保存数据） --
if (typeof window.getCertificateAiCollectTask !== "function") {
  window.getCertificateAiCollectTaskCount = 0;
  window.getCertificateAiCollectTask = function (params, callback) {
    window.getCertificateAiCollectTaskCount++;
    window.lastCertificateAiCollectSearchKey = params && params.searchKey ? params.searchKey : "";
    setTimeout(function () {
      var orderInfo = findMockOrder(window.lastCertificateAiCollectSearchKey);
      if (!orderInfo) {
        callback({ code: 1, msg: "未查询到订单，请核对单号/VIN/月顺序号" });
        return;
      }
      callback({
        code: 0,
        msg: "success",
        data: {
          orderInfo: {
            orderNo: orderInfo.orderNo,
            hostCode: orderInfo.hostCode,
            vin: orderInfo.vin,
            monthSequence: orderInfo.monthSequence,
          },
          subcategories: buildSubcategoriesForOrder(orderInfo.orderNo),
        },
      });
    }, mockConfig.delay);
  };
}

// -- Mock API：保存草稿（仅保存有图片的未采集子项） --
if (typeof window.saveCertificateAiCollectDraft !== "function") {
  window.saveCertificateAiCollectDraftCount = 0;
  window.saveCertificateAiCollectDraft = function (params, callback) {
    window.saveCertificateAiCollectDraftCount++;
    window.lastCertificateAiCollectDraft = params;
    setTimeout(function () {
      if (mockConfig.forceConflict) {
        callback({
          code: 40901,
          errorType: "conflict",
          msg: "采集项已被其他用户录入",
          data: {
            operator: mockConfig.conflictOperator,
            time: mockConfig.conflictTime,
          },
        });
        return;
      }
      if (mockConfig.forceSaveError === "network") {
        callback({ code: -2, errorType: "network", msg: "网络异常，请检查网络" });
        return;
      }
      if (mockConfig.forceSaveError === "business") {
        callback({ code: 1, errorType: "business", msg: "保存草稿失败，请重试" });
        return;
      }

      var subcategories = Object.prototype.toString.call(params.subcategories) === "[object Array]" ? params.subcategories : [];
      var now = formatDateTime();
      subcategories.forEach(function (item) {
        var key = recordKey(params.orderNo, item.mainCategoryCode, item.subcategoryCode);
        var existing = mockRecords[key];
        mockRecords[key] = {
          orderNo: params.orderNo,
          mainCategoryCode: item.mainCategoryCode,
          subcategoryCode: item.subcategoryCode,
          requestId: item.requestId || (existing && existing.requestId) || mockUid("req"),
          businessId: params.businessId || mockUid("biz"),
          images: cloneImages(item.images),
          status: "uncollected",
          result: null,
          failureType: "",
          aiResult: "",
          recognitionTime: "",
          operator: params.operator || "开发用户",
          active: 1,
          updatedAt: now,
        };
      });
      callback({ code: 0, msg: "success", data: { saved: subcategories.length } });
    }, mockConfig.delay);
  };
}

function buildRecognitionResultResponse(record, recognitionId) {
  return {
    code: 0,
    msg: "success",
    data: {
      recognitionId: recognitionId,
      subcategory: {
        mainCategoryCode: record.mainCategoryCode,
        subcategoryCode: record.subcategoryCode,
        requestId: record.requestId,
        businessId: record.businessId,
        status: record.status,
        result: record.result,
        failureType: record.failureType,
        aiResult: record.aiResult,
        recognitionTime: record.recognitionTime,
      },
    },
  };
}

// -- Mock API：发起异步识别 --
if (typeof window.startCertificateAiCollectRecognition !== "function") {
  window.startCertificateAiCollectRecognitionCount = 0;
  window.startCertificateAiCollectRecognition = function (params, callback) {
    window.startCertificateAiCollectRecognitionCount++;
    window.lastCertificateAiCollectRecognition = params;
    setTimeout(function () {
      if (mockConfig.forceStartError === "network" || mockConfig.forceStartError === "business") {
        var failedKey = recordKey(params.orderNo, params.mainCategoryCode, params.subcategoryCode);
        var failedRecord = mockRecords[failedKey];
        if (failedRecord) {
          failedRecord.status = "fail";
          failedRecord.result = null;
          failedRecord.failureType = "apiError";
          failedRecord.aiResult =
            mockConfig.forceStartError === "network" ? "网络异常，识别提交失败" : "识别服务暂不可用，请重试";
          failedRecord.recognitionTime = formatDateTime();
          failedRecord.updatedAt = failedRecord.recognitionTime;
        }
        if (mockConfig.forceStartError === "network") {
          callback({ code: -2, errorType: "network", msg: "网络异常，识别提交失败" });
        } else {
          callback({ code: 1, errorType: "business", msg: "识别服务暂不可用，请重试" });
        }
        return;
      }

      var key = recordKey(params.orderNo, params.mainCategoryCode, params.subcategoryCode);
      var record = mockRecords[key];
      if (!record) {
        record = {
          orderNo: params.orderNo,
          mainCategoryCode: params.mainCategoryCode,
          subcategoryCode: params.subcategoryCode,
          requestId: params.requestId || mockUid("req"),
          businessId: params.businessId || mockUid("biz"),
          images: cloneImages(params.images),
          operator: params.operator || "开发用户",
          active: 1,
        };
        mockRecords[key] = record;
      }
      record.status = "pending";
      record.result = null;
      record.failureType = "";
      record.aiResult = "";
      record.recognitionTime = "";
      record.requestId = params.requestId || record.requestId || mockUid("req");
      record.businessId = params.businessId || mockUid("biz");
      if (params.images) record.images = cloneImages(params.images);
      record.updatedAt = formatDateTime();

      var recognitionId = params.businessId || mockUid("rec");
      var historyEntry = {
        recognitionId: recognitionId,
        orderNo: params.orderNo,
        mainCategoryCode: params.mainCategoryCode,
        subcategoryCode: params.subcategoryCode,
        requestId: record.requestId,
        businessId: record.businessId,
        status: "pending",
        failureType: "",
        conclusion: "",
        requestTime: formatDateTime(),
        responseTime: "",
      };
      mockRecognitionHistory.push(historyEntry);

      if (mockConfig.recognitionReturnMode === "pending") {
        setTimeout(function () {
          applyRecognitionOutcome(record, historyEntry);
        }, mockConfig.recognitionDelay);
        callback({
          code: 0,
          msg: "success",
          data: {
            recognitionId: recognitionId,
            requestId: record.requestId,
            businessId: record.businessId,
            status: "pending",
          },
        });
        return;
      }

      setTimeout(function () {
        applyRecognitionOutcome(record, historyEntry);
        callback(buildRecognitionResultResponse(record, recognitionId));
      }, mockConfig.recognitionDelay);
    }, mockConfig.startDelay);
  };
}

// -- Mock API：查询识别状态（前台定时调用） --
if (typeof window.getCertificateAiCollectStatus !== "function") {
  window.getCertificateAiCollectStatusCount = 0;
  window.getCertificateAiCollectStatus = function (params, callback) {
    window.getCertificateAiCollectStatusCount++;
    setTimeout(function () {
      if (mockConfig.forceStatusError === "network") {
        callback({ code: -2, errorType: "network", msg: "网络异常，刷新失败" });
        return;
      }
      if (mockConfig.forceStatusError === "business") {
        callback({ code: 1, errorType: "business", msg: "状态查询失败" });
        return;
      }
      callback({
        code: 0,
        msg: "success",
        data: { subcategories: buildStatusForOrder(params.orderNo) },
      });
    }, Math.min(mockConfig.delay, 150));
  };
}

// -- Mock API：更新数据（后台逻辑删除，active=0） --
if (typeof window.deactivateCertificateAiCollectItem !== "function") {
  window.deactivateCertificateAiCollectItemCount = 0;
  window.deactivateCertificateAiCollectItem = function (params, callback) {
    window.deactivateCertificateAiCollectItemCount++;
    setTimeout(function () {
      var key = recordKey(params.orderNo, params.mainCategoryCode, params.subcategoryCode);
      if (mockRecords[key]) {
        mockRecords[key].active = 0;
        mockRecords[key].updatedAt = formatDateTime();
      }
      callback({ code: 0, msg: "success" });
    }, mockConfig.delay);
  };
}

window.CertificateAiCollectMockState = {
  records: mockRecords,
  history: mockRecognitionHistory,
};

// -- Mock 扫码：Portal 父窗口未注入 OpenCamera 时兜底 --
function mockOpenCamera(callback) {
  setTimeout(function () {
    callback({ data: mockConfig.scanResult });
  }, mockConfig.scanDelay);
}

if (typeof window.OpenCamera !== "function") {
  window.OpenCamera = mockOpenCamera;
}

try {
  if (window.parent && window.parent !== window && typeof window.parent.OpenCamera !== "function") {
    window.parent.OpenCamera = mockOpenCamera;
  }
} catch (error) {
  // 跨域 iframe 无法访问父窗口时保持静默，由页面提示手动输入
}
