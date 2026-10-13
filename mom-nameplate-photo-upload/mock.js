// ============== Mock 数据与 API（仅本地开发用） ==============
// 生产环境不部署本文件：Portal 部署只取 index.html / index.js / index.css。
// Portal 在 iframe 加载前注入同名 window 函数，本文件的 typeof 检测会跳过 Mock。
// 删除本文件即可完全移除 Mock，业务代码零改动。
var MOCK_DELAY = 500;

// -- Mock 入口模式（对应关重件绑定页注入的 fromKeyPart / KeyPartStationCode / KeyPartOrderNo）--
// MOCK_FROM_KEY_PART = true：模拟「由关重件绑定页面进入」——按钮文案变「保存并返回」，
// 并按下方工位/订单号自动查询；改成 false 即回到正常入口（按钮为「保存」）。
var MOCK_FROM_KEY_PART = true;
if (typeof window.fromKeyPart !== "string") {
  window.fromKeyPart = MOCK_FROM_KEY_PART ? "KeyPart" : "";
}
if (typeof window.KeyPartStationCode !== "string") {
  window.KeyPartStationCode = MOCK_FROM_KEY_PART ? "S001" : "";
}
if (typeof window.KeyPartOrderNo !== "string") {
  window.KeyPartOrderNo = MOCK_FROM_KEY_PART ? "PO-MOCK-001" : "";
}

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
    // 已保存照片：只拍了 1 张（正面外观 minCount=2，未达标）→ 徽章显示 1/2~5、按钮仍可草稿保存
    photos: [{ photoType: "appearance_front", urlList: ["../18601605145677184.jpg"] }],
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
    // 已保存照片（重新进入页面时回显；生产由 Portal 的真实接口回传同样结构）
    photos: [
      { photoType: "measure_length", urlList: ["../18601605145677184.jpg"] },
      { photoType: "measure_width", urlList: ["../18601605145677184.jpg"] },
    ],
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
      // minCount=0：该类型可不拍（验证 optional 徽章「最多 N 张」与"一张没拍也算完成"的区分）
      { typeCode: "elec_extra", typeName: "补充照片", minCount: 0, maxCount: 3 },
    ],
    orderInfo: {
      machineCode: "MC-2024-D004",
      vin: "LSVAU2D00N2100004",
      // 上次保存的模板：页面应据此自动选中（不再弹窗强制选择）
      selectedTemplateId: "TPL021",
      templates: [
        { templateId: "TPL020", templateName: "电气铭牌A", templateImageUrl: "../18601605145677184.jpg" },
        { templateId: "TPL021", templateName: "电气铭牌B", templateImageUrl: "../18601605145677184.jpg" },
      ],
    },
  },
  // S005：有最低张数要求但订单未查到铭牌模板 → 验证「无铭牌记录不卡控」仍可保存
  S005: {
    photoTypes: [
      { typeCode: "seal_front", typeName: "密封面照片", minCount: 2, maxCount: 4 },
    ],
    orderInfo: {
      machineCode: "MC-2024-E005",
      vin: "LSVAU2E00N2100005",
      templates: [],
    },
    // 含一条"照片类型已不在当前配置"的脏数据：页面应忽略且不报错
    photos: [
      { photoType: "seal_front", urlList: [] },
      { photoType: "no_longer_configured", urlList: ["../18601605145677184.jpg"] },
    ],
  },
};

// -- Mock API 1：工位列表 --
if (typeof window.getStationList != "function") {
  window.getStationList = function (callback) {
    setTimeout(function () {
      callback({ code: 0, msg: "success", data: mockStations });
    }, MOCK_DELAY);
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
    }, MOCK_DELAY);
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
// window.lastSubmitPhotoRecord / window.submitPhotoRecordCount：本地联调探针（生产不部署本文件）
// window.MOCK_FORCE_ERROR = true：需要验证失败分支时手动开启（默认确定性成功，不做随机失败）
if (typeof window.submitPhotoRecord != "function") {
  window.submitPhotoRecordCount = 0;
  window.submitPhotoRecord = function (data, callback) {
    window.submitPhotoRecordCount++;
    window.lastSubmitPhotoRecord = data;
    setTimeout(function () {
      if (window.MOCK_FORCE_ERROR) {
        callback({ code: 1, msg: "系统繁忙，请稍后重试" });
      } else {
        callback({ code: 0, msg: data.saveType === "save" ? "保存成功" : "提交成功" });
      }
    }, 800);
  };
}

// -- Mock 返回关重件绑定页面（生产由 Portal 注入实现，见 docs/铭牌照片上传INF.md）--
// window.returnFromPhotoUploadCount：本地联调探针，便于确认保存成功后确实触发了返回
if (typeof window.KeyPart_ReturnFromPhotoUpload != "function") {
  window.returnFromPhotoUploadCount = 0;
  window.KeyPart_ReturnFromPhotoUpload = function () {
    window.returnFromPhotoUploadCount++;
    console.log("[Mock] KeyPart_ReturnFromPhotoUpload 被调用（生产由 Portal 实现返回导航）");
  };
}

// -- Mock 操作员 --
if (!window.Operator) {
  window.Operator = "开发用户";
}
