// ============== Mock 数据与 API（仅本地开发用） ==============
// 生产环境不部署本文件：Portal 部署只取 index.html / index.js / index.css。
// Portal 在页面加载前注入同名 window 函数，本文件的 typeof 检测会跳过 Mock。
// 删除本文件即可完全移除 Mock，业务代码零改动。
var MOCK_DELAY = 500;

// -- Mock 工位列表 --
var mockWorkStations = [
  { workStation: "ZA01", workStationDesc: "总装一线-01" },
  { workStation: "ZA02", workStationDesc: "总装一线-02" },
  { workStation: "ZB01", workStationDesc: "总装二线-01" },
  { workStation: "ZB02", workStationDesc: "总装二线-02" },
  { workStation: "ZD01", workStationDesc: "调试区-01" },
];

// -- Mock 订单（订单号/VIN 双键命中同一订单） --
var mockOrder1 = {
  wipOrderNo: "WO20260824001",
  vin: "LSVU2A0N260800001",
  wipPlanStartTime: "2026-08-24 08:30:00",
  monthSequence: "202608-0012",
  hostCode: "HC2608-1207",
  hostDesc: "8x4 自卸车底盘",
  hostAlias: "自卸130",
  bom: [
    { material: "MAT-BOLT-001", materialDesc: "六角螺栓 M12x40" },
    { material: "MAT-NUT-002", materialDesc: "法兰螺母 M12" },
    { material: "MAT-WASH-003", materialDesc: "平垫圈 12" },
    { material: "MAT-PIPE-004", materialDesc: "液压油管总成" },
  ],
};
var mockOrder2 = {
  wipOrderNo: "WO20260824002",
  vin: "LSVU2A0N260800002",
  wipPlanStartTime: "2026-08-24 09:00:00",
  monthSequence: "202608-0013",
  hostCode: "HC2608-1208",
  hostDesc: "8x4 搅拌车底盘",
  hostAlias: "搅拌140",
  bom: [
    { material: "MAT-NUT-002", materialDesc: "法兰螺母 M12" },
    { material: "MAT-PIPE-004", materialDesc: "液压油管总成" },
    { material: "MAT-CAP-005", materialDesc: "管接头护帽" },
  ],
};
var mockOrders = {
  "WO20260824001": mockOrder1,
  "LSVU2A0N260800001": mockOrder1,
  "WO20260824002": mockOrder2,
  "LSVU2A0N260800002": mockOrder2,
};

// -- Mock 物料描述 --
var mockMaterials = {
  "MAT-BOLT-001": "六角螺栓 M12x40",
  "MAT-NUT-002": "法兰螺母 M12",
  "MAT-WASH-003": "平垫圈 12",
  "MAT-PIPE-004": "液压油管总成",
  "MAT-CAP-005": "管接头护帽",
};

// -- Mock API 1：获取工位列表 --
if (typeof window.assemblyMaterialCheck_getWorkStationList != "function") {
  window.assemblyMaterialCheck_getWorkStationList = function (callback) {
    setTimeout(function () {
      callback({ code: 0, msg: "ok", data: mockWorkStations });
    }, MOCK_DELAY);
  };
}

// -- Mock API 2：查询订单信息（订单号/VIN 命中；未命中返回错误码） --
if (typeof window.assemblyMaterialCheck_getWipOrderNoInfo != "function") {
  window.assemblyMaterialCheck_getWipOrderNoInfo = function (params, callback) {
    setTimeout(function () {
      var order = mockOrders[params.serachKey];
      if (order) {
        callback({ code: 0, msg: "ok", data: order });
      } else {
        callback({ code: 1, msg: "未查询到订单信息" });
      }
    }, MOCK_DELAY);
  };
}

// -- Mock API 3：查询物料信息（未知物料返回空描述） --
if (typeof window.assemblyMaterialCheck_getMaterialInfo != "function") {
  window.assemblyMaterialCheck_getMaterialInfo = function (params, callback) {
    setTimeout(function () {
      callback({
        code: 0,
        msg: "ok",
        data: { material: params.material, materialDesc: mockMaterials[params.material] || "" },
      });
    }, MOCK_DELAY);
  };
}

// -- Mock API 4：保存检查结果（记录到 window.__assemblyMockSaved，供回归断言） --
if (typeof window.assemblyMaterialCheck_saveCheckResult != "function") {
  window.assemblyMaterialCheck_saveCheckResult = function (data, callback) {
    setTimeout(function () {
      if (!window.__assemblyMockSaved) window.__assemblyMockSaved = [];
      window.__assemblyMockSaved.push(data);
      callback({ code: 0, msg: "ok", data: null });
    }, 300);
  };
}
