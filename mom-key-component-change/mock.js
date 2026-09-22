// ============== Mock 数据与 API（仅本地开发用） ==============
// 生产环境不部署本文件：Portal 部署只取 index.html / index.js / index.css。
// Portal 在页面加载前注入同名 window 函数，本文件的 typeof 检测会跳过 Mock。
// 入参形态与生产一致：{ taskType, reported }。
// 回归脚本可用 window.__mockDelayMilliseconds 调低延迟（页面脚本执行前注入），默认 400ms 贴近真机
var MOCK_DELAY = typeof window.__mockDelayMilliseconds === "number" ? window.__mockDelayMilliseconds : 400;

// -- Portal 注入属性兜底：true = 隐藏页面表头；本地改这一行即可预览隐藏形态 --
if (typeof window.KeyComponentChangeHideHeader !== "boolean") {
  window.KeyComponentChangeHideHeader = false;
}

var mockOrderDataMap = {
  // 生产订单：永磁体同步电机序号恰为 1、2（自动分配），另有序号为 null 的关重件
  "184000000012": {
    wipOrderNo: "184000000012",
    wipOrderType: 1,
    productID: 9001,
    productNo: "MAT-HOST-001",
    productDesc: "8x4 自卸车底盘",
    serialNo: "SN-HOST-0001",
    vin: "LSVU2A0N260800001",
    factoryCode: "FAC-0001",
    removeQty: 0,
    needRemoveQty: 0,
    keyComponentList: [
      { materialID: 2001, materialNo: "MAT-MOTOR-001", materialDesc: "永磁体同步电机", materialQty: 1, uomCode: "EA", materialType: "永磁体同步电机", materialSeq: "1" },
      { materialID: 2001, materialNo: "MAT-MOTOR-001", materialDesc: "永磁体同步电机", materialQty: 1, uomCode: "EA", materialType: "永磁体同步电机", materialSeq: "2" },
      { materialID: 2002, materialNo: "MAT-AXLE-002", materialDesc: "驱动桥总成", materialQty: 1, uomCode: "EA", materialType: "关重件", materialSeq: null },
      { materialID: 2003, materialNo: "MAT-BOX-003", materialDesc: "变速箱总成", materialQty: 2, uomCode: "EA", materialType: "关重件", materialSeq: "3" },
    ],
    snList: [
      { serialNo: "SN-MOTOR-A1", materialID: 2001, materialSeq: "1", scanTime: "2026-08-24 09:10:00" },
      { serialNo: "SN-AXLE-A1", materialID: 2002, materialSeq: null, scanTime: "2026-08-24 09:05:00" },
    ],
  },
  // 改制订单：两条永磁体同步电机配置序号都是 1（不明确 → 弹窗人工选前后）
  "184000000013": {
    wipOrderNo: "184000000013",
    wipOrderType: 2,
    productID: 9002,
    productNo: "MAT-HOST-002",
    productDesc: "8x4 搅拌车底盘",
    serialNo: "SN-HOST-0002",
    vin: "LSVU2A0N260800002",
    factoryCode: "FAC-0002",
    removeQty: 0,
    needRemoveQty: 2,
    keyComponentList: [
      { materialID: 3001, materialNo: "MAT-MOTOR-011", materialDesc: "永磁体同步电机", materialQty: 1, uomCode: "EA", materialType: "永磁体同步电机", materialSeq: "1" },
      { materialID: 3001, materialNo: "MAT-MOTOR-011", materialDesc: "永磁体同步电机", materialQty: 1, uomCode: "EA", materialType: "永磁体同步电机", materialSeq: "1" },
      { materialID: 3002, materialNo: "MAT-BOX-012", materialDesc: "变速箱总成", materialQty: 1, uomCode: "EA", materialType: "关重件", materialSeq: "3" },
    ],
    snList: [
      { serialNo: "SN-MOTOR-B1", materialID: 3001, materialSeq: "1", scanTime: "2026-08-24 10:00:00" },
    ],
  },
};

var mockVinIndexMap = {
  LSVU2A0N260800001: "184000000012",
  LSVU2A0N260800002: "184000000013",
};

