// ============== Mock 数据与 API（仅本地开发用） ==============
// 生产环境不部署本文件：Portal 部署只取 index.html / index.js / index.css。
// Portal 在页面加载前注入同名 window 函数，本文件的 typeof 检测会跳过 Mock。
// 入参形态与生产一致：{ taskType, reported }。
// 命名：vin = 订单/车辆 VIN；serialNo = 关重件序列号。
// 回归脚本可用 window.__mockDelayMilliseconds 调低延迟（页面脚本执行前注入），默认 400ms 贴近真机
var MOCK_DELAY = typeof window.__mockDelayMilliseconds === "number" ? window.__mockDelayMilliseconds : 400;

var mockOrderDataMap = {
  // 生产订单：永磁体同步电机序号恰为 1、2（自动分配），另有序号为 null 的关重件
  "184000000012": {
    wipOrderNo: "184000000012",
    wipOrderType: 1,
    productID: 9001,
    productNo: "MAT-HOST-001",
    productDesc: "8x4 自卸车底盘",
    vin: "LSVU2A0N260800001",
    factoryCode: "FAC-0001",
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
    removeSnList: [],
  },
  // 改制订单：两条永磁体同步电机配置序号都是 1（不明确 → 弹窗人工选前后）；
  // removeSnList 2 条，物料类型均为「永磁体同步电机」，用于验证按类型解绑
  "184000000013": {
    wipOrderNo: "184000000013",
    wipOrderType: 2,
    productID: 9002,
    productNo: "MAT-HOST-002",
    productDesc: "8x4 搅拌车底盘",
    vin: "LSVU2A0N260800002",
    factoryCode: "FAC-0002",
    keyComponentList: [
      { materialID: 3001, materialNo: "MAT-MOTOR-011", materialDesc: "永磁体同步电机", materialQty: 1, uomCode: "EA", materialType: "永磁体同步电机", materialSeq: "1" },
      { materialID: 3001, materialNo: "MAT-MOTOR-011", materialDesc: "永磁体同步电机", materialQty: 1, uomCode: "EA", materialType: "永磁体同步电机", materialSeq: "1" },
      { materialID: 3002, materialNo: "MAT-BOX-012", materialDesc: "变速箱总成", materialQty: 1, uomCode: "EA", materialType: "关重件", materialSeq: "3" },
      // 改制单减件：数量为负数，解绑后由后端回到 0（页面按原值显示 0/-1 → 0/0）
      { materialID: 3003, materialNo: "MAT-NEG-031", materialDesc: "改制减件", materialQty: -1, uomCode: "EA", materialType: "改制减件", materialSeq: null },
    ],
    snList: [
      { serialNo: "SN-MOTOR-B1", materialID: 3001, materialSeq: "1", scanTime: "2026-08-24 10:00:00" },
    ],
    removeSnList: [
      { wipOrderNo: "184000000001", wipOrderType: 1, vin: "LSVU2A0N260800009", serialNo: "SN-MOTOR-OLD-1", materialID: 3001, materialNo: "MAT-MOTOR-011", scanTime: "2026-08-20 08:30:00" },
      { wipOrderNo: "184000000002", wipOrderType: 1, vin: "LSVU2A0N260800010", serialNo: "SN-MOTOR-OLD-2", materialID: 3001, materialNo: "MAT-MOTOR-011", scanTime: "2026-08-21 09:15:00" },
      { wipOrderNo: "184000000001", wipOrderType: 1, vin: "LSVU2A0N260800009", serialNo: "SN-NEG-OLD-1", materialID: 3003, materialNo: "MAT-NEG-031", scanTime: "2026-08-21 10:00:00" },
    ],
  },
  // 同 VIN 双单：生产订单 014 + 改制订单 015（共用 VIN，视图1 按单分组展示，两单都能采集）
  "184000000014": {
    wipOrderNo: "184000000014",
    wipOrderType: 1,
    productID: 9004,
    productNo: "MAT-HOST-004",
    productDesc: "8x4 牵引车底盘",
    vin: "LSVU2A0N260800003",
    factoryCode: "FAC-0014",
    keyComponentList: [
      { materialID: 4001, materialNo: "MAT-MOTOR-021", materialDesc: "永磁体同步电机", materialQty: 1, uomCode: "EA", materialType: "永磁体同步电机", materialSeq: "1" },
      { materialID: 4003, materialNo: "MAT-BOX-023", materialDesc: "变速箱总成", materialQty: 1, uomCode: "EA", materialType: "关重件", materialSeq: "3" },
    ],
    snList: [
      { serialNo: "SN-MOTOR-OLD-A", materialID: 4001, materialSeq: "1", scanTime: "2026-08-20 08:00:00" },
    ],
    removeSnList: [],
  },
  "184000000015": {
    wipOrderNo: "184000000015",
    wipOrderType: 2,
    productID: 9005,
    productNo: "MAT-HOST-005",
    productDesc: "8x4 牵引车底盘（改制）",
    vin: "LSVU2A0N260800003",
    factoryCode: "FAC-0015",
    keyComponentList: [
      { materialID: 5001, materialNo: "MAT-MOTOR-021", materialDesc: "永磁体同步电机", materialQty: 1, uomCode: "EA", materialType: "永磁体同步电机", materialSeq: "1" },
      { materialID: 5001, materialNo: "MAT-MOTOR-021", materialDesc: "永磁体同步电机", materialQty: 1, uomCode: "EA", materialType: "永磁体同步电机", materialSeq: "2" },
      { materialID: 5003, materialNo: "MAT-BOX-023", materialDesc: "变速箱总成", materialQty: 1, uomCode: "EA", materialType: "关重件", materialSeq: "3" },
    ],
    snList: [],
    // 改制单的待解绑 = 同 VIN 生产订单 014 上、与改制单物料类型匹配的已采 SN
    removeSnList: [
      { wipOrderNo: "184000000014", wipOrderType: 1, vin: "LSVU2A0N260800003", serialNo: "SN-MOTOR-OLD-A", materialID: 5001, materialNo: "MAT-MOTOR-021", scanTime: "2026-08-20 08:00:00" },
    ],
  },
};

