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
    // 改制单的负数 = 需解绑数量：电机 -1×2 + 减件 -1，合计 -3，与 removeSnList 3 条对应
    keyComponentList: [
      { materialID: 3001, materialNo: "MAT-MOTOR-011", materialDesc: "永磁体同步电机", materialQty: -1, uomCode: "EA", materialType: "永磁体同步电机", materialSeq: "1" },
      { materialID: 3001, materialNo: "MAT-MOTOR-011", materialDesc: "永磁体同步电机", materialQty: -1, uomCode: "EA", materialType: "永磁体同步电机", materialSeq: "1" },
      { materialID: 3002, materialNo: "MAT-BOX-012", materialDesc: "变速箱总成", materialQty: 1, uomCode: "EA", materialType: "关重件", materialSeq: "3" },
      { materialID: 3004, materialNo: "MAT-BOX-OLD-33", materialDesc: "变速箱总成（旧）", materialQty: -1, uomCode: "EA", materialType: "关重件", materialSeq: null },
      { materialID: 3003, materialNo: "MAT-NEG-031", materialDesc: "改制减件", materialQty: -1, uomCode: "EA", materialType: "改制减件", materialSeq: null },
    ],
    // 013 为「只解绑」场景：无已采新件，卡片按负数显示 0/-N
    snList: [],
    removeSnList: [
      { wipOrderNo: "184000000001", wipOrderType: 1, vin: "LSVU2A0N260800009", serialNo: "SN-MOTOR-OLD-1", materialID: 3001, materialNo: "MAT-MOTOR-OLD-11", materialSeq: "1", scanTime: "2026-08-20 08:30:00" },
      { wipOrderNo: "184000000002", wipOrderType: 1, vin: "LSVU2A0N260800010", serialNo: "SN-MOTOR-OLD-2", materialID: 3001, materialNo: "MAT-MOTOR-OLD-12", materialSeq: "2", scanTime: "2026-08-21 09:15:00" },
      { wipOrderNo: "184000000002", wipOrderType: 1, vin: "LSVU2A0N260800010", serialNo: "SN-BOX-OLD-1", materialID: 3004, materialNo: "MAT-BOX-OLD-33", materialSeq: null, scanTime: "2026-08-21 10:30:00" },
      { wipOrderNo: "184000000001", wipOrderType: 1, vin: "LSVU2A0N260800009", serialNo: "SN-NEG-OLD-1", materialID: 3003, materialNo: "MAT-NEG-OLD-31", materialSeq: null, scanTime: "2026-08-21 10:00:00" },
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
    // 015 的电机走「替换」（生产单 014 上有已采 SN-MOTOR-OLD-A，active），不放进待解绑清单；
    // 待解绑清单只放「只解绑不替换」的旧件（见 013）
    removeSnList: [],
  },
  // 真实 VIN 查询样例（生产数据脱敏）：同一 VIN 下改制 + 生产两张单
  "810000359358": {
    wipOrderNo: "810000359358",
    wipOrderType: 2,
    productID: 102538343,
    productNo: "KEV113160505",
    productDesc: "HQC42503SWBEV2238933C1 江山SE锂能600充电标载版牵引车选配主体",
    vin: "LFXAH97W3T3053015",
    factoryCode: "",
    keyComponentList: [
      { materialID: 102495094, materialNo: "HQ2103010SQDHAX1", materialDesc: "360kW驱动电机TZ388XS-SYM01", materialQty: 1, uomCode: "PC", materialType: "永磁体同步电机", materialSeq: "" },
      { materialID: 102455573, materialNo: "HQ2103010SQDA3C1", materialDesc: "永磁同步电机TZ388XS-SYM01", materialQty: -1, uomCode: "PC", materialType: "永磁体同步电机", materialSeq: "" },
      { materialID: 102480903, materialNo: "HQ2104000SQDC2", materialDesc: "五合一控制器KTZ61X85SSYC01", materialQty: -1, uomCode: "PC", materialType: "辅控多合一", materialSeq: "" },
      { materialID: 102498107, materialNo: "HQ2104000SQDHAX1", materialDesc: "五合一控制器KTZ61X85 SSYC01", materialQty: 1, uomCode: "PC", materialType: "五合一", materialSeq: "" }
    ],
    snList: [
      { serialNo: "26103521", materialID: 102495094, materialSeq: "2", scanTime: "2026-10-26 14:56:09" },
      { serialNo: "011585148TA00004", materialID: 102498107, materialSeq: "", scanTime: "2026-10-27 20:28:38" }
    ],
    removeSnList: [],
  },
  "880009497739": {
    wipOrderNo: "880009497739",
    wipOrderType: 1,
    productID: 102538343,
    productNo: "KEV113160505",
    productDesc: "HQC42503SWBEV2238933C1 江山SE锂能600充电标载版牵引车选配主体",
    vin: "LFXAH97W3T3053015",
    factoryCode: "",
    keyComponentList: [
      { materialID: 102399273, materialNo: "KQY008115209", materialDesc: "后桥传动轴总成2205100-SQ353", materialQty: 1, uomCode: "PC", materialType: "后传动轴总成", materialSeq: "" },
      { materialID: 102455573, materialNo: "HQ2103010SQDA3C1", materialDesc: "永磁同步电机TZ388XS-SYM01", materialQty: 1, uomCode: "PC", materialType: "永磁体同步电机", materialSeq: "" },
      { materialID: 102480903, materialNo: "HQ2104000SQDC2", materialDesc: "五合一控制器KTZ61X85SSYC01", materialQty: 1, uomCode: "PC", materialType: "辅控多合一", materialSeq: "" },
      { materialID: 100025100, materialNo: "131500000073A", materialDesc: "平衡悬架2904010-TM380 加强型", materialQty: 1, uomCode: "PC", materialType: "平衡悬架总成", materialSeq: "" },
      { materialID: 102482758, materialNo: "HQ2902005SQ61X1", materialDesc: "前钢板弹簧总成(左)1800-90-3-26", materialQty: 2, uomCode: "PC", materialType: "前钢板弹簧总成", materialSeq: "" },
      { materialID: 102465144, materialNo: "HQ3860020SQ43G1", materialDesc: "三合一T-Box总成LN1526-DC-T-BAT-CHN-500", materialQty: 1, uomCode: "PC", materialType: "T-BOX", materialSeq: "" },
      { materialID: 100025106, materialNo: "131502000002A", materialDesc: "后钢板弹簧总成1580×90×3", materialQty: 2, uomCode: "PC", materialType: "后钢板弹簧总成", materialSeq: "" },
      { materialID: 102479034, materialNo: "QDP010834643", materialDesc: "中桥传动轴总成BCDP3RST.22.1A", materialQty: 1, uomCode: "PC", materialType: "中桥传动轴", materialSeq: "" },
      { materialID: 102516688, materialNo: "HQ2152000SQDF8L3", materialDesc: "高压配电盒BX3-512", materialQty: 1, uomCode: "PC", materialType: "自研高压箱", materialSeq: "" },
      { materialID: 102516787, materialNo: "KEV012794274", materialDesc: "左底盘线束总成/SE复合/标准化底盘/充电/EBSHQ4010020-SQDG9X2", materialQty: 1, uomCode: "PC", materialType: "底盘线束", materialSeq: "" },
      { materialID: 102516805, materialNo: "KEV012794275", materialDesc: "右底盘线束总成/EPB/360/EBSHQ4010010-SQDFDX7", materialQty: 1, uomCode: "PC", materialType: "底盘线束", materialSeq: "" },
      { materialID: 102526505, materialNo: "HQ2400005SQD90X6", materialDesc: "后桥总成HDX31Z50A000020 469/5.286/钢轮", materialQty: 1, uomCode: "PC", materialType: "后桥", materialSeq: "" },
      { materialID: 101894283, materialNo: "HQ3703000QQD1", materialDesc: "蓄电池6-QTPE-60/640", materialQty: 2, uomCode: "PC", materialType: "蓄电池", materialSeq: "" },
      { materialID: 102444004, materialNo: "HQ3411005SQD3", materialDesc: "动力转向器Z016Y11", materialQty: 1, uomCode: "PC", materialType: "动力转向器", materialSeq: "" },
      { materialID: 102465264, materialNo: "KEV011151827", materialDesc: "车架总成2810000-SQDFD", materialQty: 1, uomCode: "PC", materialType: "车架", materialSeq: "" },
      { materialID: 102480456, materialNo: "HQ1700000SQDA4", materialDesc: "变速箱总成6E240-C 法士特", materialQty: 1, uomCode: "PC", materialType: "变速器", materialSeq: "" },
      { materialID: 102515706, materialNo: "KJS200001069", materialDesc: "SY328BB2A34UL驾驶室选配总成（SQD9UX1）", materialQty: 1, uomCode: "PC", materialType: "驾驶室", materialSeq: "" },
      { materialID: 102415520, materialNo: "HQ3000005SQDA3X1", materialDesc: "前桥总成SH30T7064-00005 7T 铝轮 免维护", materialQty: 1, uomCode: "PC", materialType: "前桥", materialSeq: "" },
      { materialID: 102526519, materialNo: "HQ2500005SQD90X6", materialDesc: "中桥总成HDX21Z50A000029 469/5.286/钢轮", materialQty: 1, uomCode: "PC", materialType: "中桥", materialSeq: "" },
      { materialID: 102509325, materialNo: "BCV100000129BD", materialDesc: "600G充（牵引）", materialQty: 1, uomCode: "PC", materialType: "动力电池箱", materialSeq: "" },
      { materialID: 102467365, materialNo: "HQ3555015SQDFB", materialDesc: "空气处理单元3511 050 232 0 限23 24口", materialQty: 1, uomCode: "PC", materialType: "空气处理单元", materialSeq: "" }
    ],
    snList: [
      { serialNo: "202610080249", materialID: 101894283, materialSeq: "", scanTime: "2026-10-11 22:07:30" },
      { serialNo: "260920540827", materialID: 102444004, materialSeq: "", scanTime: "2026-10-11 21:43:06" },
      { serialNo: "52260520029578", materialID: 102465144, materialSeq: "", scanTime: "2026-10-11 23:13:52" },
      { serialNo: "260730G103", materialID: 102415520, materialSeq: "", scanTime: "2026-10-11 20:45:41" },
      { serialNo: "1115182726104250", materialID: 102465264, materialSeq: "", scanTime: "2026-10-11 19:01:04" },
      { serialNo: "S9TH1001", materialID: 102176177, materialSeq: "", scanTime: "2026-10-11 21:34:04" },
      { serialNo: "26BVCG600AA4533", materialID: 102500028, materialSeq: "", scanTime: "2026-10-12 16:58:06" },
      { serialNo: "202609161113", materialID: 102399106, materialSeq: "", scanTime: "2026-10-11 20:54:34" },
      { serialNo: "S9BH4090", materialID: 102174506, materialSeq: "", scanTime: "2026-10-11 21:34:01" },
      { serialNo: "G260916216", materialID: 102399273, materialSeq: "", scanTime: "2026-10-11 21:11:41" },
      { serialNo: "G260716071", materialID: 102479034, materialSeq: "", scanTime: "2026-10-11 21:11:34" },
      { serialNo: "202609161240", materialID: 102399106, materialSeq: "", scanTime: "2026-10-11 20:51:09" },
      { serialNo: "26092689-025", materialID: 102516688, materialSeq: "", scanTime: "2026-10-11 21:43:04" },
      { serialNo: "2-260902483", materialID: 102480456, materialSeq: "", scanTime: "2026-10-11 21:57:56" },
      { serialNo: "SDJ06TAXS1045551", materialID: 102515706, materialSeq: "", scanTime: "2026-10-11 23:13:42" },
      { serialNo: "202610080245", materialID: 101894283, materialSeq: "", scanTime: "2026-10-11 22:07:30" },
      { serialNo: "G2026092700rN2Y", materialID: 102482758, materialSeq: "", scanTime: "2026-10-11 20:45:48" },
      { serialNo: "S9PH7195", materialID: 102400283, materialSeq: "", scanTime: "2026-10-11 21:34:03" },
      { serialNo: "G2026092700jN2Z", materialID: 102482758, materialSeq: "", scanTime: "2026-10-11 20:45:49" },
      { serialNo: "A260906462", materialID: 102526519, materialSeq: "", scanTime: "2026-10-11 20:59:40" },
      { serialNo: "20261007-147099800039", materialID: 102516787, materialSeq: "", scanTime: "2026-10-11 20:01:51" },
      { serialNo: "A260906858", materialID: 102526505, materialSeq: "", scanTime: "2026-10-11 21:04:47" },
      { serialNo: "20260930-147099845024", materialID: 102516805, materialSeq: "", scanTime: "2026-10-11 20:01:47" },
      { serialNo: "20260916005", materialID: 100025100, materialSeq: "", scanTime: "2026-10-11 20:58:30" },
      { serialNo: "G202609290d6I4G", materialID: 100025106, materialSeq: "", scanTime: "2026-10-11 20:58:28" },
      { serialNo: "G202609290r6I4M", materialID: 100025106, materialSeq: "", scanTime: "2026-10-11 20:58:32" },
      { serialNo: "2609220104", materialID: 102467365, materialSeq: "", scanTime: "2026-10-11 19:03:18" }
    ],
    removeSnList: [],
  },
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
      // 订单号/VIN 搜索都先按 VIN 归组，返回该 VIN 下所有订单（改制在前）
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
        var componentList = ownerOrder.keyComponentList || [];
        for (var i = 0; i < componentList.length; i++) {
          var component = componentList[i];
          if (String(component.materialID) === String(removedRecord.materialID) && Number(component.materialQty) < 0) {
            component.materialQty = Number(component.materialQty) + 1;
            break;
          }
        }
      }
      if (!window.__keyComponentMockRemoved) window.__keyComponentMockRemoved = [];
      window.__keyComponentMockRemoved.push(reported);
      callback({ code: 0, msg: "ok", data: { oldGenealogyID: "GEN-" + window.__keyComponentMockRemoved.length } });
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
      // oldGenealogyID 为空 = 正常采集（不替换旧件）；有值 = 替换
      var isReplace = !!(reported.oldGenealogyID && String(reported.oldGenealogyID) !== "");
      if (orderData) {
        if (isReplace) {
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
        }
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