// -- 待移除明细（改制订单 → 生产订单） --
var mockRemoveRecordList = [
  { wipOrderNo: "184000000001", wipOrderType: 1, serialNo: "SN-HOST-0101", materialSerialNo: "SN-MOTOR-OLD-1", materialNo: "MAT-MOTOR-001", materialDesc: "永磁体同步电机", scanTime: "2026-08-20 08:30:00" },
  { wipOrderNo: "184000000002", wipOrderType: 1, serialNo: "SN-HOST-0102", materialSerialNo: "SN-MOTOR-OLD-2", materialNo: "MAT-MOTOR-001", materialDesc: "永磁体同步电机", scanTime: "2026-08-21 09:15:00" },
];

// -- 待更换明细（改制 + 生产订单） --
var mockChangeRecordList = [
  { wipOrderNo: "184000000013", wipOrderType: 2, serialNo: "SN-HOST-0002", materialSerialNo: "SN-OLD-CHG-1", materialNo: "MAT-MOTOR-011", materialDesc: "永磁体同步电机", scanTime: "2026-08-22 10:00:00" },
  { wipOrderNo: "184000000001", wipOrderType: 1, serialNo: "SN-HOST-0101", materialSerialNo: "SN-OLD-CHG-2", materialNo: "MAT-MOTOR-011", materialDesc: "永磁体同步电机", scanTime: "2026-08-22 11:30:00" },
];

// 待更换旧件的位置：仅 Mock 内部用于按 materialSeq 过滤（出参不含该字段，与协议一致）
var mockChangeRecordSequenceMap = {
  "SN-OLD-CHG-1": "1",
  "SN-OLD-CHG-2": "2",
};

function recordMockRequest(taskType, reported) {
  if (!window.__keyComponentMockRequests) window.__keyComponentMockRequests = [];
  window.__keyComponentMockRequests.push({ taskType: taskType, reported: reported });
}

function findMockOrderData(reported) {
  return mockOrderDataMap[reported.wipOrderNo] || null;
}

// 最近一次查询的改制订单号：移除页移除的是生产订单旧件，已解绑数量记在改制订单上
var mockActiveChangeOrderNo = "";

function currentMockTime() {
  var d = new Date();
  var pad = function (n) { return n < 10 ? "0" + n : n; };
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " +
    pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
}

// -- Mock API 1：查询订单信息 --
if (typeof window.KeyComponentChange_GetWipOrderNoInfo != "function") {
  window.KeyComponentChange_GetWipOrderNoInfo = function (request, callback) {
    var reported = (request && request.reported) || {};
    recordMockRequest("GetWipOrderNoInfo", reported);
    setTimeout(function () {
      var orderNo = reported.wipOrderNo || mockVinIndexMap[reported.vin] || "";
      var orderData = mockOrderDataMap[orderNo];
      if (!orderData) {
        callback({ code: 1, msg: "未查询到订单信息" });
        return;
      }
      callback({
        code: 0,
        msg: "ok",
        data: {
          wipOrderNo: orderData.wipOrderNo,
          wipOrderType: orderData.wipOrderType,
          productID: orderData.productID,
          productNo: orderData.productNo,
          productDesc: orderData.productDesc,
          serialNo: orderData.serialNo,
        },
      });
    }, MOCK_DELAY);
  };
}

// -- Mock API 2：查询关重件信息（keyComponentList / snList 同级扁平） --
if (typeof window.KeyComponentChange_GetKeyComponentInfo != "function") {
  window.KeyComponentChange_GetKeyComponentInfo = function (request, callback) {
    var reported = (request && request.reported) || {};
    recordMockRequest("GetKeyComponentInfo", reported);
    setTimeout(function () {
      var orderData = findMockOrderData(reported);
      if (!orderData) {
        callback({ code: 1, msg: "未查询到关重件信息" });
        return;
      }
      if (String(orderData.wipOrderType) === "2") {
        mockActiveChangeOrderNo = orderData.wipOrderNo;
      }
      callback({
        code: 0,
        msg: "ok",
        data: {
          removeQty: orderData.removeQty,
          needRemoveQty: orderData.needRemoveQty,
          keyComponentList: orderData.keyComponentList,
          snList: orderData.snList,
        },
      });
    }, MOCK_DELAY);
  };
}

