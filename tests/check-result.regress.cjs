// ============== mom-nameplate-check-result 回归测试 ==============
// 用法：cd /home/wangzm/projects/SanyH5 && NODE_PATH=$(npm root -g) node tests/check-result.regress.cjs
// 覆盖：Mock 渲染/未知枚举显示原文/轮询自动刷新/未知任务状态
const { chromium } = require("playwright");
const BASE = "http://127.0.0.1:8080/SanyH5/mom-nameplate-check-result/index.html";
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message.slice(0, 100)));
  page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("favicon")) errors.push(m.text().slice(0, 80)); });
  const step = (n, ok, extra) => console.log(`${ok ? "✅" : "❌"} ${n}${extra ? " | " + extra : ""}`);
  let failed = false;
  const check = (n, ok, extra) => { step(n, ok, extra); if (!ok) failed = true; };

  await page.goto(BASE, { timeout: 15000 });
  await page.waitForTimeout(1000);
  check("页面加载", (await page.title()) === "铭牌检查结果");
  check("结论横幅", (await page.locator(".status-banner .sb-title").textContent()) === "不通过");
  check("统计 chips", (await page.locator(".sum-chip").count()) >= 3);
  check("检查项卡片", (await page.locator(".check-card").count()) === 3);
  check("不一致高亮", (await page.locator(".field-row.mismatch").count()) === 2);

  await page.evaluate(() => {
    window.checkResultData = { code: 200, mes: "", data: {
      acceptNo: "AR1", completedAt: "2026-08-14 10:00:00", status: "COMPLETED", overallConclusion: "PASS",
      checkResults: [{ checkCode: "C1", checkName: "新检查项", conclusion: "WARN", reason: "", fieldDetails: [{ fieldNameCn: "字段A", conclusion: "MAYBE", recognizedValue: "1", correctValue: "2" }] }],
    } };
    NameplateCheckResult.renderResult();
  });
  await page.waitForTimeout(300);
  check("未知结论显示未知", (await page.locator(".ck-badge").first().textContent()) === "未知");
  check("未知字段显示未知", (await page.locator(".f-badge").first().textContent()) === "未知");

  await page.evaluate(() => {
    window.checkResultData = { code: 200, mes: "", data: { acceptNo: "AR2", status: "PROCESSING", checkResults: [] } };
    NameplateCheckResult.renderResult();
  });
  await page.waitForTimeout(300);
  check("处理中横幅", (await page.locator(".sb-title").textContent()) === "检查处理中");
  check("轮询已启动", await page.evaluate(() => NameplateCheckResult._pollTimer !== null));

  await page.evaluate(() => {
    window.checkResultData = { code: 200, mes: "", data: { acceptNo: "AR2", status: "COMPLETED", overallConclusion: "PASS", checkResults: [] } };
  });
  await page.waitForTimeout(11000);
  check("轮询自动刷新", (await page.locator(".sb-title").textContent()) === "通过");
  check("轮询已停止", await page.evaluate(() => NameplateCheckResult._pollTimer === null));

  await page.evaluate(() => {
    window.checkResultData = { code: 200, mes: "", data: { acceptNo: "AR3", status: "CANCELLED", checkResults: [] } };
    NameplateCheckResult.renderResult();
  });
  await page.waitForTimeout(300);
  check("未知状态显示原文", (await page.locator("body").innerText()).indexOf("CANCELLED") !== -1);

  console.log("----");
  console.log("JS错误数:", errors.length);
  await browser.close();
  console.log(failed || errors.length > 0 ? "REGRESSION FAIL" : "REGRESSION OK");
  process.exit(failed || errors.length > 0 ? 1 : 0);
})().catch((e) => { console.error("FAIL:", e.message.split("\n")[0]); process.exit(1); });
