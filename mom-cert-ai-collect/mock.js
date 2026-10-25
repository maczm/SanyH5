// ============== Mock 数据与 API（仅本地开发用） ==============
// 生产环境不部署本文件；Portal 在 iframe 加载前注入同名 window 函数，本文件的 typeof 检测会跳过 Mock。
// 本地联调探针：window.CertificateAiCollectMock / lastCertificateAiCollectRecognition /
//               getCertificateAiCollectTaskCount / recognizeCertificateAiCollectSubcategoryCount

var providedMockConfig = window.CertificateAiCollectMock || {};
var mockConfig = {
  delay: typeof providedMockConfig.delay === "number" ? providedMockConfig.delay : 300,
  recognitionDelay:
    typeof providedMockConfig.recognitionDelay === "number" ? providedMockConfig.recognitionDelay : 900,
  scanDelay: typeof providedMockConfig.scanDelay === "number" ? providedMockConfig.scanDelay : 250,
  successRate: typeof providedMockConfig.successRate === "number" ? providedMockConfig.successRate : 0.85,
  // pass / fail / error / timeout；留空时按 successRate 随机
  forceOutcome: typeof providedMockConfig.forceOutcome === "string" ? providedMockConfig.forceOutcome : "",
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

function cloneSubcategories() {
  return mockSubcategoryTemplates.map(function (item) {
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
    };
  });
}

function findMockOrder(searchKey) {
  var keyword = String(searchKey || "").trim().toLowerCase();
  if (!keyword) return null;
  for (var i = 0; i < mockOrders.length; i++) {
    var orderInfo = mockOrders[i].orderInfo;
    var searchableValues = [
      orderInfo.orderNo,
      orderInfo.hostCode,
      orderInfo.vin,
      orderInfo.monthSequence,
    ];
    for (var j = 0; j < searchableValues.length; j++) {
      if (String(searchableValues[j] || "").toLowerCase().indexOf(keyword) !== -1) {
        return orderInfo;
      }
    }
  }
  return null;
}

// -- Mock API：查询采集任务 --
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
          subcategories: cloneSubcategories(),
        },
      });
    }, mockConfig.delay);
  };
}

// -- Mock API：子类别图片识别 --
if (typeof window.recognizeCertificateAiCollectSubcategory !== "function") {
  window.recognizeCertificateAiCollectSubcategoryCount = 0;
  window.recognizeCertificateAiCollectSubcategory = function (params, callback) {
    window.recognizeCertificateAiCollectSubcategoryCount++;
    window.lastCertificateAiCollectRecognition = params;
    setTimeout(function () {
      var outcome = mockConfig.forceOutcome;
      if (!outcome) {
        outcome = Math.random() < mockConfig.successRate ? "pass" : "fail";
      }
      if (outcome === "error") {
        callback({ code: 1, msg: "模拟识别服务异常，请重试" });
        return;
      }
      if (outcome === "timeout") {
        callback({ code: 1, msg: "识别超时，请重试" });
        return;
      }
      callback({
        code: 0,
        msg: "success",
        data:
          outcome === "fail"
            ? { result: "fail", aiResult: "图片模糊，无法识别" }
            : { result: "pass", aiResult: "照片清晰，校验通过" },
      });
    }, mockConfig.recognitionDelay);
  };
}

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
