// ============== mom-cert 回归测试 ==============
// 用法：cd /home/wangzm/projects/SanyH5 && NODE_PATH=$(npm root -g) node tests/mom-cert.regress.cjs
// 前置：nginx 8080 运行中
// 覆盖：dev 模式渲染/校验/触屏 tooltip；生产缺字段不崩；XSS 前置拦截
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:8080/SanyH5/mom-cert/index.html";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const step = (n, ok, extra) => console.log(`${ok ? "✅" : "❌"} ${n}${extra ? " | " + extra : ""}`);
  let failed = false;
  const check = (n, ok, extra) => {
    step(n, ok, extra);
    if (!ok) failed = true;
  };

  // ===== 场景 A：开发模式（?dev=1）渲染 + 校验 + 触屏 tooltip =====
  {
    const page = await browser.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message.slice(0, 80)));
    await page.goto(BASE + "?dev=1", { timeout: 15000 });
    await page.waitForTimeout(1200);
    check("A1 校验格渲染", (await page.locator("[data-vld-values]").count()) > 0);
    check("A2 订单信息填充", (await page.locator("#span_WIPORDERNO").textContent()) === "WO-2024-06001");
    await page.locator("[data-vld-values]:visible").first().click();
    await page.waitForTimeout(200);
    check("A3 触屏 tooltip", await page.locator("#vld-tooltip").isVisible());
    check("A4 无 JS 错误", errs.length === 0, errs.join(" | "));
    await page.close();
  }

  // ===== 场景 B：生产缺字段（归一化不崩） =====
  {
    const page = await browser.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message.slice(0, 100)));
    await page.addInitScript(() => {
      window.$Context = { inputs: { WIPORDERNO: "WO-99", MODETYPE: "国六", ISCARGOTRUCK: false }, outputs: {}, submit: function () {} };
    });
    await page.goto(BASE, { timeout: 15000 });
    await page.waitForTimeout(1200);
    check("B1 缺字段不崩", errs.length === 0, errs.join(" | "));
    check("B2 页面仍渲染", (await page.locator("#span_WIPORDERNO").textContent()) === "WO-99");
    await page.close();
  }

  // ===== 场景 C：XSS 前置拦截（script / onerror / javascript: 链接） =====
  {
    const page = await browser.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message.slice(0, 100)));
    await page.addInitScript(() => {
      window.$Context = {
        inputs: {
          WIPORDERNO: "WO-88", MODETYPE: "国六", ISCARGOTRUCK: false, FRISTTRIALSTATUS: "1",
          MSG: "<p>正常信息</p><script>window.__xss=1;<\/script><img src=x onerror=\"window.__xss2=1\"><a href=\"javascript:window.__xss3=1\">点我</a>",
          DP: "", ZC: "", CL: "", WX: "", HB: "", RY: "", CHECK_CONTENT: "[]",
        },
        outputs: {},
        submit: function () {},
      };
    });
    await page.goto(BASE, { timeout: 15000 });
    await page.waitForTimeout(1200);
    const xss = await page.evaluate(() => ({
      x1: window.__xss, x2: window.__xss2, x3: window.__xss3,
      scripts: document.querySelectorAll("#check_content script").length,
      onattrs: document.querySelectorAll("#check_content [onerror], #check_content [onclick]").length,
      jslinks: document.querySelectorAll("#check_content [href^=javascript]").length,
      text: document.querySelector("#check_content").textContent,
    }));
    check("C1 可执行内容未执行", !xss.x1 && !xss.x2 && !xss.x3);
    check("C2 可执行元素已移除", xss.scripts === 0 && xss.onattrs === 0 && xss.jslinks === 0);
    check("C3 正常文本保留", xss.text.indexOf("正常信息") !== -1 && xss.text.indexOf("点我") !== -1);
    check("C4 无 JS 错误", errs.length === 0, errs.join(" | "));
    await page.close();
  }

  await browser.close();
  console.log(failed ? "REGRESSION FAIL" : "REGRESSION OK");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("FAIL:", e.message.split("\n")[0]); process.exit(1); });
