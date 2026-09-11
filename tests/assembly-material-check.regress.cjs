// ============== mom-assembly-material-check 回归测试 ==============
// 用法：cd /home/wangzm/projects/SanyH5 && NODE_PATH=$(npm root -g) node tests/assembly-material-check.regress.cjs
// 前置：nginx 8080 运行中（http://localhost:8080/SanyH5/<页面目录>/）
// 覆盖：加载/工位渲染与筛选/方向键选择/双视图切换/订单查询/物料BOM校验(pass-fail)/连续扫码/失焦触发/检查完成重置/返回
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:8080/SanyH5/mom-assembly-material-check/index.html";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
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
  // 二维码输入框默认只读（防键盘）：先模拟手动点击解锁，再输入
  const fillMaterialQr = async (value) => {
    await page.click(".input-material-qr");
    await page.fill(".input-material-qr", value);
  };

  // ============ 1. 加载 ============
  await page.goto(BASE, { timeout: 15000 });
  await page.waitForTimeout(1000);
  check("页面加载", (await page.title()) === "装配物料检查");
  check("默认工位视图", (await page.locator(".station-select-view").isVisible()) && !(await page.locator(".material-check-view").isVisible()));
  check("工位列表渲染 5 项", (await page.locator(".station-item").count()) === 5);
  check("默认聚焦筛选框", (await page.evaluate(() => document.activeElement.classList.contains("input-station-filter"))));
  {
    const firstItem = page.locator(".station-item").first();
    const descBefore = await firstItem.locator(".station-desc").evaluate((el) => getComputedStyle(el, "::before").content);
    check("卡片文案格式(编码（名称）)", (await firstItem.locator(".station-code").textContent()) === "ZA01" && (await firstItem.locator(".station-desc").textContent()) === "总装一线-01" && descBefore.indexOf("（") !== -1);
  }
  check("二维码输入框默认只读", await page.evaluate(() => document.querySelector(".input-material-qr").readOnly));

  // ============ 2. 实时筛选 ============
  await page.fill(".input-station-filter", "ZB");
  await page.waitForTimeout(300);
  check("筛选 ZB → 2 项", (await page.locator(".station-item").count()) === 2);
  await page.fill(".input-station-filter", "不存在");
  await page.waitForTimeout(300);
  check("无匹配空态", (await page.locator(".station-item").count()) === 0 && (await page.locator(".empty-station-list").isVisible()));
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  check("无匹配回车不跳转", !(await page.locator(".material-check-view").isVisible()));
  await page.fill(".input-station-filter", "ZA");
  await page.waitForTimeout(300);
  check("清筛选后恢复 2 项", (await page.locator(".station-item").count()) === 2);

  // ============ 3. 方向键选择 + 回车只筛选不跳转 ============
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(200);
  check("方向键选中第一项", (await page.locator(".station-item.selected").count()) === 1 && (await page.locator(".station-item.selected").textContent()).indexOf("ZA01") !== -1);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(200);
  check("方向键选中第二项", (await page.locator(".station-item.selected").textContent()).indexOf("ZA02") !== -1);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  check("回车不跳转", !(await page.locator(".material-check-view").isVisible()) && (await page.locator(".station-select-view").isVisible()));
  check("回车只筛选", (await page.locator(".station-item").count()) === 2 && (await page.locator(".input-station-filter").inputValue()) === "ZA");

  // ============ 4. 点击工位跳转进入检查页 ============
  await page.click(".station-item >> nth=1");
  await page.waitForTimeout(400);
  check("点击跳转物料检查页", await page.locator(".material-check-view").isVisible());
  check("工位 tag", (await page.locator(".work-station-tag").textContent()) === "ZA02（总装一线-02）");
  check("跳转后聚焦订单输入", (await page.evaluate(() => document.activeElement.classList.contains("input-order-key"))));

  // ============ 5. 返回工位页（列表/筛选保留） ============
  await page.click(".btn-back-station");
  await page.waitForTimeout(300);
  check("返回工位视图", (await page.locator(".station-select-view").isVisible()) && !(await page.locator(".material-check-view").isVisible()));
  check("筛选与列表保留", (await page.locator(".input-station-filter").inputValue()) === "ZA" && (await page.locator(".station-item").count()) === 2);

  // ============ 6. 重新点击第一项进入（工位 tag 更新） ============
  await page.click(".station-item >> nth=0");
  await page.waitForTimeout(300);
  check("点击跳转工位 tag", (await page.locator(".work-station-tag").textContent()) === "ZA01（总装一线-01）");

  // ============ 7. 订单查询（回车触发，请求带当前工位） ============
  await page.evaluate(() => {
    window.__orderRequests = [];
    window.__materialRequests = [];
    const originalOrderApi = window.assemblyMaterialCheck_getWipOrderNoInfo;
    window.assemblyMaterialCheck_getWipOrderNoInfo = function (params, callback) {
      window.__orderRequests.push(params);
      originalOrderApi(params, callback);
    };
    const originalMaterialApi = window.assemblyMaterialCheck_getMaterialInfo;
    window.assemblyMaterialCheck_getMaterialInfo = function (params, callback) {
      window.__materialRequests.push(params);
      originalMaterialApi(params, callback);
    };
  });
  await page.fill(".input-order-key", "WO20260824001");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(900);
  check("订单输入回车触发搜索", (await page.evaluate(() => window.__orderRequests.length)) === 1);
  check("计划上线时间", (await page.locator(".plan-start-time-tag").textContent()) === "2026-08-24 08:30:00");
  check("月顺序号", (await page.locator(".month-sequence-tag").textContent()) === "202608-0012");
  check("主机编码", (await page.locator(".host-code-tag").textContent()) === "HC2608-1207");
  check("主机简称", (await page.locator(".host-alias-tag").textContent()) === "自卸130");
  check("查询后聚焦二维码输入", (await page.evaluate(() => document.activeElement.classList.contains("input-material-qr"))));
  check("程序化聚焦仍只读", await page.evaluate(() => document.querySelector(".input-material-qr").readOnly));
  check("结果区空态", await page.locator(".empty-check-result").isVisible());
  const orderRequest0 = await page.evaluate(() => window.__orderRequests[0]);
  check("查询请求带工位", orderRequest0 && orderRequest0.serachKey === "WO20260824001" && orderRequest0.workStation === "ZA01");

  // ============ 8. BOM 内物料：pass + 保存 + 清空重聚焦 ============
  check("程序化聚焦不解除只读", await page.evaluate(() => document.querySelector(".input-material-qr").readOnly));
  await page.click(".input-material-qr");
  check("手动点击解锁键盘", (await page.evaluate(() => document.querySelector(".input-material-qr").readOnly)) === false);
  await page.fill(".input-material-qr", "MAT-BOLT-001|供应商A|SN001:2");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1200);
  check("新增绿色行", (await page.locator(".check-result-row.pass").count()) === 1 && (await page.locator(".check-result-row").count()) === 1);
  check("成功徽标", (await page.locator(".check-result-row.pass .cr-result-badge").textContent()) === "成功");
  check("徽标与结果同排且有间距", await page.evaluate(() => {
    const badge = document.querySelector(".check-result-row .cr-result-badge");
    const code = document.querySelector(".check-result-row .cr-material-code");
    const badgeRect = badge.getBoundingClientRect();
    const codeRect = code.getBoundingClientRect();
    const sameRow = Math.abs((badgeRect.top + badgeRect.height / 2) - (codeRect.top + codeRect.height / 2)) < 4;
    return sameRow && (codeRect.left - badgeRect.right) >= 6;
  }));
  check("物料输入回车触发搜索", (await page.evaluate(() => window.__materialRequests.length)) === 1 && (await page.evaluate(() => window.__materialRequests[0].material)) === "MAT-BOLT-001");
  check("行文案格式", (await page.locator(".check-result-row").textContent()).replace(/\s+/g, "").indexOf("MAT-BOLT-001-六角螺栓M12x40-") !== -1);
  const saved1 = await page.evaluate(() => window.__assemblyMockSaved[0]);
  check("保存入参(1)", saved1 && saved1.wipOrderNo === "WO20260824001" && saved1.vin === "LSVU2A0N260800001" && saved1.workStation === "ZA01");
  check("保存入参(2)", saved1 && saved1.qrCode === "MAT-BOLT-001|供应商A|SN001:2" && saved1.material === "MAT-BOLT-001" && saved1.checkResult === "pass");
  check("扫码后清空并聚焦", (await page.locator(".input-material-qr").inputValue()) === "" && (await page.evaluate(() => document.activeElement.classList.contains("input-material-qr"))));
  check("保存后恢复只读", await page.evaluate(() => document.querySelector(".input-material-qr").readOnly));

  // ============ 9. 非 BOM 物料：toast 提示 + fail 行 + 保存 fail ============
  await fillMaterialQr("MAT-X-999|供应商B|SN002:1");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1200);
  check("新增红色行", (await page.locator(".check-result-row.fail").count()) === 1 && (await page.locator(".check-result-row").count()) === 2);
  check("失败徽标", (await page.locator(".check-result-row.fail .cr-result-badge").textContent()) === "失败");
  check("列表时间倒序(最新在前)", (await page.locator(".check-result-row").nth(0).textContent()).indexOf("MAT-X-999") !== -1 && (await page.locator(".check-result-row").nth(0).evaluate((el) => el.classList.contains("fail"))) && (await page.locator(".check-result-row").nth(1).textContent()).indexOf("MAT-BOLT-001") !== -1);
  check("不存在提示", (await page.locator(".template-toast:not(.hidden) .toast-content").textContent()) === "WO20260824001-MAT-X-999 不存在");
  const saved2 = await page.evaluate(() => window.__assemblyMockSaved[1]);
  check("fail 保存入参", saved2 && saved2.material === "MAT-X-999" && saved2.checkResult === "fail");
  check("非BOM后仍清空聚焦", (await page.locator(".input-material-qr").inputValue()) === "" && (await page.evaluate(() => document.activeElement.classList.contains("input-material-qr"))));

  // ============ 10. 失焦不触发任何动作（去失焦约定的回归） ============
  await page.fill(".input-order-key", "WO20260824002");
  await fillMaterialQr("MAT-NUT-002|供应商C|SN003:1");
  const savedBeforeBlur = await page.evaluate(() => window.__assemblyMockSaved.length);
  const queryBeforeBlur = await page.evaluate(() => window.__orderRequests.length);
  await page.evaluate(() => document.activeElement.blur());
  await page.waitForTimeout(900);
  check("失焦不触发订单查询", (await page.evaluate(() => window.__orderRequests.length)) === queryBeforeBlur);
  check("失焦不触发物料检查", (await page.evaluate(() => window.__assemblyMockSaved.length)) === savedBeforeBlur && (await page.locator(".check-result-row").count()) === 2);

  // ============ 11. 输入法组字中的回车不触发（IME 保护） ============
  await page.evaluate((key) => {
    const input = document.querySelector(".input-order-key");
    input.value = key;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true }));
  }, "WO20260824002");
  await page.waitForTimeout(700);
  check("组字中回车不触发查询", (await page.evaluate(() => window.__orderRequests.length)) === queryBeforeBlur);

  // ============ 12. 回车换订单（旧结果清空） ============
  await page.fill(".input-order-key", "WO20260824002");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(900);
  check("回车换订单", (await page.locator(".host-code-tag").textContent()) === "HC2608-1208" && (await page.locator(".host-alias-tag").textContent()) === "搅拌140");
  check("换订单后清空结果", (await page.locator(".check-result-row").count()) === 0 && (await page.locator(".empty-check-result").isVisible()));

  // ============ 13. 扫码按钮开关（JS 配置） ============
  const scanHiddenFlags = () => page.evaluate(() => [".btn-scan-station", ".btn-scan-order", ".btn-scan-material"].map((selector) => document.querySelector(selector).classList.contains("hidden")));
  check("扫码按钮默认显示", (await scanHiddenFlags()).every((hidden) => !hidden) && (await page.locator(".btn-scan-order").isVisible()));
  await page.evaluate(() => {
    AssemblyMaterialCheck.SCAN_BUTTON_ENABLED = false;
    AssemblyMaterialCheck.applyScanButtonSwitch();
  });
  await page.waitForTimeout(200);
  check("开关关闭后隐藏扫码按钮", (await scanHiddenFlags()).every((hidden) => hidden) && !(await page.locator(".btn-scan-order").isVisible()));
  check("搜索按钮不受影响", (await page.locator(".btn-search-order").isVisible()) && (await page.locator(".btn-search-material").isVisible()));
  await page.evaluate(() => {
    AssemblyMaterialCheck.SCAN_BUTTON_ENABLED = true;
    AssemblyMaterialCheck.applyScanButtonSwitch();
  });
  await page.waitForTimeout(200);
  check("开关恢复后显示扫码按钮", (await scanHiddenFlags()).every((hidden) => !hidden) && (await page.locator(".btn-scan-order").isVisible()));

  // ============ 14. 回车扫码新增一条（订单2，BOM 内） ============
  await fillMaterialQr("MAT-NUT-002|供应商C|SN003:1");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1200);
  check("订单2 扫码通过", (await page.locator(".check-result-row.pass").count()) === 1 && (await page.locator(".check-result-row").count()) === 1);
  const saved3 = await page.evaluate(() => window.__assemblyMockSaved[2]);
  check("订单2 保存入参", saved3 && saved3.wipOrderNo === "WO20260824002" && saved3.checkResult === "pass");

  // ============ 15. 订单查询失败：toast 且保留现状；点确定不重复查询 ============
  await page.evaluate(() => {
    window.__orderQueryCount = 0;
    const original = window.assemblyMaterialCheck_getWipOrderNoInfo;
    window.assemblyMaterialCheck_getWipOrderNoInfo = function (params, callback) {
      window.__orderQueryCount++;
      original(params, callback);
    };
  });
  await page.fill(".input-order-key", "UNKNOWN-ORDER");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(900);
  check("查询失败 toast", (await page.locator(".template-toast:not(.hidden) .toast-title").textContent()) === "查询失败" && (await page.locator(".template-toast:not(.hidden) .toast-content").textContent()) === "未查询到订单信息");
  check("失败保留现有结果", (await page.locator(".check-result-row").count()) === 1);
  check("失败仅调用一次", (await page.evaluate(() => window.__orderQueryCount)) === 1);
  await page.click(".template-toast .toast-btn");
  await page.waitForTimeout(1000);
  check("确定后不重复查询", (await page.evaluate(() => window.__orderQueryCount)) === 1 && !(await page.locator(".template-toast").isVisible()));

  // ============ 16. 检查完成：保留工位，其余重置 ============
  await page.click(".btn-check-complete");
  await page.waitForTimeout(300);
  check("完成保留工位", (await page.locator(".work-station-tag").textContent()) === "ZA01（总装一线-01）");
  check("完成清空订单信息", (await page.locator(".host-code-tag").textContent()) === "" && (await page.locator(".host-alias-tag").textContent()) === "");
  check("完成清空结果区", (await page.locator(".check-result-row").count()) === 0 && (await page.locator(".empty-check-result").isVisible()));
  check("完成聚焦订单输入", (await page.evaluate(() => document.activeElement.classList.contains("input-order-key"))));

  // ============ 17. 返回重新进入 ============
  await page.click(".btn-back-station");
  await page.waitForTimeout(300);
  check("返回后列表保留", (await page.evaluate(() => document.activeElement.classList.contains("input-station-filter"))) && (await page.locator(".station-item").count()) === 2);

  // ============ 18. 容器缺失不崩溃（Portal 表单环境 HTML 晚注入场景） ============
  await page.evaluate(() => {
    document.querySelector(".mom-assembly-material-check").remove();
    window.__probe = { filtered: null, initError: null };
    try {
      window.__probe.filtered = AssemblyMaterialCheck.getFilteredStations().length;
    } catch (e) {
      window.__probe.filtered = "throw:" + e.message;
    }
    try {
      AssemblyMaterialCheck.initPage();
    } catch (e) {
      window.__probe.initError = "throw:" + e.message;
    }
  });
  await page.waitForTimeout(300);
  check("容器缺失时筛选不崩", typeof (await page.evaluate(() => window.__probe.filtered)) === "number");
  check("容器缺失时初始化不崩", (await page.evaluate(() => window.__probe.initError)) === null);

  // ============ 汇总 ============
  console.log("----");
  console.log("JS错误数:", errors.length);
  errors.slice(0, 5).forEach((e) => console.log("  ", e));
  await browser.close();
  console.log(failed || errors.length > 0 ? "REGRESSION FAIL" : "REGRESSION OK");
  process.exit(failed || errors.length > 0 ? 1 : 0);
})().catch((e) => { console.error("FAIL:", e.message.split("\n")[0]); process.exit(1); });
