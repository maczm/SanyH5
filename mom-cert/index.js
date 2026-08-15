/**
 * index.js - Mock 数据 + 字段校验注入
 *
 * 不修改 index.html，纯叠加注入。
 *
 * 时序：
 *   1. 同步：$Context.inputs 赋值（页面加载时立即执行）
 *   2. 异步：$(document).ready + setTimeout → 校验引擎（DOM 填充后执行）
 */
var __DEV__ = true; // true=本地开发(Mock数据+调试日志)，false=生产环境

/**
 * 校验开关配置
 * 扁平证书用 boolean，嵌套证书（HB/RY）用 { ZC: true, CS: true } 按车型控制
 * 设置为 false 可跳过对应校验，默认全部开启
 *
 * 示例：
 *   window.VALIDATION_SWITCH = { DP: false };                          // 关闭底盘
 *   window.VALIDATION_SWITCH = { HB: { ZC: true, CS: false } };       // 环保只验牵引车
 *   window.VALIDATION_SWITCH = { HB: false, RY: false };              // 关闭嵌套证书
 */
var VALIDATION_SWITCH = window.VALIDATION_SWITCH || {
  DP: true, // 底盘合格证
  ZC: true, // 整车合格证
  CL: true, // 车辆一致性证书
  WX: true, // 卫星定位装置
  HB: { ZC: true, CS: true }, // 环保信息（按车型 ZC/CS）
  RY: { ZC: true, CS: true }, // 燃油消耗（按车型 ZC/CS）
};