// -- 待更换明细（改制 + 生产订单） --
var mockChangeRecordList = [
  { wipOrderNo: "184000000013", wipOrderType: 2, vin: "LSVU2A0N260800002", serialNo: "SN-OLD-CHG-1", materialID: 3001, materialNo: "MAT-MOTOR-011", scanTime: "2026-08-22 10:00:00" },
  { wipOrderNo: "184000000001", wipOrderType: 1, vin: "LSVU2A0N260800009", serialNo: "SN-OLD-CHG-2", materialID: 3001, materialNo: "MAT-MOTOR-011", scanTime: "2026-08-22 11:30:00" },
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

/** 订单在 orderList 中的展示项（vin = 订单 VIN） */
function buildMockOrderListItem(order) {
  return {
    wipOrderNo: order.wipOrderNo,
    wipOrderType: order.wipOrderType,
    productID: order.productID,
    productNo: order.productNo,
    productDesc: order.productDesc,
    vin: order.vin,
  };
}

/** 同 VIN 订单集合：改制在前、生产在后（仅展示顺序，无主次） */
function getMockOrderListByVin(vin) {
  return Object.keys(mockOrderDataMap)
    .map(function (orderNo) {
      return mockOrderDataMap[orderNo];
    })
    .filter(function (order) {
      return order.vin && order.vin === vin;
    })
    .sort(function (left, right) {
      var leftChange = String(left.wipOrderType) === "2" ? 0 : 1;
      var rightChange = String(right.wipOrderType) === "2" ? 0 : 1;
      return leftChange - rightChange;
    })
    .map(buildMockOrderListItem);
}

function currentMockTime() {
  var d = new Date();
  var pad = function (n) { return n < 10 ? "0" + n : n; };
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " +
    pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
}

// -- Mock API 1：查询订单信息（订单号精确命中；否则按 vin 取同 VIN 订单集合） --
if (typeof window.KeyComponentChange_GetWipOrderNoInfo != "function") {
  window.KeyComponentChange_GetWipOrderNoInfo = function (request, callback) {
    var reported = (request && request.reported) || {};
    recordMockRequest("GetWipOrderNoInfo", reported);
    setTimeout(function () {
      var orderData = null;
      if (reported.wipOrderNo) {
        orderData = mockOrderDataMap[reported.wipOrderNo] || null;
      } else if (reported.vin) {
        orderData = Object.keys(mockOrderDataMap)
          .map(function (orderNo) { return mockOrderDataMap[orderNo]; })
          .filter(function (order) { return order.vin === reported.vin; })[0] || null;
      }
      if (!orderData) {
        callback({ code: 1, msg: "未查询到订单信息" });
        return;
      }
      callback({
        code: 0,
        msg: "ok",
        data: { orderList: getMockOrderListByVin(orderData.vin) },
      });
    }, MOCK_DELAY);
  };
}

// -- Mock API 2：查询关重件信息（单订单；removeSnList 为待解绑旧件） --
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
      callback({
        code: 0,
        msg: "ok",
        data: {
          removeSnList: orderData.removeSnList || [],
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
      if (String(reported.serialNo || "").indexOf("CHG-") === 0) {
        callback({ code: 0, msg: "ok", data: { isChange: "1" } });
        return;
      }
      var orderData = findMockOrderData(reported);
      if (orderData) {
        orderData.snList.push({
          serialNo: reported.serialNo,
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

// -- Mock API 4：移除关重件（删除已采序列号 / 解绑待解绑旧件） --
if (typeof window.KeyComponentChange_Remove != "function") {
  window.KeyComponentChange_Remove = function (request, callback) {
    var reported = (request && request.reported) || {};
    recordMockRequest("Remove", reported);
    setTimeout(function () {
      var orderData = findMockOrderData(reported);
      if (orderData) {
        orderData.snList = orderData.snList.filter(function (serial) {
          return serial.serialNo !== reported.serialNo;
        });
      }
      // 待解绑清单：从所有订单的 removeSnList 中移除该旧件；记录所属订单用于负数数量回填
      var removedRecord = null;
      var ownerOrder = null;
      Object.keys(mockOrderDataMap).forEach(function (orderNo) {
        var order = mockOrderDataMap[orderNo];
        (order.removeSnList || []).forEach(function (record) {
          if (record.serialNo === reported.serialNo) {
            removedRecord = record;
            ownerOrder = order;
          }
        });
        order.removeSnList = (order.removeSnList || []).filter(function (record) {
          return record.serialNo !== reported.serialNo;
        });
      });
      // 模拟后端：解绑后该组件负数数量 +1（如 -1 → 0）
      if (removedRecord && ownerOrder) {
        (ownerOrder.keyComponentList || []).forEach(function (component) {
          if (component.materialNo === removedRecord.materialNo && Number(component.materialQty) < 0) {
            component.materialQty = Number(component.materialQty) + 1;
          }
        });
      }
      if (!window.__keyComponentMockRemoved) window.__keyComponentMockRemoved = [];
      window.__keyComponentMockRemoved.push(reported);
      callback({ code: 0, msg: "ok", data: { oldGenealogyID: "GEN-" + window.__keyComponentMockRemoved.length } });
    }, MOCK_DELAY);
  };
}

// -- Mock API 5：待更换明细（materialSeq 为 "1"/"2" 时按位置过滤，"" 不过滤） --
if (typeof window.KeyComponentChange_GetChangeKeyComponentInfo != "function") {
  window.KeyComponentChange_GetChangeKeyComponentInfo = function (request, callback) {
    var reported = (request && request.reported) || {};
    recordMockRequest("GetChangeKeyComponentInfo", reported);
    setTimeout(function () {
      var materialSequence = reported.materialSeq === null || reported.materialSeq === undefined ? "" : String(reported.materialSeq);
      var recordList = mockChangeRecordList;
      if (materialSequence === "1" || materialSequence === "2") {
        recordList = mockChangeRecordList.filter(function (record) {
          return mockChangeRecordSequenceMap[record.serialNo] === materialSequence;
        });
      }
      callback({ code: 0, msg: "ok", data: recordList });
    }, MOCK_DELAY);
  };
}

// -- Mock API 6：带被替换旧件 ID 保存新关重件 --
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
          serialNo: reported.serialNo,
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

// -- Mock API 7：查询 VIN 信息（按订单号回旧VIN + 出厂编码） --
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

// -- Mock API 8：保存 VIN（写入新VIN与出厂编码） --
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