// -- Mock API 3：校验并保存（序列号以 CHG- 开头模拟需更换） --
if (typeof window.KeyComponentChange_CheckAndSave != "function") {
  window.KeyComponentChange_CheckAndSave = function (request, callback) {
    var reported = (request && request.reported) || {};
    recordMockRequest("CheckAndSave", reported);
    setTimeout(function () {
      if (String(reported.materialSerialNo || "").indexOf("CHG-") === 0) {
        callback({ code: 0, msg: "ok", data: { isChange: "1" } });
        return;
      }
      var orderData = findMockOrderData(reported);
      if (orderData) {
        orderData.snList.push({
          serialNo: reported.materialSerialNo,
          materialID: reported.materialID,
          materialSeq: reported.materialSeq,
          scanTime: currentMockTime(),
        });
      }
      if (!window.__keyComponentMockSaved) window.__keyComponentMockSaved = [];
      window.__keyComponentMockSaved.push({ taskType: "CheckAndSave", reported: reported });
      callback({ code: 0, msg: "ok", data: { isChange: "0" } });
    }, MOCK_DELAY);
  };
}

// -- Mock API 4：移除关重件 --
if (typeof window.KeyComponentChange_Remove != "function") {
  window.KeyComponentChange_Remove = function (request, callback) {
    var reported = (request && request.reported) || {};
    recordMockRequest("Remove", reported);
    setTimeout(function () {
      var orderData = findMockOrderData(reported);
      if (orderData) {
        orderData.snList = orderData.snList.filter(function (serial) {
          return serial.serialNo !== reported.materialSerialNo;
        });
      }
      // 已解绑数量只随“待移除清单”（移除页）推进；更换页移除旧件不影响解绑进度
      var isRemoveListSerial = mockRemoveRecordList.some(function (record) {
        return record.materialSerialNo === reported.materialSerialNo;
      });
      if (isRemoveListSerial) {
        mockRemoveRecordList = mockRemoveRecordList.filter(function (record) {
          return record.materialSerialNo !== reported.materialSerialNo;
        });
        var changeOrderData = mockOrderDataMap[mockActiveChangeOrderNo];
        if (changeOrderData && changeOrderData.removeQty < changeOrderData.needRemoveQty) {
          changeOrderData.removeQty = (changeOrderData.removeQty || 0) + 1;
        }
      }
      if (!window.__keyComponentMockRemoved) window.__keyComponentMockRemoved = [];
      window.__keyComponentMockRemoved.push(reported);
      callback({ code: 0, msg: "ok", data: { oldGenealogyID: "GEN-" + window.__keyComponentMockRemoved.length } });
    }, MOCK_DELAY);
  };
}

// -- Mock API 5：待移除明细 --
if (typeof window.KeyComponentChange_GetRemoveKeyComponentInfo != "function") {
  window.KeyComponentChange_GetRemoveKeyComponentInfo = function (request, callback) {
    var reported = (request && request.reported) || {};
    recordMockRequest("GetRemoveKeyComponentInfo", reported);
    setTimeout(function () {
      callback({ code: 0, msg: "ok", data: mockRemoveRecordList });
    }, MOCK_DELAY);
  };
}

// -- Mock API 6：待更换明细（materialSeq 为 "1"/"2" 时按位置过滤，"" 不过滤） --
if (typeof window.KeyComponentChange_GetChangeKeyComponentInfo != "function") {
  window.KeyComponentChange_GetChangeKeyComponentInfo = function (request, callback) {
    var reported = (request && request.reported) || {};
    recordMockRequest("GetChangeKeyComponentInfo", reported);
    setTimeout(function () {
      var materialSequence = reported.materialSeq === null || reported.materialSeq === undefined ? "" : String(reported.materialSeq);
      var recordList = mockChangeRecordList;
      if (materialSequence === "1" || materialSequence === "2") {
        recordList = mockChangeRecordList.filter(function (record) {
          return mockChangeRecordSequenceMap[record.materialSerialNo] === materialSequence;
        });
      }
      callback({ code: 0, msg: "ok", data: recordList });
    }, MOCK_DELAY);
  };
}