if (__DEV__) {
  // ============================================================
  // $Context - 通信桥接对象（Mock 模式）
  // ============================================================
  var $Context = {
    inputs: {},
    outputs: {},
    submit: function () {
      if (__DEV__) console.log("[index.js] $Context.submit() → Action:", this.outputs.Action);
    },
  };

  // ============================================================
  // Mock 数据初始化（同步执行，在 index.html 内联脚本之前）
  // ============================================================
  var ctx = $Context.inputs;

  // ---- 订单基础信息 ----
  ctx.WIPORDERNO = "WO-2024-06001";
  ctx.PRODUCTNO = "HNT-001";
  ctx.SINGLEVEHICLEMODELNO = "XYZ123-2024";
  ctx.GROUPNO = "GG202405";
  ctx.CHECK_Date = "2024-06-15";
  ctx.SPECIALSALECOMMONT = "空调+ABS+导流罩";
  ctx.MODETYPE = "国六";
  ctx.ISCARGOTRUCK = true;
  ctx.FromIndexType = "RDSpotCheckIndex";
  ctx.FRISTTRIALSTATUS = "0";
  ctx.RDSPOTFALG = 0;
  ctx.MSG = "";
  ctx.CHECK_CONTENT = "[]";
  ctx.ISSUEDATE = "2024-06-10";
  ctx.PRODUCTTIME = "2024-06-08";
  ctx.ZCCOLOR = "白色";
  ctx.Base64_ZCCERTIFICATIONNO = "";
  ctx.Base64_QRCode = "";

  // ---- 底盘合格证 DP (扁平 KV) ----
  ctx.DP = JSON.stringify({
    CHASISCETIFICATIONNO: "CET2024060012345",
    ISSUEDATE: "2024-06-10",
    ZCMANUFACTURECOMPANY: "东风商用车有限公司",
    ZCBRAND: "东风",
    ZCNAME: "载货汽车底盘",
    ZCCLASSIFY: "二类",
    ZCMODEL: "DFH1180",
    CHASISID: "CH202406001",
    ZCCOLOR: "白色",
    CARRIAGEVIN: "LSVA10339C2123456",
    FUELTYPE: "天然气",
    ZCENGINEMODEL: "WP10H375E50",
    DISPLACEMENT: "9500",
    RATE: "276",
    ENGINENO: "WP10H202406001",
    EMISSIONSTANDARD: "国五",
    STEERINGMODE: "机械转向",
    TIRENUMBER: "6",
    TIRETYPE: "12R22.5",
    FRONTGAUGE: "2040",
    RACKREAR: "1860",
    AXIESPREAD: "5800",
    AXIELOAD: "6500/11500",
    AXIENUMBER: "2",
    STEELPLATESSPRINGS: "2/3",
    EXTERNALLENGTH: "9000",
    EXTERNALWIDTH: "2550",
    EXTERNALHEIGHT: "3100",
    TOTALWEIGHT: "18000",
    HOSTWEIGHT: "6200",
    TRACTIONWEIGHT: "40000",
    SEMITRAILERSADDLEWEIGHT: "12000",
    PASSENGER: "3",
    MAXSPEED: "110",
    PRODUCTTIME: "2024-06-08",
    REMARK: "",
    COMPANYSTANDARD: "GB7258-2017",
    ZCPRODUCTIONCOMPANY: "东风商用车有限公司",
    ZCPRODUCTADDRESS: "湖北省十堰市",
    COMPANYOTHERINFO: "",
  });

  // ---- 整车合格证 ZC (扁平 KV) ----
  ctx.ZC = JSON.stringify({
    ZCCERTIFICATIONNO: "ZCE2024060012345",
    ISSUEDATE: "2024-06-10",
    ZCMANUFACTURECOMPANY: "东风商用车有限公司",
    ZCBRAND: "东风",
    ZCNAME: "厢式运输车",
    ZCMODEL: "DFH5180XXY",
    CARRIAGEVIN: "LSVA10339C2123456",
    ZCCOLOR: "红色",
    CHASISMODEL: "DFH1180",
    CHASISID: "CH202406001",
    CHASISCETIFICATIONNO: "CET2024060012345",
    ZCENGINEMODEL: "WP10H375E50",
    ENGINENO: "WP10H202406001",
    FUELTYPE: "柴油",
    DISPLACEMENT: "9500",
    RATE: "276",
    EMISSIONSTANDARD: "国六",
    FUELCOMSUMPTION: "26.5",
    STEELPLATESSPRINGS: "2/3",
    TIRENUMBER: "4",
    TIRETYPE: "12R22.5",
    FRONTGAUGE: "2040",
    RACKREAR: "1860",
    AXIESPREAD: "5800",
    AXIELOAD: "6500/11500",
    AXIENUMBER: "2",
    STEERINGMODE: "液压助力",
    TOTALWEIGHT: "18000",
    HOSTWEIGHT: "6500",
    RATELOADWEIGHT: "11500",
    EXTERNALLENGTH: "10100",
    EXTERNALWIDTH: "2550",
    EXTERNALHEIGHT: "3800",
    PASSENGER: "3",
    MAXSPEED: "110",
    PRODUCTTIME: "2024-06-08",
    REMARK: "",
    TRACTIONWEIGHT: "-",
    SEMITRAILERSADDLEWEIGHT: "-",
    NOTICELOT: "2024-05",
    NOTICEEFFECTTIME: "2024-05-01",
    PRODUCTNOTICENO: "PN202405001",
    CONFIGURATIONSEQ: "CSQ001",
    MBHDMSBS: "0",
    MBXNYQCJMSBS: "0",
    MBXNYQCZL: "00",
    LOADWEIGHTFACTOR: "1.2",
    RATEPASSENGERS: "3",
    COMPANYSTANDARD: "GB7258-2017",
    ZCPRODUCTIONCOMPANY: "东风商用车有限公司",
    ZCPRODUCTADDRESS: "湖北省十堰市",
    COMPANYOTHERINFO: "",
  });

  // ---- 环保信息 HB (嵌套结构，按车型分组) ----
  ctx.HB = JSON.stringify({
    ZC: {
      VehicleManufacture: "东风商用车有限公司",
      VehicleModel: "DFH5180XXY",
      EngineModel: "WP10H375E50",
      EngineNo: "WP10H202406001",
      EmissionStage: "国六",
      Trademark: "东风",
      VehicleCagetory: "N3",
      InfoPublicNo: "HB202405001",
      Legal: "东风商用车有限公司",
      Phone: "0719-8888888",
      Address: "湖北省十堰市",
      HbProductAddress: "湖北省十堰市",
      EngineBrand: "潍柴",
      EngineManufacturer: "潍柴动力股份有限公司",
      EngineFacilityAddress: "山东省潍坊市",
      EngineSeries: "WP10H",
      DependLevel: "国六",
      VerdictLevel: "合格",
      MaxNetPower_Speed: "276/1900",
      MaxNetTorque_Speed: "1800/1000-1400",
      FuelSupply: "高压共轨",
      FuelInjector: "博世",
      FuelPump: "博世",
      ECUTypeVersion: "博世EDC17",
      EGRType: "冷却EGR",
      TurboCharger: "增压中冷",
      InterCooler: "是",
      ExhaustAfter: "SCR+ASC",
      AfterType: "SCR",
      AfterMuffler: "是",
      AirFilter: "纸质滤芯",
      IntakeMuffler: "是",
      Coating: "-",
      ODBType: "OBD-II",
      VehicleIDMethodLocation: "车架右侧",
      VehicleplateLocation: "驾驶室右侧",
      DependStandard01: "GB17691-2018",
      DependStandard02: "GB18285-2018",
      DependStandard03: "",
      Orgnazation01: "国家机动车质量检验检测中心",
      Orgnazation02: "",
      Orgnazation03: "",
      Verdict01: "符合",
      Verdict02: "",
      Verdict03: "",
    },
    CS: {
      VehicleManufacture: "东风商用车有限公司",
      VehicleModel: "DFH5180CCY",
      EngineModel: "YC6J220-50",
      EngineNo: "YC6J202406002",
      EmissionStage: "国六",
      Trademark: "东风",
      VehicleCagetory: "N3",
      InfoPublicNo: "HB202405002",
      Legal: "东风商用车有限公司",
      Phone: "0719-8888888",
      Address: "湖北省十堰市",
      HbProductAddress: "湖北省十堰市",
      EngineBrand: "玉柴",
      EngineManufacturer: "广西玉柴机器股份有限公司",
      EngineFacilityAddress: "广西玉林市",
      EngineSeries: "YC6J",
      DependLevel: "国六",
      VerdictLevel: "合格",
      MaxNetPower_Speed: "220/2500",
      MaxNetTorque_Speed: "1000/1200-1700",
      FuelSupply: "高压共轨",
      FuelInjector: "德尔福",
      FuelPump: "德尔福",
      ECUTypeVersion: "德尔福",
      EGRType: "冷却EGR",
      TurboCharger: "增压中冷",
      InterCooler: "是",
      ExhaustAfter: "SCR+ASC",
      AfterType: "SCR",
      AfterMuffler: "是",
      AirFilter: "纸质滤芯",
      IntakeMuffler: "是",
      Coating: "-",
      ODBType: "OBD-II",
      VehicleIDMethodLocation: "车架右侧",
      VehicleplateLocation: "驾驶室右侧",
      DependStandard01: "GB17691-2018",
      DependStandard02: "GB18285-2018",
      DependStandard03: "",
      Orgnazation01: "国家机动车质量检验检测中心",
      Orgnazation02: "",
      Orgnazation03: "",
      Verdict01: "符合",
      Verdict02: "",
      Verdict03: "",
    },
  });

  // ---- 车辆一致性证书 CL (扁平 KV) ----
  ctx.CL = JSON.stringify({
    CarConfirmityCertNo: "CC2024060012345",
    CarFactoryName: "东风商用车有限公司",
    CarMakeCountry: "中国",
    CarTypeCodeName: "DFH5180",
    UnitCodeName: "DFH5180XXY",
    CarCodeName: "XXY-001",
    CarName: "厢式运输车",
    CarChineseName: "东风",
    CarEnglishName: "DONGFENG",
    CarType1: "N3",
    CarType2: "厢式货车",
    EndMakeManufacturesName: "东风商用车有限公司",
    EndMakeManufacturersAddress: "湖北省十堰市",
    LegalNameplateLocaltion: "驾驶室右侧",
    CarIdentifyCode: "LSVA10339C2123456",
    CarIdentifyCodeLocaltion: "车架右侧纵梁",
    EngineNo: "WP10H202406001",
    Displacement: "8500",
    MaxPower: "276",
    MaxSpeed: "110",
    TotalWeight: "18000",
    LoadingWeightRatio: "1.2",
    OnDriverWeight: "6500",
    EngineModel: "WP10H375E50",
    EngineNoToEnginePostion: "发动机右侧",
    EngineWorkingPrinciple: "四冲程压燃式",
    CylinderArrange: "直列",
    NumberOfCylinder: "6",
    EngineRotateSpeed: "1900",
    FuelType: "甲醇",
    DirectInjection: "是",
    TransmissionType: "手动",
    SpeedProportion: "1.0",
    MainTransmissionRatio: "4.875",
    TurnToType: "方向盘",
    PowerStreeringType: "液压助力",
    CutchType: "单片干式",
    NumberOfAxle: "2",
    AxleDistince: "5800",
    AxleAllowWeight: "6500/11500",
    WheelDistance: "2040/1860",
    NumberOfWheel: "6",
    TireType: "12R22.5",
    NumberOfLeafSpring: "2/3",
    FrontHang: "1450",
    BackHang: "2850",
    ApproachAngle: "18",
    LeaveAngle: "12",
    FrontCenterDistance: "5800",
    MinDistanceBefore: "1450",
    MaxDistanceBefore: "1450",
    IsAirSuspension: "否",
    IsEquivalentAir: "否",
    NumberOfDoors: "2",
    DoorsStructure: "平开门",
    NumberOfSeats: "3",
    DriverAlxeLocal: "前轴",
    LoadingAxleLocal: "后轴",
    ScaleAxleLocal: "后轴",
    ConnectPointWeight: "-",
    CraneTorque: "-",
    DragAndTrailerWeight: "-",
    MaxDragWeightList: "-",
    ABSManufacture: "威伯科",
    ABSModel: "ABS-8",
    PressureInPipe: "8",
    VehicleColor: "白色",
    BodyType: "厢式",
    BoxVolume: "55",
    BoxInnerSize: "7800/2450/2500",
    ShippingAreaLength: "-",
    WeightAxleDistibute: "6500/11500",
    ShadowArea: "1.2",
    Length: "10100",
    Width: "2550",
    Height: "3800",
    BrakingDriverNotice: "气压制动",
    NoiseLevel: "82",
    ExhaustEmissions: "国六",
    CCCCertNo: "CCC202405001",
    CCCCertNo2: "",
    CCCExperimentReportNo: "CER202405001",
    ManufacturerName: "东风商用车有限公司",
    ProductDate: "2024-06-08",
    IssuDate: "2024-06-10",
    Remark: "",
  });

  // ---- 卫星定位 WX (扁平 KV) ----
  ctx.WX = JSON.stringify({
    VehicleFacility: "东风商用车有限公司",
    CarBrand: "东风",
    VehicleModel: "DFH5180XXY",
    VIN: "LSVA10339C2123456",
    GPSType: "GPS",
    GPSParameter: "4G+BD/GPS双模定位",
    ClientModel: "VT-2000",
    PositionType: "北斗/GPS双模",
    CommunicationType: "4G LTE",
    EnterpriceNo: "ENT202401001",
    GovBatchNo: "JT2024-001",
    ApplicableModel: "DFH5180系列",
    SIMType: "中国电信4G",
    GPSDeviceID: "GPS2024060012345",
    Date: "2024-06-10",
    WarrantyDate: "2027-06-09",
    Other: "",
  });

  // ---- 燃油消耗量 RY (嵌套结构，按车型分组) ----
  ctx.RY = JSON.stringify({
    ZC: {
      HGZ_CPXH: "DFH5180XXY",
      HGZ_FDJXH: "WP10H375E50",
      HGZ_ZXBZ: "GB/T 29793-2013",
      Speed1: "60",
      Speed2: "70",
      Speed3: "80",
      Speed4: "90",
      Speed5: "100",
      Speed6: "110",
      Gear1: "6",
      Gear2: "6",
      Gear3: "6",
      Gear4: "6",
      Gear5: "6",
      Gear6: "6",
      FuelConsumption1: "18.5",
      FuelConsumption2: "20.2",
      FuelConsumption3: "22.8",
      FuelConsumption4: "25.5",
      FuelConsumption5: "28.3",
      FuelConsumption6: "31.0",
      Gear: "6",
      AccelerationDistance: "1200",
      AccelerationTime: "45",
      FuelConsumption: "24.5",
      IdleFuel: "2.8",
      UnitTurnoverFuel: "1.8",
    },
    CS: {
      HGZ_CPXH: "DFH5180CCY",
      HGZ_FDJXH: "YC6J220-50",
      HGZ_ZXBZ: "GB/T 29793-2013",
      Speed1: "60",
      Speed2: "70",
      Speed3: "80",
      Speed4: "90",
      Speed5: "100",
      Speed6: "110",
      Gear1: "5",
      Gear2: "5",
      Gear3: "5",
      Gear4: "5",
      Gear5: "5",
      Gear6: "5",
      FuelConsumption1: "16.8",
      FuelConsumption2: "18.5",
      FuelConsumption3: "20.6",
      FuelConsumption4: "23.0",
      FuelConsumption5: "25.8",
      FuelConsumption6: "28.5",
      Gear: "5",
      AccelerationDistance: "1000",
      AccelerationTime: "40",
      FuelConsumption: "35.0",
      IdleFuel: "2.5",
      UnitTurnoverFuel: "1.6",
    },
  });

  // ---- 校验规则（同走 $Context.inputs） ----
  // color 为空 → 跳过；color 有值 → 直接设对应颜色边框
  // 与生产一致：JSON 字符串，由 safeParse 解析
  ctx.DP_Validate = JSON.stringify({
    CHASISCETIFICATIONNO: { rule: "强制", value: ["CET2024060012345", "CET2024060012346"], color: "#FF0000" },
    FUELTYPE:             { rule: "强制", value: ["柴油"],                             color: "" },
    EMISSIONSTANDARD:     { rule: "强制", value: ["国六", "国六b"],                     color: "" },
    STEERINGMODE:         { rule: "一般", value: ["液压助力", "电动助力"],               color: "#FFA500" },
    TIRENUMBER:           { rule: "一般", value: ["6", "8", "10"],                     color: "#FFA500" },
    ZCCLASSIFY:           { rule: "特殊", value: ["二类"],                             color: "" },
  });

  ctx.ZC_Validate = JSON.stringify({
    ZCCERTIFICATIONNO: { rule: "强制", value: ["ZCE2024060012345", "ZCE2024060012346"], color: "#FF0000" },
    ZCCOLOR: { rule: "强制", value: ["白色", "银色"], color: "#FF0000" },
    TIRENUMBER: { rule: "强制", value: ["6", "8"], color: "" },
    EMISSIONSTANDARD: { rule: "一般", value: ["国六", "国六b"], color: "#FFA500" },
    STEERINGMODE: { rule: "一般", value: ["液压助力"], color: "" },
    TOTALWEIGHT: { rule: "特殊", value: ["18000"], color: "#FFA500" },
  });

  ctx.CL_Validate = JSON.stringify({
    CarConfirmityCertNo: { rule: "强制", value: ["CC2024060012345", "CC2024060012346"], color: "#FF0000" },
    Displacement:        { rule: "强制", value: ["9500", "10500"],                       color: "#FF0000" },
    FuelType:            { rule: "一般", value: ["柴油"],                                color: "" },
    MaxSpeed:            { rule: "一般", value: ["110", "120"],                          color: "#FFA500" },
    NumberOfAxle:        { rule: "一般", value: ["2", "3"],                             color: "" },
  });

  ctx.WX_Validate = JSON.stringify({
    VIN:               { rule: "强制", value: ["LSVA10339C2123456", "LSVA10339C2123457"], color: "#FF0000" },
    GPSType:           { rule: "强制", value: ["北斗", "北斗/GPS双模"],                     color: "#FF0000" },
    SIMType:           { rule: "一般", value: ["中国移动4G", "中国联通4G"],                   color: "#FFA500" },
    CommunicationType: { rule: "一般", value: ["4G LTE", "5G"],                           color: "" },
  });

  ctx.HB_Validate = JSON.stringify({
    EngineModel:   { rule: "强制", value: ["WP10H375E50", "WP10H400E50"], color: "#FF0000" },
    EmissionStage: { rule: "强制", value: ["国六", "国六b"],               color: "" },
    FuelSupply:    { rule: "一般", value: ["高压共轨"],                    color: "#FFA500" },
    DependLevel:   { rule: "一般", value: ["国六", "国六b"],               color: "" },
  });

  ctx.RY_Validate = JSON.stringify({
    HGZ_ZXBZ:       { rule: "强制", value: ["GB/T 29793-2013", "GB/T 19233-2020"], color: "#FF0000" },
    FuelConsumption: { rule: "一般", value: ["22.0", "24.5", "26.0"],               color: "" },
    IdleFuel:        { rule: "一般", value: ["2.5", "2.8", "3.0"],                  color: "#FFA500" },
  });
} else {
  // __DEV__ 结束，进入生产模式

  // ============================================================
  // 生产模式：$Context 由宿主容器注入，此处做防御性检查
  // ============================================================
  if (typeof $Context === "undefined") {
    if (__DEV__) console.error("[index.js] 生产模式下 $Context 未由宿主注入，使用空壳兜底");
    var $Context = { inputs: {}, outputs: {}, submit: function () {} };
  }
  if (!$Context.inputs) {
    $Context.inputs = {};
  }
} // __DEV__ / else

