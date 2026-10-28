// ============== 演示数据（仅本地开发用） ==============
// 生产环境不部署本文件：Portal 部署只取 index.html / index.js / index.css。
// 生产环境由父页面（Portal）注入 window.AccpetNo / checkResultData / Image*List；
// 本地开发由本文件提供演示数据，删除本文件后页面将展示空态。
// 数据为生产环境真实样例（含 MATCH/MISMATCH 字段结论与 unit 单位）。
//
// 本地演示状态（通过 URL 参数切换，如 index.html?mock=not-started）：
//   默认 / ?mock=completed  已完成：4 张关联检查项 + 2 张未匹配（末尾「其他图片」）
//   ?mock=not-started       未发起：AccpetNo 为空，6 张图片都在「图片」区
//   ?mock=processing        检查中：6 张图片都在「图片」区

var mockState = "completed";
var mockQuery = location.search || "";
var mockParamIndex = mockQuery.indexOf("mock=");
if (mockParamIndex !== -1) {
  mockState = mockQuery.slice(mockParamIndex + 5).split("&")[0] || "completed";
}

var mockAcceptNo = "ACP202608240959563903";
var mockImageUrl = "../18601605145677184.jpg";

// 图片三数组等长、按索引一一对应；前 4 张匹配普通检查项，CHECK_999 未匹配，
// 最后 1 张挂到无字段的 CHECK_001（用于验证模板检查项的行内图片排版）
window.ImageUrlList = [mockImageUrl, mockImageUrl, mockImageUrl, mockImageUrl, mockImageUrl, mockImageUrl];
window.ImageNameList = ["铭牌整体", "VIN 钢印", "VIN 钢印", "发动机铭牌", "未匹配检查项", "模板图"];
window.ImageCheckList = ["CHECK_002", "CHECK_003", "CHECK_003", "CHECK_006", "CHECK_999", "CHECK_001"];

var mockCompletedResult = {
  code: 200,
  mes: "操作成功",
  data: {
    acceptNo: "ACP202608240959563903",
    overallConclusion: "FAIL",
    status: "COMPLETED",
    checkResults: [
      {
        checkCode: "CHECK_001",
        checkName: "铭牌模板正确性",
        conclusion: "PASS",
        reason: "实拍铭牌与模板的字段结构和版式一致，匹配度100%。",
        fieldDetails: [],
      },
      {
        checkCode: "CHECK_002",
        checkName: "VIN一致性",
        conclusion: "PASS",
        reason: "车架VIN钢印、整车铭牌VIN码与MOM系统标准VIN码三者完全一致。",
        fieldDetails: [
          {
            unit: "",
            reason: "钢印VIN、铭牌VIN与标准值一致。",
            conclusion: "MATCH",
            fieldNameCn: "vin",
            fieldNameEn: "",
            correctValue: "LFCDH96P0T1089569",
            recognizedValue: "LFCDH96P0T1089569",
          },
        ],
      },
      {
        checkCode: "CHECK_003",
        checkName: "整车铭牌 vs MOM",
        conclusion: "FAIL",
        reason: "铭牌-发动机型号、铭牌-发动机最大净功率不一致。",
        fieldDetails: [
          {
            unit: "",
            reason: "VIN码一致",
            conclusion: "MATCH",
            fieldNameCn: "vin",
            fieldNameEn: "",
            correctValue: "LFCDH96P0T1089569",
            recognizedValue: "LFCDH96P0T1089569",
          },
          {
            unit: "",
            reason: "产品型号一致",
            conclusion: "MATCH",
            fieldNameCn: "产品型号",
            fieldNameEn: "announcetype",
            correctValue: "SYM1253T1E",
            recognizedValue: "SYM1253T1E",
          },
          {
            unit: "",
            reason: "发动机型号不一致，MOM为380E3，图片为360E3",
            conclusion: "MISMATCH",
            fieldNameCn: "铭牌-发动机型号",
            fieldNameEn: "enginetype",
            correctValue: "D09C5-380E3",
            recognizedValue: "D09C5-360E3",
          },
          {
            unit: "kW",
            reason: "发动机最大净功率不一致，MOM为274，图片为259",
            conclusion: "MISMATCH",
            fieldNameCn: "铭牌-发动机最大净功率",
            fieldNameEn: "netpowerspeed",
            correctValue: "274",
            recognizedValue: "259",
          },
          {
            unit: "r/min",
            reason: "转速一致",
            conclusion: "MATCH",
            fieldNameCn: "铭牌-发动机转速",
            fieldNameEn: "engineratedpower",
            correctValue: "1900",
            recognizedValue: "1900",
          },
          {
            unit: "kg",
            reason: "底盘整备质量一致",
            conclusion: "MATCH",
            fieldNameCn: "铭牌-底盘整备质量",
            fieldNameEn: "curbweight",
            correctValue: "9250",
            recognizedValue: "9250",
          },
          {
            unit: "kg",
            reason: "最大允许总质量数值一致",
            conclusion: "MATCH",
            fieldNameCn: "最大允许牵引质量",
            fieldNameEn: "tractivetonnage",
            correctValue: "37600",
            recognizedValue: "37600",
          },
          {
            unit: "ms",
            reason: "制动响应时间一致",
            conclusion: "MATCH",
            fieldNameCn: "制动响应时间",
            fieldNameEn: "maxdesignstaticload",
            correctValue: "530",
            recognizedValue: "530",
          },
          {
            unit: "kPa",
            reason: "储气筒额定工作压力一致",
            conclusion: "MATCH",
            fieldNameCn: "储气筒额定工作压力",
            fieldNameEn: "storagekpa",
            correctValue: "1000",
            recognizedValue: "1000",
          },
        ],
      },
      {
        checkCode: "CHECK_006",
        checkName: "电机铭牌一致性",
        conclusion: "FAIL",
        reason: "电机型号不一致。",
        fieldDetails: [
          {
            unit: "",
            reason: "电机铭牌型号与整车铭牌发动机型号数值不一致",
            conclusion: "MISMATCH",
            fieldNameCn: "电机型号",
            fieldNameEn: "Motor/Engine Model",
            correctValue: "D09C5-360E3",
            recognizedValue: "D09C5-380E3",
          },
        ],
      },
    ],
    completedAt: "2026-08-24 10:01:25",
  },
};

if (mockState === "not-started") {
  window.AccpetNo = "";
} else if (mockState === "processing") {
  window.AccpetNo = mockAcceptNo;
  window.checkResultData = {
    code: 200,
    mes: "操作成功",
    data: {
      acceptNo: mockAcceptNo,
      overallConclusion: "",
      status: "PROCESSING",
      completedAt: "",
      checkResults: [],
    },
  };
} else {
  window.AccpetNo = mockAcceptNo;
  window.checkResultData = mockCompletedResult;
}
