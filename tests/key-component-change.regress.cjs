// ============== mom-key-component-change 回归测试 ==============
// 用法：cd /home/wangzm/projects/SanyH5 && NODE_PATH=$(npm root -g) node tests/key-component-change.regress.cjs
// 前置：nginx 8080 运行中（http://localhost:8080/SanyH5/<页面目录>/）
// 覆盖：加载/按钮开关(显示+权限)/订单查询(回车+搜索、订单号与VIN判定)/数量标签/卡片合并与排序/
//       二维码校验/前电机后电机(自动分配+弹窗+取消)/CheckAndSave 两分支/移除页/更换页(Remove+Save)/
//       行删除/解绑按钮业务条件/小屏布局/容器缺失
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:8080/SanyH5/mom-key-component-change/index.html";
const PRODUCTION_ORDER = "184000000012";
const CHANGE_ORDER = "184000000013";
const PRODUCTION_VIN = "LSVU2A0N260800001";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message.slice(0, 100)));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("favicon")) errors.push("CONSOLE: " + m.text().slice(0, 80));
  });
  const check = (name, ok, extra) => {
    console.log(`${ok ? "✅" : "❌"} ${name}${extra ? " | " + extra : ""}`);
    if (!ok) failed = true;
  };
  let failed = false;

  const requestCount = (taskType) =>
    page.evaluate((type) => (window.__keyComponentMockRequests || []).filter((item) => item.taskType === type).length, taskType);
  const lastRequest = (taskType) =>
    page.evaluate((type) => {
      const list = (window.__keyComponentMockRequests || []).filter((item) => item.taskType === type);
      return list.length ? list[list.length - 1].reported : null;
    }, taskType);
  const savedList = () => page.evaluate(() => window.__keyComponentMockSaved || []);
  const closeToast = async () => {
    if (await page.locator(".template-toast:not(.hidden)").count()) {
      await page.click(".template-toast .toast-btn");
      await page.waitForTimeout(200);
    }
  };
  const queryOrder = async (key) => {
    await page.fill(".input-order-key", key);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1400);
  };
  const scanMaterial = async (text) => {
    await page.fill(".input-material-qr", text);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1400);
  };

  // ============ 1. 加载 ============
  await page.goto(BASE, { timeout: 15000 });
  await page.waitForTimeout(800);
  check("页面加载", (await page.title()) === "关重件更换");
  check("默认视图1", (await page.locator(".key-component-check-view").isVisible()) && !(await page.locator(".key-component-remove-view").isVisible()) && !(await page.locator(".key-component-change-view").isVisible()));
  check("列表空态", await page.locator(".empty-key-component").isVisible());
  check("默认聚焦订单输入", await page.evaluate(() => document.activeElement.classList.contains("input-order-key")));
  check("二维码输入默认可编辑(扫码枪可键入)", (await page.evaluate(() => document.querySelector(".input-material-qr").readOnly)) === false);

  // ============ 2. 订单查询：VIN / 订单号 / 搜索按钮 / 失败保留现状 ============
  await queryOrder(PRODUCTION_VIN);
  check("VIN 触发查询", (await requestCount("GetWipOrderNoInfo")) === 1);
  const vinRequest = await lastRequest("GetWipOrderNoInfo");
  check("VIN 判定为 vin 字段", vinRequest && vinRequest.wipOrderNo === "" && vinRequest.vin === PRODUCTION_VIN);
  check("订单号标签带生产标注", (await page.locator(".order-no-tag").textContent()) === PRODUCTION_ORDER + "（生产订单）");
  await page.click(".btn-search-order");
  await page.waitForTimeout(1400);
  check("搜索按钮触发查询", (await requestCount("GetWipOrderNoInfo")) === 2);

  await queryOrder(PRODUCTION_ORDER);
  const orderRequest = await lastRequest("GetWipOrderNoInfo");
  check("纯数字判定为 wipOrderNo", orderRequest && orderRequest.wipOrderNo === PRODUCTION_ORDER && orderRequest.vin === "");
  check("查询成功自动调 KC2", (await requestCount("GetKeyComponentInfo")) >= 3);
  check("需采集数量 2/5", (await page.locator(".collect-quantity-tag").textContent()) === "2/5");
  check("生产订单隐藏需解绑数量行", !(await page.locator(".remove-quantity-row").isVisible()));
  check("查询后聚焦二维码(抑制键盘)", await page.evaluate(() => document.activeElement.classList.contains("input-material-qr")));

  await queryOrder("999999999999");
  check("查询失败 toast", (await page.locator(".template-toast:not(.hidden) .toast-content").textContent()) === "未查询到订单信息");
  check("失败保留现状", (await page.locator(".order-no-tag").textContent()) === PRODUCTION_ORDER + "（生产订单）" && (await page.locator(".key-component-card").count()) === 3);
  await closeToast();
  await queryOrder(PRODUCTION_ORDER);

  // ============ 3. 卡片合并、排序、前后电机标签 ============
  check("卡片 3 张", (await page.locator(".key-component-card").count()) === 3);
  {
    const first = page.locator(".key-component-card").first();
    check("首卡=最新扫描物料", (await first.locator(".key-component-material-no").textContent()) === "MAT-MOTOR-001");
    check("首卡物料描述与类型", (await first.locator(".key-component-material-desc").textContent()) === "永磁同步电机" && (await first.locator(".key-component-material-type").textContent()) === "永磁体同步电机");
    check("同物料两张配置合并为一张卡(1/2)", (await first.locator(".key-component-quantity").textContent()) === "1/2" && (await first.locator(".serial-row").count()) === 1);
    check("卡内首行序列号与扫描时间", (await first.locator(".serial-no").textContent()) === "SN-MOTOR-A1" && (await first.locator(".scan-time").textContent()) === "2026-08-24 09:10:00");
    check("序号 1 显示前电机", (await first.locator(".motor-position").textContent()) === "前电机");
    const second = page.locator(".key-component-card").nth(1);
    check("次卡按扫描时间排序", (await second.locator(".key-component-material-no").textContent()) === "MAT-AXLE-002");
    check("序号 null 不显示前后电机", await second.locator(".motor-position").isHidden());
    const third = page.locator(".key-component-card").nth(2);
    check("未采集卡排最后且 0/2", (await third.locator(".key-component-material-no").textContent()) === "MAT-BOX-003" && (await third.locator(".key-component-quantity").textContent()) === "0/2" && (await third.locator(".serial-row").count()) === 0);
  }

  // ============ 4. 二维码校验拦截（均不调用 KC3） ============
  await scanMaterial("MAT-BOX-003|供应商A|SN-NOQTY");
  check("缺数量段被拦截", (await page.locator(".template-toast:not(.hidden) .toast-content").textContent()).indexOf("二维码格式不正确") !== -1);
  await closeToast();
  await scanMaterial("MAT-BOX-003|供应商A|SN-ZERO:0");
  check("数量为 0 被拦截", (await page.locator(".template-toast:not(.hidden) .toast-content").textContent()).indexOf("二维码格式不正确") !== -1);
  await closeToast();
  await scanMaterial("MAT-UNKNOWN-999|供应商B|SN-UNKNOWN:1");
  check("非本订单关重件被拦截", (await page.locator(".template-toast:not(.hidden) .toast-content").textContent()).indexOf("不是本订单关重件") !== -1);
  await closeToast();
  check("三次拦截均未调用 KC3", (await requestCount("CheckAndSave")) === 0);

  // ============ 5. 序号明确：自动分配未采集序号 + 保存后刷新与重聚焦 ============
  await scanMaterial("MAT-MOTOR-001|供应商A|SN-MOTOR-A2:1");
  {
    const saved = await savedList();
    check("自动分配后电机(序号2，不弹窗)", saved.length === 1 && saved[0].reported.materialSeq === 2 && !(await page.locator(".template-motor-picker").isVisible()));
    check("KC3 入参完整", saved[0].reported.wipOrderNo === PRODUCTION_ORDER && saved[0].reported.productNo === "MAT-HOST-001" && saved[0].reported.materialSerialNo === "SN-MOTOR-A2" && saved[0].reported.materialQty === 1 && saved[0].reported.partner === "供应商A" && saved[0].reported.inputType === "手输" && saved[0].reported.inputCode === 13);
  }
  check("保存后刷新数量 3/5", (await page.locator(".collect-quantity-tag").textContent()) === "3/5");
  check("保存后清空且重聚焦可编辑", await page.evaluate(() => {
    const input = document.querySelector(".input-material-qr");
    return input.value === "" && document.activeElement === input && !input.readOnly;
  }));
  check("聚焦瞬间临时只读(抑制键盘)", await page.evaluate(() => {
    const input = document.querySelector(".input-material-qr");
    let readOnlyAtFocus = null;
    const originalFocus = input.focus.bind(input);
    input.focus = function () {
      readOnlyAtFocus = input.readOnly;
      originalFocus();
    };
    KeyComponentChange.focusMaterialInput();
    input.focus = originalFocus;
    return readOnlyAtFocus;
  }));
  await page.waitForTimeout(300);

  await scanMaterial("MAT-AXLE-002|供应商A|SN-AXLE-A1:1");
  check("重复序列号被拦截", (await page.locator(".template-toast:not(.hidden) .toast-content").textContent()) === "该序列号已采集" && (await requestCount("CheckAndSave")) === 1);
  await closeToast();

  // ============ 6. 改制订单：需解绑数量行 + 序号不明确弹窗（含取消） ============
  await queryOrder(CHANGE_ORDER);
  check("改制订单类型标注", (await page.locator(".order-no-tag").textContent()) === CHANGE_ORDER + "（改制订单）");
  check("改制订单显示需解绑数量 0/2", (await page.locator(".remove-quantity-row").isVisible()) && (await page.locator(".remove-quantity-tag").textContent()) === "0/2");
  check("需解绑总数>已解绑 显示解绑按钮", await page.locator(".btn-unbind").isVisible());

  await scanMaterial("MAT-MOTOR-011|供应商C|SN-MOTOR-C1:1");
  check("序号不明确弹出前后电机选择", await page.locator(".template-motor-picker").isVisible());
  check("已采集位置置灰禁用", await page.evaluate(() => {
    const options = Array.from(document.querySelectorAll(".motor-option")).map((option) => ({
      label: option.querySelector(".motor-option-label").textContent,
      disabled: option.classList.contains("disabled"),
    }));
    return options.length === 2 && options[0].label === "前电机" && options[0].disabled && options[1].label === "后电机" && !options[1].disabled;
  }));
  const savedBeforeCancel = (await savedList()).length;
  await page.click(".template-motor-picker .picker-btn");
  await page.waitForTimeout(400);
  check("取消不保存且清空输入", (await savedList()).length === savedBeforeCancel && (await page.evaluate(() => document.querySelector(".input-material-qr").value)) === "");

  await scanMaterial("MAT-MOTOR-011|供应商C|SN-MOTOR-C1:1");
  await page.click(".motor-option >> nth=1");
  await page.waitForTimeout(1400);
  {
    const saved = await savedList();
    const last = saved[saved.length - 1];
    check("人工选择后电机保存 materialSeq=2", last.reported.materialSeq === 2 && last.reported.materialNo === "MAT-MOTOR-011");
  }

  // ============ 7. 视图2：移除页（渲染 / 二次确认 / 移除 / 返回刷新） ============
  await page.click(".btn-unbind");
  await page.waitForTimeout(1400);
  check("进入移除页", await page.locator(".key-component-remove-view").isVisible());
  check("移除页头部改制订单号", (await page.locator(".remove-order-no-tag").textContent()) === CHANGE_ORDER + "（改制订单）");
  check("待移除明细 2 条", (await page.locator(".remove-record-card").count()) === 2);
  check("明细卡片字段", await page.evaluate(() => {
    const card = document.querySelector(".remove-record-card");
    return card.querySelector(".remove-record-order-no").textContent === "184000000001（生产订单）" &&
      card.querySelector(".remove-record-material-no").textContent === "MAT-MOTOR-001" &&
      card.querySelector(".remove-record-old-serial").textContent === "SN-MOTOR-OLD-1" &&
      card.querySelector(".remove-record-scan-time").textContent === "2026-08-20 08:30:00";
  }));
  check("移除按钮权限可禁用(克隆行)", await page.evaluate(() => {
    KeyComponentChange.BUTTON_SWITCH.removeRecord.permitted = false;
    KeyComponentChange.applyButtonSwitch();
    const disabled = document.querySelector(".btn-remove-row").disabled;
    KeyComponentChange.BUTTON_SWITCH.removeRecord.permitted = true;
    KeyComponentChange.applyButtonSwitch();
    return disabled && !document.querySelector(".btn-remove-row").disabled;
  }));

  await page.click(".btn-remove-row >> nth=0");
  await page.waitForTimeout(300);
  check("移除二次确认", await page.locator(".template-confirm").isVisible());
  await page.click(".confirm-btn-cancel");
  await page.waitForTimeout(300);
  check("取消不移除", (await requestCount("Remove")) === 0 && (await page.locator(".remove-record-card").count()) === 2);

  await page.click(".btn-remove-row >> nth=0");
  await page.waitForTimeout(300);
  await page.click(".confirm-btn-ok");
  await page.waitForTimeout(1400);
  const removeRequest = await lastRequest("Remove");
  check("移除入参带行内订单", removeRequest && removeRequest.wipOrderNo === "184000000001" && removeRequest.wipOrderType === 1 && removeRequest.serialNo === "SN-HOST-0101" && removeRequest.materialSerialNo === "SN-MOTOR-OLD-1");
  check("移除后重新拉取 KC5", (await requestCount("GetRemoveKeyComponentInfo")) === 2);

  const kc2BeforeBack = await requestCount("GetKeyComponentInfo");
  await page.click(".btn-back-remove");
  await page.waitForTimeout(1400);
  check("返回视图1", await page.locator(".key-component-check-view").isVisible());
  check("返回后刷新 KC2", (await requestCount("GetKeyComponentInfo")) === kc2BeforeBack + 1);
  check("已解绑数量更新 1/2", (await page.locator(".remove-quantity-tag").textContent()) === "1/2");

  // ============ 8. 视图3：isChange=1 进入更换页 → Remove + Save ============
  await scanMaterial("MAT-BOX-012|供应商D|CHG-SN-1:1");
  check("isChange=1 进入更换页", await page.locator(".key-component-change-view").isVisible());
  check("更换页头部信息", (await page.locator(".change-material-tag").textContent()) === CHANGE_ORDER + "（改制订单）-MAT-BOX-012-变速箱总成" && (await page.locator(".new-serial-tag").textContent()) === "CHG-SN-1");
  check("待更换明细 2 条", (await page.locator(".change-record-card").count()) === 2);
  check("待更换明细字段", await page.evaluate((changeOrder) => {
    const card = document.querySelector(".change-record-card");
    return card.querySelector(".change-record-order-no").textContent === changeOrder + "（改制订单）" &&
      card.querySelector(".change-record-old-serial").textContent === "SN-OLD-CHG-1" &&
      card.querySelector(".change-record-scan-time").textContent === "2026-08-22 10:00:00";
  }, CHANGE_ORDER));

  await page.click(".btn-change-row >> nth=0");
  await page.waitForTimeout(300);
  check("更换二次确认", await page.locator(".template-confirm").isVisible());
  await page.click(".confirm-btn-ok");
  await page.waitForTimeout(1800);
  {
    const removeRequests = await page.evaluate(() => (window.__keyComponentMockRequests || []).filter((item) => item.taskType === "Remove").length);
    const saved = await savedList();
    const saveItems = saved.filter((item) => item.taskType === "Save");
    check("更换先移除再保存", removeRequests === 2 && saveItems.length === 1);
    check("Save 带 oldGenealogyID", saveItems[0].reported.oldGenealogyID === "GEN-2");
    check("Save 与 CheckAndSave 同字段", saveItems[0].reported.wipOrderNo === CHANGE_ORDER && saveItems[0].reported.wipOrderType === 2 && saveItems[0].reported.productNo === "MAT-HOST-002" && saveItems[0].reported.materialNo === "MAT-BOX-012" && saveItems[0].reported.materialSerialNo === "CHG-SN-1");
  }
  check("更换成功回到视图1", await page.locator(".key-component-check-view").isVisible());
  check("更换后清空二维码输入", (await page.evaluate(() => document.querySelector(".input-material-qr").value)) === "");

  // ============ 9. 更换页 Save 失败重试：不重复移除（改用仍有采集余量的关重件） ============
  await queryOrder(PRODUCTION_ORDER);
  await scanMaterial("MAT-BOX-003|供应商E|CHG-SN-2:1");
  check("再次进入更换页", await page.locator(".key-component-change-view").isVisible());
  await page.evaluate(() => {
    window.__failSaveOnce = true;
    const originalSave = window.KeyComponentChange_Save;
    window.KeyComponentChange_Save = function (request, callback) {
      if (window.__failSaveOnce) {
        window.__failSaveOnce = false;
        window.__keyComponentMockRequests.push({ taskType: "Save", reported: request.reported });
        callback({ code: 1, msg: "保存失败" });
        return;
      }
      originalSave(request, callback);
    };
  });
  await page.click(".btn-change-row >> nth=0");
  await page.waitForTimeout(300);
  await page.click(".confirm-btn-ok");
  await page.waitForTimeout(1600);
  const removeCountAfterFailure = await requestCount("Remove");
  check("Save 失败提示", (await page.locator(".template-toast:not(.hidden) .toast-content").textContent()) === "移除成功，保存失败，请重试");
  check("Save 失败停留更换页", await page.locator(".key-component-change-view").isVisible());
  await closeToast();
  await page.click(".btn-change-row >> nth=0");
  await page.waitForTimeout(300);
  await page.click(".confirm-btn-ok");
  await page.waitForTimeout(1800);
  check("重试不重复移除", (await requestCount("Remove")) === removeCountAfterFailure);
  check("重试保存成功回视图1", await page.locator(".key-component-check-view").isVisible());

  // ============ 10. 关重件序列号删除（视图1 行内删除图标） ============
  await queryOrder(PRODUCTION_ORDER);
  const firstSerialNo = await page.locator(".serial-row").first().locator(".serial-no").textContent();
  const collectedBeforeDelete = Number((await page.locator(".collect-quantity-tag").textContent()).split("/")[0]);
  const removeCountBeforeDelete = await requestCount("Remove");
  await page.click(".btn-delete-serial >> nth=0");
  await page.waitForTimeout(300);
  check("删除二次确认", await page.locator(".template-confirm").isVisible());
  await page.click(".confirm-btn-ok");
  await page.waitForTimeout(1400);
  const deleteRequest = await lastRequest("Remove");
  check("删除入参 = 订单序列号 + 关重件序列号", (await requestCount("Remove")) === removeCountBeforeDelete + 1 && deleteRequest.wipOrderNo === PRODUCTION_ORDER && deleteRequest.wipOrderType === 1 && deleteRequest.serialNo === "SN-HOST-0001" && deleteRequest.materialSerialNo === firstSerialNo);
  const collectedAfterDelete = Number((await page.locator(".collect-quantity-tag").textContent()).split("/")[0]);
  check("删除后已采集数量减 1", collectedAfterDelete === collectedBeforeDelete - 1, `${collectedBeforeDelete}->${collectedAfterDelete}`);

  // ============ 11. 需解绑数量达标（移除页移除 + 更换流程移除）后解绑按钮消失 ============
  await queryOrder(CHANGE_ORDER);
  check("已解绑数量不超过需解绑总数 2/2", (await page.locator(".remove-quantity-tag").textContent()) === "2/2");
  check("达标后隐藏解绑按钮", !(await page.locator(".btn-unbind").isVisible()));
  check("改制订单需解绑数量行仍显示", await page.locator(".remove-quantity-row").isVisible());
  check("达标后仍可从移除页刷新", await page.evaluate(() => {
    KeyComponentChange.enterRemoveView();
    return true;
  }));
  await page.waitForTimeout(1400);
  check("达标后移除页可正常渲染", (await page.locator(".remove-record-card").count()) === 2);
  await page.click(".btn-back-remove");
  await page.waitForTimeout(1400);

  // ============ 12. 满量扫描：不保存，直接进入更换页（更换清单按关重件物料编码过滤） ============
  await queryOrder(PRODUCTION_ORDER);
  const cardQuantity = (materialNo) => page.evaluate((target) => {
    const card = Array.from(document.querySelectorAll(".key-component-card")).find((item) => item.querySelector(".key-component-material-no").textContent === target);
    return card.querySelector(".key-component-quantity").textContent;
  }, materialNo);
  check("满量物料：电机 2/2、驱动桥 1/1、变速箱 0/2", (await cardQuantity("MAT-MOTOR-001")) === "2/2" && (await cardQuantity("MAT-AXLE-002")) === "1/1" && (await cardQuantity("MAT-BOX-003")) === "0/2");

  {
    const checkAndSaveBefore = await requestCount("CheckAndSave");
    await scanMaterial("MAT-AXLE-002|供应商A|SN-AXLE-A2:1");
    check("满量扫描不调用 CheckAndSave", (await requestCount("CheckAndSave")) === checkAndSaveBefore);
    check("满量扫描直接进入更换页", await page.locator(".key-component-change-view").isVisible());
    check("更换页带出物料编码与新序列号", (await page.locator(".change-material-tag").textContent()).indexOf("MAT-AXLE-002") !== -1 && (await page.locator(".new-serial-tag").textContent()) === "SN-AXLE-A2");
    check("更换清单入参带关重件物料编码", (await lastRequest("GetChangeKeyComponentInfo")).materialNo === "MAT-AXLE-002");
    await page.click(".btn-change-row >> nth=0");
    await page.waitForTimeout(300);
    await page.click(".confirm-btn-ok");
    await page.waitForTimeout(1800);
    check("更换后回到视图1", await page.locator(".key-component-check-view").isVisible());
    check("换件后驱动桥数量不超需扫描总数(1/1)", (await cardQuantity("MAT-AXLE-002")) === "1/1");
  }

  await scanMaterial("MAT-MOTOR-001|供应商A|SN-MOTOR-A4:1");
  check("满量电机弹出位置选择", await page.locator(".template-motor-picker").isVisible());
  check("更换时已采集位置可选", await page.evaluate(() => Array.from(document.querySelectorAll(".motor-option")).every((option) => !option.classList.contains("disabled"))));
  await page.click(".motor-option >> nth=0");
  await page.waitForTimeout(1400);
  check("选择位置后进入更换页", (await page.locator(".key-component-change-view").isVisible()) && (await lastRequest("GetChangeKeyComponentInfo")).materialNo === "MAT-MOTOR-001");
  await page.click(".btn-change-row >> nth=0");
  await page.waitForTimeout(300);
  await page.click(".confirm-btn-ok");
  await page.waitForTimeout(1800);
  {
    const saveItems = (await savedList()).filter((item) => item.taskType === "Save");
    const lastSave = saveItems[saveItems.length - 1];
    check("更换保存携带所选前电机序号与旧件 ID", lastSave.reported.materialSerialNo === "SN-MOTOR-A4" && lastSave.reported.materialSeq === 1 && !!lastSave.reported.oldGenealogyID);
  }
  check("换件后电机数量不超需扫描总数(2/2)", (await cardQuantity("MAT-MOTOR-001")) === "2/2");

  await scanMaterial("MAT-BOX-003|供应商A|SN-BOX-1:1");
  check("多件关重件第 1 颗入库(1/2)", (await cardQuantity("MAT-BOX-003")) === "1/2");
  await scanMaterial("MAT-BOX-003|供应商A|SN-BOX-2:1");
  check("多件关重件第 2 颗入库(2/2)", (await cardQuantity("MAT-BOX-003")) === "2/2");
  {
    const checkAndSaveBefore = await requestCount("CheckAndSave");
    await scanMaterial("MAT-BOX-003|供应商A|SN-BOX-3:1");
    check("满量后第 3 颗不保存直接进更换页", (await requestCount("CheckAndSave")) === checkAndSaveBefore && (await page.locator(".key-component-change-view").isVisible()) && (await page.locator(".new-serial-tag").textContent()) === "SN-BOX-3");
    await page.click(".btn-back-change");
    await page.waitForTimeout(1400);
  }
  check("返回视图1且数量不变 2/2", (await cardQuantity("MAT-BOX-003")) === "2/2");
  check("总采集数量不超过需采集总数 5/5", (await page.locator(".collect-quantity-tag").textContent()) === "5/5");

  // ============ 13. 按钮开关：显示开关与权限开关各自独立 ============
  const buttonState = (selector) => page.evaluate((sel) => {
    const button = document.querySelector(sel);
    return { hidden: button.classList.contains("hidden"), disabled: button.disabled };
  }, selector);
  check("默认四个输入按钮可见可用", await page.evaluate(() => [".btn-search-order", ".btn-scan-order", ".btn-search-material", ".btn-scan-material"].every((sel) => {
    const button = document.querySelector(sel);
    return button && !button.classList.contains("hidden") && !button.disabled;
  })));
  await page.evaluate(() => {
    KeyComponentChange.BUTTON_SWITCH.scanOrder.visible = false;
    KeyComponentChange.applyButtonSwitch();
  });
  check("显示开关只影响该按钮", (await buttonState(".btn-scan-order")).hidden && !(await buttonState(".btn-search-order")).hidden && !(await buttonState(".btn-scan-material")).hidden);
  await page.evaluate(() => {
    KeyComponentChange.BUTTON_SWITCH.scanOrder.visible = true;
    KeyComponentChange.BUTTON_SWITCH.searchOrder.permitted = false;
    KeyComponentChange.applyButtonSwitch();
  });
  const kc1BeforeDisabledClick = await requestCount("GetWipOrderNoInfo");
  await page.locator(".btn-search-order").click({ force: true, timeout: 3000 });
  await page.waitForTimeout(800);
  check("权限开关置灰禁用且点击无效", (await buttonState(".btn-search-order")).disabled && !(await buttonState(".btn-search-order")).hidden && (await requestCount("GetWipOrderNoInfo")) === kc1BeforeDisabledClick);
  await page.evaluate(() => {
    KeyComponentChange.BUTTON_SWITCH.searchOrder.permitted = true;
    KeyComponentChange.BUTTON_SWITCH.deleteSerial.permitted = false;
    KeyComponentChange.applyButtonSwitch();
  });
  check("克隆行按钮同步权限开关", await page.evaluate(() => {
    const disabled = document.querySelector(".btn-delete-serial").disabled;
    KeyComponentChange.BUTTON_SWITCH.deleteSerial.permitted = true;
    KeyComponentChange.applyButtonSwitch();
    return disabled && !document.querySelector(".btn-delete-serial").disabled;
  }));
  await page.evaluate(() => {
    KeyComponentChange.BUTTON_SWITCH.complete.visible = false;
    KeyComponentChange.BUTTON_SWITCH.back.visible = false;
    KeyComponentChange.applyButtonSwitch();
  });
  check("底部按钮显示开关独立", await page.evaluate(() => document.querySelector(".btn-complete").classList.contains("hidden") && document.querySelector(".btn-back-remove").classList.contains("hidden") && document.querySelector(".btn-back-change").classList.contains("hidden")));
  await page.evaluate(() => {
    KeyComponentChange.BUTTON_SWITCH.complete.visible = true;
    KeyComponentChange.BUTTON_SWITCH.back.visible = true;
    KeyComponentChange.applyButtonSwitch();
  });

  // ============ 14. 「完成」重置回初始态 ============
  await page.click(".btn-complete");
  await page.waitForTimeout(400);
  check("完成清空订单与列表", (await page.locator(".order-no-tag").textContent()) === "" && (await page.locator(".key-component-card").count()) === 0 && (await page.locator(".empty-key-component").isVisible()));
  check("完成隐藏需解绑数量行", !(await page.locator(".remove-quantity-row").isVisible()));
  check("完成聚焦订单输入", await page.evaluate(() => document.activeElement.classList.contains("input-order-key")));

  // ============ 15. 小屏布局（320×480 / 360×640，三视图各断言） ============
  await queryOrder(PRODUCTION_ORDER);
  for (const [width, height] of [[320, 480], [360, 640]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(500);
    const layout = await page.evaluate(() => {
      const card = document.querySelector(".key-component-card");
      const row = document.querySelector(".serial-row");
      const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
      return {
        pageScroll: document.documentElement.scrollHeight - window.innerHeight,
        cardOverflow: card.scrollWidth - card.clientWidth,
        rowOverflow: row.scrollWidth - row.clientWidth,
        listHeight: Math.round(rect(".key-component-list").height),
        serialNoWidth: Math.round(rect(".serial-no").width),
        timeRight: Math.round(rect(".scan-time").right),
        viewportWidth: window.innerWidth,
        buttonVisible: rect(".btn-complete").bottom <= window.innerHeight,
      };
    });
    const tag = `${width}x${height}`;
    check(`${tag} 视图1 无整页滚动`, layout.pageScroll <= 1, `scroll=${layout.pageScroll}`);
    check(`${tag} 视图1 卡片与序列号行无横向溢出`, layout.cardOverflow <= 0 && layout.rowOverflow <= 0, `card=${layout.cardOverflow} row=${layout.rowOverflow}`);
    check(`${tag} 视图1 列表与按钮可见`, layout.listHeight >= 80 && layout.buttonVisible, `list=${layout.listHeight}`);
    check(`${tag} 视图1 序列号与时间未互相顶出`, layout.serialNoWidth > 0 && layout.timeRight <= layout.viewportWidth, `serial=${layout.serialNoWidth} timeRight=${layout.timeRight}`);

    await page.evaluate(() => KeyComponentChange.enterRemoveView());
    await page.waitForTimeout(1400);
    const removeLayout = await page.evaluate(() => {
      const card = document.querySelector(".remove-record-card");
      return {
        cardCount: document.querySelectorAll(".remove-record-card").length,
        overflow: card ? card.scrollWidth - card.clientWidth : -1,
        buttonVisible: document.querySelector(".btn-back-remove").getBoundingClientRect().bottom <= window.innerHeight,
        pageScroll: document.documentElement.scrollHeight - window.innerHeight,
      };
    });
    check(`${tag} 视图2 卡片无横向溢出且返回可见`, removeLayout.cardCount === 2 && removeLayout.overflow <= 0 && removeLayout.buttonVisible && removeLayout.pageScroll <= 1, JSON.stringify(removeLayout));
    await page.click(".btn-back-remove");
    await page.waitForTimeout(1400);

    await page.evaluate(() => {
      KeyComponentChange.state.pendingScan = { materialNo: "MAT-BOX-003", materialDesc: "变速箱总成", materialSerialNo: "SN-PREVIEW" };
      KeyComponentChange.enterChangeView();
    });
    await page.waitForTimeout(1400);
    const changeLayout = await page.evaluate(() => {
      const card = document.querySelector(".change-record-card");
      return {
        cardCount: document.querySelectorAll(".change-record-card").length,
        overflow: card ? card.scrollWidth - card.clientWidth : -1,
        buttonVisible: document.querySelector(".btn-back-change").getBoundingClientRect().bottom <= window.innerHeight,
        pageScroll: document.documentElement.scrollHeight - window.innerHeight,
        materialTagVisible: document.querySelector(".change-material-tag").getBoundingClientRect().width > 0,
      };
    });
    check(`${tag} 视图3 卡片无横向溢出且返回可见`, changeLayout.cardCount === 2 && changeLayout.overflow <= 0 && changeLayout.buttonVisible && changeLayout.pageScroll <= 1 && changeLayout.materialTagVisible, JSON.stringify(changeLayout));
    await page.click(".btn-back-change");
    await page.waitForTimeout(1400);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);

  // ============ 16. 容器缺失不崩溃（Portal 表单环境 HTML 晚注入场景） ============
  await page.evaluate(() => {
    document.querySelector(".mom-key-component-change").remove();
    window.__probe = { payload: null, renderError: null, initError: null };
    try {
      window.__probe.payload = KeyComponentChange.getOrderSearchPayload("184000000012");
    } catch (e) {
      window.__probe.payload = "throw:" + e.message;
    }
    try {
      KeyComponentChange.renderKeyComponentList();
    } catch (e) {
      window.__probe.renderError = "throw:" + e.message;
    }
    try {
      KeyComponentChange.initPage();
    } catch (e) {
      window.__probe.initError = "throw:" + e.message;
    }
  });
  await page.waitForTimeout(400);
  check("容器缺失时工具函数可用", (await page.evaluate(() => window.__probe.payload)).wipOrderNo === "184000000012");
  check("容器缺失时渲染不崩", (await page.evaluate(() => window.__probe.renderError)) === null);
  check("容器缺失时初始化不崩", (await page.evaluate(() => window.__probe.initError)) === null);

  // ============ 汇总 ============
  console.log("----");
  console.log("JS错误数:", errors.length);
  errors.slice(0, 5).forEach((e) => console.log("  ", e));
  await browser.close();
  console.log(failed || errors.length > 0 ? "REGRESSION FAIL" : "REGRESSION OK");
  process.exit(failed || errors.length > 0 ? 1 : 0);
})().catch((e) => { console.error("FAIL:", e.message.split("\n")[0]); process.exit(1); });