// ============================================================
// Validate 校验规则
//   格式：{ "字段名": { "rule": "强制"|"一般"|"特殊", "value": [...] } }
//   强制=红色边框, 一般=黄色边框, 特殊=不校验
//
//   校验规则通过 $Context.inputs.*_Validate 下发：
//     $Context.inputs.DP_Validate / ZC_Validate / CL_Validate / WX_Validate / HB_Validate / RY_Validate
//   Mock 模式下在 __DEV__ 块内赋值，生产模式由宿主容器注入。
// ============================================================

// ============================================================
// 校验引擎
// ============================================================

/**
 * 安全 JSON 解析，失败时返回 null 并输出错误日志
 */
function safeParse(jsonStr) {
  if (!jsonStr) return null;
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error("[index.js] JSON.parse 失败:", e.message, jsonStr.substring(0, 80));
    return null;
  }
}

/**
 * 对单个合格证执行字段校验
 *
 * @param {string} prefix    - DOM id 前缀，如 '#dp_'、'#zc_'
 * @param {Array}  validateArray - 校验规则数组
 * @param {Object} certDataObj   - 已解析的合格证 JSON 对象
 */
function validateCert(prefix, validateMap, certDataObj) {
  // 防御：若为 JSON 字符串则先解析（服务端注入场景）
  if (typeof validateMap === "string") {
    validateMap = safeParse(validateMap);
  }
  if (!validateMap || typeof validateMap !== "object") return;

  // 使用 Object.keys 替代 $.each，避免 jQuery isArrayLike 内部
  // "length" in obj 对 null/undefined/非预期类型抛出 TypeError
  var fields = Object.keys(validateMap);
  for (var i = 0; i < fields.length; i++) {
    var fieldName = fields[i];
    var item = validateMap[fieldName];
    if (!item || typeof item !== "object") continue;

    // color 为空 → 跳过（服务端已预计算 color）
    if (!item.color) continue;

    var $el = $(prefix + fieldName);
    if (!$el.length) continue; // DOM 元素不存在则跳过

    // 如果是 span，找最近父级 td/th
    // 若父单元格有多个带 id 的 span，边框精确到 span 自身；否则整格高亮
    var $cell = $el;
    if (!$el.is("td") && !$el.is("th")) {
      var $parentCell = $el.closest("td, th");
      if ($parentCell.length && $parentCell.find("span[id]").length > 1) {
        $cell = $el;
      } else {
        $cell = $parentCell;
      }
    }
    if (!$cell.length) continue;

    // 直接用 color 设置边框
    $cell.css("border", "3px solid " + item.color);
    $cell.attr("data-vld-values", JSON.stringify(item.value || []));
    $cell.attr("title", ""); // 清除原生 title 避免冲突
  }
}

