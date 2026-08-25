// ============== 演示数据（仅本地开发用） ==============
// 生产环境不部署本文件：Portal 部署只取 index.html / index.js / index.css。
// 生产环境由父页面（Portal）向 window.checkResultData 注入真实检查结果；
// 本地开发由本文件提供演示数据，删除本文件后页面将展示空态。
window.checkResultData = {
  code: 200,
  mes: "操作成功",
  data: {
    acceptNo: "AR20260811001",
    completedAt: "2026-08-14 10:45:32",
    status: "COMPLETED",
    overallConclusion: "FAIL",
    checkResults: [
      {
        checkCode: "CHECK_QR",
        checkName: "二维码可读性",
        conclusion: "PASS",
        reason: "",
        fieldDetails: [
          { fieldNameCn: "二维码内容", fieldNameEn: "QRContent", conclusion: "PASS", recognizedValue: "DFH5180XXY|LSVAU2A00N2100001|2024-06-08", correctValue: "DFH5180XXY|LSVAU2A00N2100001|2024-06-08" },
        ],
      },
      {
        checkCode: "CHECK_OCR",
        checkName: "铭牌字符识别比对",
        conclusion: "FAIL",
        reason: "以下字段识别值与公告值不一致：发动机号、车辆颜色",
        fieldDetails: [
          { fieldNameCn: "制造厂名称", fieldNameEn: "Manufacturer", conclusion: "PASS", recognizedValue: "东风商用车有限公司", correctValue: "东风商用车有限公司" },
          { fieldNameCn: "发动机号", fieldNameEn: "EngineNo", conclusion: "FAIL", recognizedValue: "WP10H202406001", correctValue: "WP10H2024060A1" },
          { fieldNameCn: "车辆颜色", fieldNameEn: "VehicleColor", conclusion: "FAIL", recognizedValue: "红色", correctValue: "白色" },
        ],
      },
      {
        checkCode: "CHECK_INFO",
        checkName: "铭牌信息完整性检查",
        conclusion: "SKIPPED",
        reason: "该检查项不适用于当前车辆类型，已跳过",
        fieldDetails: [],
      },
    ],
  },
};
