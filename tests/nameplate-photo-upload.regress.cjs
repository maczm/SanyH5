// ============== mom-nameplate-photo-upload 回归测试 ==============
// 用法：cd /home/wangzm/projects/SanyH5 && NODE_PATH=$(npm root -g) node tests/nameplate-photo-upload.regress.cjs
// 前置：nginx 8080 运行中（http://localhost:8080/SanyH5/<页面目录>/）
// 覆盖：加载/查询/模板多态/上传/删除/预览/保存/提交AI检测/折叠/清空/空态
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:8080/SanyH5/mom-nameplate-photo-upload/index.html";
const DATA_URI = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
// 1x1 白色 JPEG（真实文件上传链路用）
const JPEG_1PX = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message.slice(0, 100)));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("favicon")) errors.push("CONSOLE: " + m.text().slice(0, 80));
  });
  const step = (n, ok, extra) => console.log(`${ok ? "✅" : "❌"} ${n}${extra ? " | " + extra : ""}`);
  let failed = false;
  const check = (n, ok, extra) => {
    step(n, ok, extra);
    if (!ok) failed = true;
  };

  // ============ 1. 加载 ============
  await page.goto(BASE, { timeout: 15000 });
  await page.waitForTimeout(800);
  check("页面加载", (await page.title()) === "照片上传");
  check("header 操作员", (await page.locator(".header-operator").textContent()) === "开发用户");
  check("弹窗骨架预埋", (await page.locator(".template-toast").count()) === 1 && (await page.locator(".template-confirm").count()) === 1);

  // ============ 2. 工位下拉（克隆 + 筛选 + 选中） ============
  await page.click(".input-station");
  await page.waitForTimeout(300);
  check("下拉全量 7 项", (await page.locator(".combobox-item").count()) === 7);
  await page.fill(".input-station", "S002");
  await page.waitForTimeout(300);
  check("筛选 S002 → 1 项", (await page.locator(".combobox-item").count()) === 1);
  await page.click(".combobox-item");
  await page.waitForTimeout(200);
  check("工位选中", (await page.locator(".input-station-code").inputValue()) === "S002");

  // ============ 3. 查询（S002：单模板自动选中） ============
  await page.fill(".input-order", "WO-2024-06001");
  await page.click(".btn-query");
  await page.waitForTimeout(800);
  check("卡片克隆", (await page.locator(".photo-type-card").count()) === 4);
  check("表单卡片头显示", await page.locator(".btn-toggle-form").isVisible());
  check("订单信息区", await page.locator(".order-info-area").isVisible(), (await page.locator(".machine-code-value").textContent()));
  check("按钮初始禁用", (await page.locator(".btn-confirm").isDisabled()) && (await page.locator(".btn-save").isDisabled()));

  // ============ 4. 真实文件上传链路 ============
  await page.click(".photo-add");
  await page.setInputFiles(".photo-input", { name: "test.jpg", mimeType: "image/jpeg", buffer: JPEG_1PX });
  await page.waitForTimeout(1200);
  check("上传缩略图", (await page.locator(".photo-item").count()) === 1);

  // ============ 5. 删除 ============
  await page.click(".photo-delete");
  await page.waitForTimeout(300);
  check("删除缩略图", (await page.locator(".photo-item").count()) === 0);

  // ============ 6. 预览（骨架弹窗） ============
  await page.evaluate((d) => {
    NameplatePhotoUpload.state.photos["measure_length"] = [{ url: d }];
    NameplatePhotoUpload.renderPhotoTypeCards();
  }, DATA_URI);
  await page.waitForTimeout(300);
  await page.click(".photo-item img");
  await page.waitForTimeout(300);
  check("预览打开", await page.locator(".template-preview").isVisible());
  await page.click(".template-preview .photo-preview-close");
  await page.waitForTimeout(200);
  check("预览关闭", !(await page.locator(".template-preview").isVisible()));

  // ============ 7. 模板多态（S001 多模板） ============
  await page.evaluate(() => { NameplatePhotoUpload.selectStation("S001", "1号工位-外观检测"); });
  await page.fill(".input-order", "WO-2024-06001");
  await page.click(".btn-query");
  await page.waitForTimeout(800);
  check("多模板未选态", await page.locator(".block-template-none").isVisible());
  await page.evaluate(() => { document.querySelector(".block-template-none .pick-template-btn").click(); });
  await page.waitForTimeout(400);
  check("模板弹窗克隆", (await page.locator(".picker-list .picker-item").count()) === 3);
  await page.locator(".picker-list .picker-item").first().click();
  await page.waitForTimeout(400);
  check("已选态切换", await page.locator(".block-template-selected").isVisible(), (await page.locator(".template-selected-name-value").textContent()));

  // ============ 8. 保存（无确认，saveType=save，重置） ============
  await page.evaluate((d) => {
    NameplatePhotoUpload.state.photos["appearance_front"] = [{ url: d }, { url: d }];
    NameplatePhotoUpload.state.photos["appearance_back"] = [{ url: d }, { url: d }];
    NameplatePhotoUpload.state.photos["appearance_side"] = [{ url: d }];
    NameplatePhotoUpload.renderPhotoTypeCards();
    window.submitPhotoRecord = function (data, callback) { setTimeout(() => callback({ code: 0, msg: "ok" }), 200); };
    window.__captured = [];
    window.submitPhotoRecord = function (data, callback) { window.__captured.push(data); setTimeout(() => callback({ code: 0, msg: "ok" }), 200); };
  }, DATA_URI);
  await page.waitForTimeout(300);
  check("照片齐全后按钮可用", !(await page.locator(".btn-save").isDisabled()) && !(await page.locator(".btn-confirm").isDisabled()));
  await page.click(".btn-save");
  await page.waitForTimeout(400);
  check("保存无确认弹窗", (await page.locator(".template-confirm").isVisible()) === false);
  await page.waitForTimeout(800);
  check("保存 toast", (await page.locator(".toast-title").textContent()) === "保存成功");
  check("保存 saveType", (await page.evaluate(() => window.__captured[0])).saveType === "save");
  await page.click(".template-toast .toast-btn");
  await page.waitForTimeout(600);
  check("保存后重置", !(await page.locator(".confirm-section").isVisible()));

  // ============ 9. 提交AI检测（二次确认，saveType=submit） ============
  await page.evaluate(() => { NameplatePhotoUpload.selectStation("S001", "1号工位-外观检测"); });
  await page.fill(".input-order", "WO-2024-06001");
  await page.click(".btn-query");
  await page.waitForTimeout(800);
  await page.evaluate((d) => {
    NameplatePhotoUpload.state.photos["appearance_front"] = [{ url: d }, { url: d }];
    NameplatePhotoUpload.state.photos["appearance_back"] = [{ url: d }, { url: d }];
    NameplatePhotoUpload.state.photos["appearance_side"] = [{ url: d }];
    NameplatePhotoUpload.state.selectedTemplateId = "TPL001";
    NameplatePhotoUpload.state.selectedTemplateName = "普通铭牌";
    NameplatePhotoUpload.state.selectedTemplateUrl = d;
    NameplatePhotoUpload.renderOrderInfo();
    NameplatePhotoUpload.renderPhotoTypeCards();
  }, DATA_URI);
  await page.waitForTimeout(300);
  await page.click(".btn-confirm");
  await page.waitForTimeout(300);
  check("确认弹窗文案", (await page.locator(".confirm-content").textContent()) === "车辆所有工位铭牌是否全部上传");
  await page.click(".template-confirm .confirm-btn-ok");
  await page.waitForTimeout(800);
  check("提交成功 toast", (await page.locator(".toast-title").textContent()) === "提交成功");
  check("提交 saveType", (await page.evaluate(() => window.__captured[1])).saveType === "submit");
  // 关闭成功 toast（触发重置），避免遮挡后续操作
  await page.click(".template-toast .toast-btn");
  await page.waitForTimeout(600);

  // ============ 10. 表单折叠（卡片头交互） ============
  await page.evaluate(() => { NameplatePhotoUpload.selectStation("S001", "1号工位-外观检测"); });
  await page.fill(".input-order", "WO-2024-06001");
  await page.click(".btn-query");
  await page.waitForTimeout(800);
  await page.click(".btn-toggle-form");
  await page.waitForTimeout(300);
  check("表单折叠", !(await page.locator(".form-card-body").isVisible()));
  await page.click(".btn-toggle-form");
  await page.waitForTimeout(300);
  check("表单展开", await page.locator(".form-card-body").isVisible());

  // ============ 11. 空态 + 清空 ============
  await page.evaluate(() => { NameplatePhotoUpload.state.photoTypes = []; NameplatePhotoUpload.renderPhotoTypeCards(); });
  await page.waitForTimeout(200);
  check("空态提示", await page.locator(".empty-no-photo").isVisible());
  check("空态确认区隐藏", !(await page.locator(".confirm-section").isVisible()));
  await page.click(".btn-toggle-form .form-clear-btn");
  await page.waitForTimeout(400);
  check("清空复位", (await page.evaluate(() => NameplatePhotoUpload.state.stationCode)) === "" && (await page.locator(".btn-clear-before").count()) === 0);

  // ============ 汇总 ============
  console.log("----");
  console.log("JS错误数:", errors.length);
  errors.slice(0, 5).forEach((e) => console.log("  ", e));
  await browser.close();
  console.log(failed || errors.length > 0 ? "REGRESSION FAIL" : "REGRESSION OK");
  process.exit(failed || errors.length > 0 ? 1 : 0);
})().catch((e) => { console.error("FAIL:", e.message.split("\n")[0]); process.exit(1); });