/**
 * 获取当前选中的车型 key
 * 牵引车(ISCARGOTRUCK=false) 固定返回 'ZC'
 * 载货车(ISCARGOTRUCK=true)  返回当前选中的 radio 值，默认 'CS'
 */
function getCurrentVehicleType() {
  var ctx = $Context.inputs;
  if (!ctx.ISCARGOTRUCK) {
    return "ZC";
  }
  var $checked = $(".zh_type input[type='radio']:checked");
  return $checked.length ? $checked.val() : "CS";
}

/**
 * 校验环保数据（嵌套结构，需按车型取值）
 */
function validateHB() {
  var ctx = $Context.inputs;
  var data = safeParse(ctx.HB);
  if (!data) return;

  var modeType = ctx.MODETYPE;

  // 根据 MODETYPE 选择 DOM id 前缀
  var prefixMap = {
    国五: "#hb_g5_",
    "国六-燃气": "#hb_g6_rq_",
    国六: "#hb_g6_ry_",
    电动: "#hb_dd_",
  };
  var prefix = prefixMap[modeType];
  if (!prefix) return;

  var vehicleType = getCurrentVehicleType();

  // 嵌套开关检查：支持 { ZC: true, CS: false } 或 boolean false 全局关闭
  var hbSwitch = VALIDATION_SWITCH.HB;
  if (typeof hbSwitch === "object" && !hbSwitch[vehicleType]) return;

  var template = data[vehicleType];
  if (!template) return;

  var hbVld = safeParse($Context.inputs.HB_Validate);
  if (hbVld) validateCert(prefix, hbVld, template);
}

