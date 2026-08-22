// ============== Mock 数据与 API（仅本地开发用） ==============
// 生产环境不部署本文件：Portal 部署只取 index.html / index.js / index.css。
// Portal 在 iframe 加载前注入同名 window 函数，本文件的 typeof 检测会跳过 Mock。
// 删除本文件即可完全移除 Mock，业务代码零改动。
var MOCK_DELAY = 500;

// ============== 模糊匹配工具（仅 Mock 使用） ==============
function fuzzyMatch(source, target) {
  if (!target) return true;
  return source.toLowerCase().indexOf(target.toLowerCase()) != -1;
}

// -- Mock 数据 --
var mockItems = [
  {
    ID: "PK001",
    batchCode: "PC202405001",
    batchDescription: "2024年5月A批次-发动机总成",
    packingListNo: "PL202405001",
    boxNo: "BX-202405001-01",
    materialCode: "MC-A001",
    materialName: "发动机总成-2.0T",
    totalQty: 200,
    containerNum: 3,
    pendingQty: 35,
    packedQty: 165,
  },
  {
    ID: "PK002",
    batchCode: "PC202405001",
    batchDescription: "2024年5月A批次-发动机总成",
    packingListNo: "PL202405001",
    boxNo: "BX-202405001-02",
    materialCode: "MC-A002",
    materialName: "发动机总成-1.5T",
    totalQty: 150,
    containerNum: 2,
    pendingQty: 50,
    packedQty: 100,
  },
  {
    ID: "PK003",
    batchCode: "PC202405001",
    batchDescription: "2024年5月A批次-发动机总成",
    packingListNo: "PL202405002",
    boxNo: "BX-202405002-01",
    materialCode: "MC-B001",
    materialName: "变速箱总成-DCT",
    totalQty: 80,
    containerNum: 2,
    pendingQty: 80,
    packedQty: 0,
  },
  {
    ID: "PK004",
    batchCode: "PC202405002",
    batchDescription: "2024年5月B批次-变速箱",
    packingListNo: "PL202405003",
    boxNo: "BX-202405003-01",
    materialCode: "MC-A001",
    materialName: "发动机总成-2.0T",
    totalQty: 100,
    containerNum: 1,
    pendingQty: 20,
    packedQty: 80,
  },
];

// -- Mock API 1：装箱单号搜索 --
if (typeof window.searchByPackingList != "function") {
  window.searchByPackingList = function (params, callback) {
    setTimeout(function () {
      var results = mockItems.filter(function (item) {
        return fuzzyMatch(item.packingListNo, params.packingListNo);
      });
      if (results.length) {
        callback({ code: 0, msg: "success", data: results });
      } else {
        callback({ code: 1, msg: "未找到该装箱单号的物料", data: [] });
      }
    }, MOCK_DELAY);
  };
}

// -- Mock API 2：物料编码搜索 --
if (typeof window.searchByMaterialCode != "function") {
  window.searchByMaterialCode = function (params, callback) {
    setTimeout(function () {
      var results = mockItems.filter(function (item) {
        return (
          fuzzyMatch(item.packingListNo, params.packingListNo) &&
          fuzzyMatch(item.materialCode, params.materialCode)
        );
      });
      if (results.length) {
        callback({ code: 0, msg: "success", data: results });
      } else {
        callback({ code: 1, msg: "未找到该物料信息", data: [] });
      }
    }, MOCK_DELAY);
  };
}

// -- Mock API 3：图片上传 --
if (typeof window.uploadPackingImage != "function") {
  window.uploadPackingImage = function (params, callback) {
    setTimeout(function () {
      // Mock: 直接返回 base64 作为 URL
      callback({ code: 0, msg: "success", data: { url: params.base64 } });
    }, 300);
  };
}

// -- Mock API 4：装箱提交 --
if (typeof window.submitPacking != "function") {
  window.submitPacking = function (data, callback) {
    setTimeout(function () {
      if (Math.random() < 0.1) {
        callback({ code: 1, msg: "系统繁忙，请稍后重试" });
      } else {
        callback({ code: 0, msg: "装箱成功" });
      }
    }, 800);
  };
}

// -- Mock 操作员 --
if (!window.Operator) {
  window.Operator = "开发用户";
}
