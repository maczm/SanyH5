// ============== mom-packing 回归测试 ==============
// 用法：cd /home/wangzm/projects/SanyH5 && NODE_PATH=$(npm root -g) node tests/packing.regress.cjs
// 前置：nginx 8080 运行中
// 覆盖：加载/单号搜索/物料搜索/选中面板/上传/数量校验/提交重置/步骤回退
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:8080/SanyH5/mom-packing/index.html";
const JPEG_1PX = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message.slice(0, 100)));
  page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("favicon")) errors.push("CONSOLE: " + m.text().slice(0, 80)); });
  const step = (n, ok, extra) => console.log(`${ok ? "✅" : "❌"} ${n}${extra ? " | " + extra : ""}`);
  let failed = false;
  const check = (n, ok, extra) => {
    step(n, ok, extra);
    if (!ok) failed = true;
  };

  // ============ 1. 加载 + 初始全量数据 ============
  await page.goto(BASE, { timeout: 15000 });
  await page.waitForTimeout(1500);
  check("页面加载", (await page.title()) === "装箱作业");
  check("header 操作员", (await page.locator("#header-operator").textContent()) === "开发用户");
  check("初始全量数据", (await page.locator("body").innerText()).includes("PC202405001"), "结果卡=" + (await page.locator(".result-card").count()));
  check("步骤1输入行", (await page.locator(".step-row.active .search-input").count()) === 1);
  check("步骤2锁定", (await page.locator(".step-row.locked").count()) === 1);

  // ============ 2. 装箱单号搜索（步骤 1 → 2） ============
  await page.fill(".step-row.active .search-input", "PL202405001");
  await page.click(".btn-search");
  await page.waitForTimeout(900);
  check("单号搜索结果", (await page.locator(".result-card").count()) === 2, "卡片=" + (await page.locator(".result-card").count()));
  check("步骤1完成态", (await page.locator(".step-row.completed").count()) === 1, "值=" + (await page.locator(".step-row.completed .step-value").textContent()));
  check("步骤2输入行", (await page.locator(".step-row.active .search-input").count()) === 1);

  // ============ 3. 物料编码搜索（步骤 2 → 3） ============
  await page.fill(".step-row.active .search-input", "MC-A001");
  await page.click(".btn-search");
  await page.waitForTimeout(900);
  check("物料搜索结果", (await page.locator(".result-card").count()) === 1, "卡片=" + (await page.locator(".result-card").count()));

  // ============ 4. 选中装箱对象 → 面板 ============
  await page.click(".result-card");
  await page.waitForTimeout(500);
  check("装箱面板显示", await page.locator("#packing-panel").isVisible());
  check("面板信息行", (await page.locator("#packing-card .field-row").count()) === 8, "行数=" + (await page.locator("#packing-card .field-row").count()));
  check("数量默认值", (await page.locator("#packing-qty").inputValue()) === "35", "qty=" + (await page.locator("#packing-qty").inputValue()));
  check("数量提示", (await page.locator("#qty-hint").textContent()) === "待装箱数: 35");
  check("确认按钮显示", await page.locator("#confirm-section").isVisible());

  // ============ 5. 数量校验（超限报错） ============
  await page.fill("#packing-qty", "999");
  await page.waitForTimeout(200);
  check("超限报错", await page.locator("#qty-error").isVisible(), (await page.locator("#qty-error").textContent()));
  await page.fill("#packing-qty", "10");
  await page.waitForTimeout(200);
  check("合法后错误消失", !(await page.locator("#qty-error").isVisible()));

  // ============ 6. 真实文件上传 ============
  await page.click("#photo-add-button");
  await page.setInputFiles("#photo-input", { name: "p.jpg", mimeType: "image/jpeg", buffer: JPEG_1PX });
  await page.waitForTimeout(1200);
  check("上传缩略图", (await page.locator(".photo-item").count()) === 1, "缩略图=" + (await page.locator(".photo-item").count()));
  check("照片进度", (await page.locator("#photo-progress-text").textContent()).indexOf("1/") === 0, (await page.locator("#photo-progress-text").textContent()));

  // ============ 7. 提交（确定性 mock）→ 成功 → 重置 ============
  await page.evaluate(() => {
    window.submitPacking = function (data, callback) { setTimeout(() => callback({ code: 0, msg: "装箱成功" }), 200); };
  });
  await page.click(".btn-confirm");
  await page.waitForTimeout(1000);
  check("提交成功 toast", (await page.locator("#toast-title").textContent()) === "装箱成功");
  check("toast 详情行", (await page.locator("#toast-content .detail-row").count()) >= 6, "行数=" + (await page.locator("#toast-content .detail-row").count()));
  await page.click("#template-toast .toast-btn");
  await page.waitForTimeout(800);
  check("重置回物料搜索", (await page.locator(".step-row.active .search-input").count()) === 1 && (await page.locator("#packing-panel").isVisible()) === false);

  // ============ 8. 步骤回退（点已完成行） ============
  await page.click(".step-row.completed");
  await page.waitForTimeout(300);
  check("回退到单号搜索", (await page.locator(".step-row.active .search-input").count()) === 1);

  // ============ 汇总 ============
  console.log("----");
  console.log("JS错误数:", errors.length);
  errors.slice(0, 5).forEach((e) => console.log("  ", e));
  await browser.close();
  console.log(failed || errors.length > 0 ? "REGRESSION FAIL" : "REGRESSION OK");
  process.exit(failed || errors.length > 0 ? 1 : 0);
})().catch((e) => { console.error("FAIL:", e.message.split("\n")[0]); process.exit(1); });