/**
 * 校验燃油数据（嵌套结构，需按车型取值）
 */
function validateRY() {
  var ctx = $Context.inputs;
  var data = safeParse(ctx.RY);
  if (!data) return;

  var vehicleType = getCurrentVehicleType();

  // 嵌套开关检查：支持 { ZC: true, CS: false } 或 boolean false 全局关闭
  var rySwitch = VALIDATION_SWITCH.RY;
  if (typeof rySwitch === "object" && !rySwitch[vehicleType]) return;

  var template = data[vehicleType];
  if (!template) return;

  var ryVld = safeParse($Context.inputs.RY_Validate);
  if (ryVld) validateCert("#ry_", ryVld, template);
}

/**
 * 执行所有合格证校验
 */
function runAllValidations() {
  var ctx = $Context.inputs;
  var modeType = ctx.MODETYPE;

  // DP - 底盘
  if (VALIDATION_SWITCH.DP && ctx.DP) {
    var dpData = safeParse(ctx.DP);
    var dpVld = safeParse(ctx.DP_Validate);
    if (dpData && dpVld) validateCert("#dp_", dpVld, dpData);
  }

  // ZC - 整车
  if (VALIDATION_SWITCH.ZC && ctx.ZC) {
    var zcData = safeParse(ctx.ZC);
    var zcVld = safeParse(ctx.ZC_Validate);
    if (zcData && zcVld) validateCert("#zc_", zcVld, zcData);
  }

  // CL - 一致性（电动用 #cl_dd_ 前缀）
  if (VALIDATION_SWITCH.CL && ctx.CL) {
    var clData = safeParse(ctx.CL);
    var clVld = safeParse(ctx.CL_Validate);
    if (clData && clVld) {
      var clPrefix = modeType === "电动" ? "#cl_dd_" : "#cl_";
      validateCert(clPrefix, clVld, clData);
    }
  }

  // WX - 卫星定位
  if (VALIDATION_SWITCH.WX && ctx.WX) {
    var wxData = safeParse(ctx.WX);
    var wxVld = safeParse(ctx.WX_Validate);
    if (wxData && wxVld) validateCert("#wx_", wxVld, wxData);
  }

  // HB - 环保（嵌套结构，子开关在 validateHB 内部按车型判断）
  if (VALIDATION_SWITCH.HB) validateHB();

  // RY - 燃油（嵌套结构，子开关在 validateRY 内部按车型判断）
  if (VALIDATION_SWITCH.RY) validateRY();
}

