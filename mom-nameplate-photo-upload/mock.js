// ============== Mock 数据与 API（仅本地开发用） ==============
// 生产环境不部署本文件：Portal 部署只取 index.html / index.js / index.css。
// Portal 在 iframe 加载前注入同名 window 函数，本文件的 typeof 检测会跳过 Mock。
// 删除本文件即可完全移除 Mock，业务代码零改动。
var MOCK_DELAY = 500;

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
if (typeof window.submitPhotoRecord != "function") {
  window.submitPhotoRecord = function (data, callback) {
    setTimeout(function () {
      if (Math.random() < 0.1) {
        callback({ code: 1, msg: "系统繁忙，请稍后重试" });
      } else {
        callback({ code: 0, msg: data.saveType === "save" ? "保存成功" : "提交成功" });
      }
    }, 800);
  };
}

// -- Mock 操作员 --
if (!window.Operator) {
  window.Operator = "开发用户";
}