// -- Mock API 7：带被替换旧件 ID 保存新关重件 --
if (typeof window.KeyComponentChange_Save != "function") {
  window.KeyComponentChange_Save = function (request, callback) {
    var reported = (request && request.reported) || {};
    recordMockRequest("Save", reported);
    setTimeout(function () {
      var orderData = findMockOrderData(reported);
      if (orderData) {
        var materialIds = [];
        var requiredQuantity = 0;
        orderData.keyComponentList.forEach(function (component) {
          if (component.materialNo === reported.materialNo) {
            materialIds.push(component.materialID);
            requiredQuantity += Number(component.materialQty) || 0;
          }
        });
        var collectedSerialList = orderData.snList.filter(function (serial) {
          return materialIds.indexOf(serial.materialID) !== -1;
        });
        // 更换：优先置换同位置（同 materialSeq）的旧件，位置明确时才替换对应前/后电机
        var sequenceText = reported.materialSeq === null || reported.materialSeq === undefined ? "" : String(reported.materialSeq);
        var sameSequenceSerialList = collectedSerialList.filter(function (serial) {
          var serialSequenceText = serial.materialSeq === null || serial.materialSeq === undefined ? "" : String(serial.materialSeq);
          return sequenceText !== "" && serialSequenceText === sequenceText;
        });
        var replacedSerialList = sameSequenceSerialList.length
          ? sameSequenceSerialList
          : (collectedSerialList.length >= requiredQuantity ? [collectedSerialList[0]] : []);
        replacedSerialList.forEach(function (replacedSerial) {
          orderData.snList = orderData.snList.filter(function (serial) {
            return serial.serialNo !== replacedSerial.serialNo;
          });
        });
        orderData.snList.push({
          serialNo: reported.materialSerialNo,
          materialID: reported.materialID,
          materialSeq: reported.materialSeq,
          scanTime: currentMockTime(),
        });
      }
      if (!window.__keyComponentMockSaved) window.__keyComponentMockSaved = [];
      window.__keyComponentMockSaved.push({ taskType: "Save", reported: reported });
      callback({ code: 0, msg: "ok", data: null });
    }, MOCK_DELAY);
  };
}

// -- Mock API 8：查询 VIN 信息（按订单号回旧VIN + 出厂编码） --
if (typeof window.KeyComponentChange_GetVinInfo != "function") {
  window.KeyComponentChange_GetVinInfo = function (request, callback) {
    var reported = (request && request.reported) || {};
    recordMockRequest("GetVinInfo", reported);
    setTimeout(function () {
      var orderData = findMockOrderData(reported);
      if (!orderData) {
        callback({ code: 1, msg: "未查询到订单信息" });
        return;
      }
      callback({
        code: 0,
        msg: "ok",
        data: { oldVin: orderData.vin || "", oldFactoryCode: orderData.factoryCode || "" },
      });
    }, MOCK_DELAY);
  };
}

// -- Mock API 9：保存 VIN（写入新VIN与出厂编码） --
if (typeof window.KeyComponentChange_SaveVin != "function") {
  window.KeyComponentChange_SaveVin = function (request, callback) {
    var reported = (request && request.reported) || {};
    recordMockRequest("SaveVin", reported);
    setTimeout(function () {
      var orderData = findMockOrderData(reported);
      if (!orderData) {
        callback({ code: 1, msg: "未查询到订单信息" });
        return;
      }
      orderData.vin = reported.newVin;
      orderData.factoryCode = reported.factoryCode;
      if (!window.__keyComponentMockSavedVin) window.__keyComponentMockSavedVin = [];
      window.__keyComponentMockSavedVin.push(reported);
      callback({ code: 0, msg: "ok", data: null });
    }, MOCK_DELAY);
  };
}