/**
 * 创建全局 tooltip div
 */
function initTooltip() {
  window.$vldTooltip = $('<div id="vld-tooltip"></div>').appendTo("body");
}

/**
 * 绑定校验单元格的 hover 事件（事件委托）
 */
function bindTooltipEvents() {
  $(document)
    .on("mouseenter", "[data-vld-values]", function (e) {
      var values = $(this).attr("data-vld-values");
      try {
        var arr = JSON.parse(values);
        window.$vldTooltip
          .text("公告值：" + arr.join("、"))
          .css({ left: e.clientX + 15, top: e.clientY + 15 })
          .show();
      } catch (_) {}
    })
    .on("mousemove", "[data-vld-values]", function (e) {
      window.$vldTooltip.css({ left: e.clientX + 15, top: e.clientY + 15 });
    })
    .on("mouseleave", "[data-vld-values]", function () {
      window.$vldTooltip.hide();
    });
}

// ============================================================
// 启动：延迟执行，确保 index.html 内联脚本已填充 DOM
// ============================================================
/**
 * 等待 DOM 填充完成后执行校验
 * 轮询检测 span_WIPORDERNO 是否已被 index.html 内联脚本填充，
 * 避免 setTimeout 固定延迟在慢网络下的竞态条件。
 */
function waitForDOMReady(callback, maxRetries) {
  maxRetries = maxRetries || 20;
  var retries = 0;
  function check() {
    var $el = $("#span_WIPORDERNO");
    if ($el.length && $el.text().trim()) {
      callback();
    } else if (retries < maxRetries) {
      retries++;
      setTimeout(check, 50);
    } else {
      // 超时兜底：强制执行（即使 DOM 可能未完全就绪）
      if (__DEV__) console.warn("[index.js] DOM 填充等待超时，强制执行校验");
      callback();
    }
  }
  check();
}

$(document).ready(function () {
  waitForDOMReady(function () {
    initTooltip();
    runAllValidations();
    bindTooltipEvents();
    if (__DEV__) console.log("[index.js] 校验引擎已执行。");
  });
});
