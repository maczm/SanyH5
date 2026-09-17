// ============== 关重件更换（更换主页 + 移除页 + 更换页三视图） ==============
// 数据来源：Portal 注入的 window.KeyComponentChange_* 七个接口（callback 风格，
// 信封 { code, msg, data }，code 0 为成功），入参统一 { taskType, reported }。
// 本地开发由同目录 mock.js 兜底（生产不部署，Portal 只取 index.html / index.js / index.css）。

// ============== Portal 表单回车提交拦截 ==============
// 平台约定：页面定义该空实现钩子即可（定义即生效），不需要页面调用，用于消除输入框回车提交刷新。
function Portal_OnDocumentKeyDown() {}

var KeyComponentChange = {
  API_TIMEOUT: 10000,

  // 按钮开关：visible 是否显示（false 隐藏），permitted 是否有权限（false 置灰禁用）
  BUTTON_SWITCH: {
    searchOrder: { visible: true, permitted: true },
    scanOrder: { visible: true, permitted: true },
    searchMaterial: { visible: true, permitted: true },
    scanMaterial: { visible: true, permitted: true },
    unbind: { visible: true, permitted: true },
    complete: { visible: true, permitted: true },
    deleteSerial: { visible: true, permitted: true },
    removeRecord: { visible: true, permitted: true },
    changeRecord: { visible: true, permitted: true },
    back: { visible: true, permitted: true },
  },

  BUTTON_SELECTOR: {
    searchOrder: ".btn-search-order",
    scanOrder: ".btn-scan-order",
    searchMaterial: ".btn-search-material",
    scanMaterial: ".btn-scan-material",
    unbind: ".btn-unbind",
    complete: ".btn-complete",
    deleteSerial: ".btn-delete-serial",
    removeRecord: ".btn-remove-row",
    changeRecord: ".btn-change-row",
    back: ".btn-back-remove, .btn-back-change",
  },

  state: {
    orderInfo: null,
    keyComponentList: [],
    serialList: [],
    removeQty: 0,
    needRemoveQty: 0,
    inputSource: { inputType: "手输", inputCode: 13 },
    pendingScan: null,
    changedOldGenealogyId: null,
  },

  _loadingCount: 0,
  _toastTimer: null,
  _initRetryCount: 0,

  // ============== 模板克隆 ==============
  // 模板缺失（Portal 表单环境容器晚注入或已移除）时返回空集合，渲染链路上的赋值自动降级为空操作
  cloneTemplate: function (templateClassName) {
    var template = document.querySelector("." + templateClassName);
    if (!template) return $();
    var fragment = template.content.cloneNode(true);
    return $(fragment.firstElementChild); // 所有 template 均为单根结构
  },

  // ============== API 调用包装 ==============
  // 统一加超时兜底，防止 Portal 函数永不回调时页面卡死。
  apiCall: function (fn, args, callback) {
    var done = false;
    var timer = setTimeout(function () {
      if (done) return;
      done = true;
      callback({ code: -1, msg: "请求超时，请重试" });
    }, KeyComponentChange.API_TIMEOUT);
    args = args || [];
    fn.apply(null, args.concat([function (res) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      callback(res);
    }]));
  },

  /** 本页接口统一入参形态：{ taskType, reported } */
  buildTaskRequest: function (taskType, reported) {
    return { taskType: taskType, reported: reported };
  },

  // ============== 时间与格式化 ==============
  now: function () {
    var d = new Date();
    var pad = function (n) { return n < 10 ? "0" + n : n; };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " +
      pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  },

  /** 扫描时间统一为 "YYYY-MM-DD HH:mm:ss"（兼容 ISO 的 T 分隔），显示与排序共用 */
  normalizeTime: function (value) {
    return String(value || "").replace("T", " ").trim();
  },

  getOrderTypeLabel: function (wipOrderType) {
    if (String(wipOrderType) === "1") return "生产订单";
    if (String(wipOrderType) === "2") return "改制订单";
    return "";
  },

  /** 订单号展示统一带订单类型标注（涉及订单号展示的地方都用它） */
  formatOrderNo: function (wipOrderNo, wipOrderType) {
    var orderTypeLabel = KeyComponentChange.getOrderTypeLabel(wipOrderType);
    if (!wipOrderNo) return "";
    return orderTypeLabel ? wipOrderNo + "（" + orderTypeLabel + "）" : String(wipOrderNo);
  },

  getMotorPositionLabel: function (materialSequence) {
    if (String(materialSequence) === "1") return "前电机";
    if (String(materialSequence) === "2") return "后电机";
    return "";
  },

  // ============== 消息提示 ==============
  /** 非阻断提示：3 秒自动消失，也可点击提前关闭 */
  showToast: function (title, content, type) {
    if (KeyComponentChange._toastTimer) {
      clearTimeout(KeyComponentChange._toastTimer);
      KeyComponentChange._toastTimer = null;
    }
    $(".toast-title").text(title);
    $(".toast-content").text(content).removeClass("hidden");
    $(".template-toast .toast-icon-error").toggleClass("hidden", type !== "error");
    $(".template-toast .toast-icon-success").toggleClass("hidden", type === "error");
    $(".template-toast").removeClass("hidden");
    KeyComponentChange._toastTimer = setTimeout(function () {
      KeyComponentChange.hideToast();
    }, 3000);
  },

  hideToast: function () {
    if (KeyComponentChange._toastTimer) {
      clearTimeout(KeyComponentChange._toastTimer);
      KeyComponentChange._toastTimer = null;
    }
    $(".template-toast").addClass("hidden");
  },

  showLoading: function (text) {
    KeyComponentChange._loadingCount++;
    $(".loading-text").text(text || "加载中...");
    $(".template-loading").removeClass("hidden");
  },

  hideLoading: function () {
    KeyComponentChange._loadingCount = Math.max(0, KeyComponentChange._loadingCount - 1);
    if (KeyComponentChange._loadingCount === 0) {
      $(".template-loading").addClass("hidden");
    }
  },

  showConfirmDialog: function (message, onConfirm) {
    $(".template-confirm .confirm-content").text(message);
    $(".template-confirm").data("on-confirm", onConfirm).removeClass("hidden");
  },

  // ============== 扫码 ==============
  doScan: function (inputSelector, callback) {
    try {
      if (window.parent && typeof window.parent.OpenCamera === "function") {
        window.parent.OpenCamera(function (res) {
          var value = res.data || res.value || (typeof res === "string" ? res : "");
          if (value) {
            $(inputSelector).val(value);
            callback();
          }
        });
        return;
      }
    } catch (e) {
      // 跨域访问 window.parent 会抛 SecurityError
    }
    KeyComponentChange.showToast("提示", "扫码功能仅在移动端可用，请手动输入", "error");
  },

  // ============== 按钮开关（§8.11：每个按钮独立显示/权限开关） ==============
  /** 统一应用显示开关与权限开关；循环结构渲染后必须重放一次 */
  applyButtonSwitch: function () {
    var buttonSelector = KeyComponentChange.BUTTON_SELECTOR;
    var buttonSwitch = KeyComponentChange.BUTTON_SWITCH;
    Object.keys(buttonSelector).forEach(function (buttonName) {
      var setting = buttonSwitch[buttonName];
      if (!setting) return;
      var $buttons = $(buttonSelector[buttonName]);
      if (buttonName !== "unbind") {
        $buttons.toggleClass("hidden", !setting.visible);
      }
      $buttons.prop("disabled", !setting.permitted).toggleClass("disabled", !setting.permitted);
    });
    KeyComponentChange.updateUnbindButton();
  },

  /** 解绑按钮：业务条件（改制订单且需解绑总数 > 已解绑数）与开关取交集 */
  updateUnbindButton: function () {
    var state = KeyComponentChange.state;
    var orderInfo = state.orderInfo;
    var isChangeOrder = !!orderInfo && String(orderInfo.wipOrderType) === "2";
    var setting = KeyComponentChange.BUTTON_SWITCH.unbind;
    var visible = isChangeOrder && state.needRemoveQty > state.removeQty && setting.visible;
    $(".btn-unbind")
      .toggleClass("hidden", !visible)
      .prop("disabled", !setting.permitted)
      .toggleClass("disabled", !setting.permitted);
  },

  // ============== 视图切换 ==============
  switchView: function (viewClassName) {
    $(".key-component-check-view, .key-component-remove-view, .key-component-change-view").addClass("hidden");
    $("." + viewClassName).removeClass("hidden");
  },

  /**
   * 聚焦二维码输入框并抑制软键盘：聚焦瞬间临时只读，聚焦后解锁。
   * 程序化聚焦不弹键盘；输入框平时保持可编辑，扫码枪可直接键入；手动点击照常弹键盘。
   */
  focusMaterialInput: function () {
    var $input = $(".input-material-qr");
    $input.prop("readonly", true);
    $input.focus();
    setTimeout(function () {
      $input.prop("readonly", false);
    }, 150);
  },

  clearMaterialInput: function () {
    $(".input-material-qr").val("").blur();
    setTimeout(function () {
      KeyComponentChange.focusMaterialInput();
    }, 0);
  },

  setInputSource: function (inputType, inputCode) {
    KeyComponentChange.state.inputSource = { inputType: inputType, inputCode: inputCode };
  },

  // ============== 视图1：订单查询 ==============
  /** 订单号/VIN 共用一个输入框：纯数字视为订单号，17 位非纯数字视为 VIN */
  getOrderSearchPayload: function (searchKey) {
    if (/^[0-9]+$/.test(searchKey)) return { wipOrderNo: searchKey, vin: "" };
    if (/^[A-Za-z0-9]{17}$/.test(searchKey)) return { wipOrderNo: "", vin: searchKey };
    return { wipOrderNo: searchKey, vin: "" };
  },

  queryOrderInfo: function () {
    var searchKey = ($(".input-order-key").val() || "").trim();
    if (!searchKey) {
      KeyComponentChange.showToast("提示", "请输入订单号或VIN", "error");
      return;
    }
    KeyComponentChange.showLoading("查询订单中...");
    KeyComponentChange.apiCall(
      window.KeyComponentChange_GetWipOrderNoInfo,
      [KeyComponentChange.buildTaskRequest("GetWipOrderNoInfo", KeyComponentChange.getOrderSearchPayload(searchKey))],
      function (res) {
        KeyComponentChange.hideLoading();
        if (res.code !== 0) {
          KeyComponentChange.showToast("查询失败", res.msg || "查询订单信息失败", "error");
          return;
        }
        var orderInfo = res.data || {};
        KeyComponentChange.state.orderInfo = orderInfo;
        $(".order-no-tag").text(KeyComponentChange.formatOrderNo(orderInfo.wipOrderNo, orderInfo.wipOrderType));
        $(".input-material-qr").val("");
        KeyComponentChange.loadKeyComponentInfo(function () {
          KeyComponentChange.focusMaterialInput();
        });
      },
    );
  },

  // ============== 视图1：关重件列表 ==============
  loadKeyComponentInfo: function (finishedCallback) {
    var orderInfo = KeyComponentChange.state.orderInfo;
    if (!orderInfo) return;
    KeyComponentChange.showLoading("加载关重件中...");
    KeyComponentChange.apiCall(
      window.KeyComponentChange_GetKeyComponentInfo,
      [KeyComponentChange.buildTaskRequest("GetKeyComponentInfo", {
        wipOrderNo: orderInfo.wipOrderNo,
        wipOrderType: orderInfo.wipOrderType,
      })],
      function (res) {
        KeyComponentChange.hideLoading();
        if (res.code !== 0) {
          KeyComponentChange.showToast("加载失败", res.msg || "获取关重件信息失败", "error");
          return;
        }
        var data = res.data || {};
        KeyComponentChange.state.keyComponentList = data.keyComponentList || [];
        KeyComponentChange.state.serialList = data.snList || [];
        KeyComponentChange.state.removeQty = data.removeQty || 0;
        KeyComponentChange.state.needRemoveQty = data.needRemoveQty || 0;
        KeyComponentChange.renderKeyComponentList();
        if (typeof finishedCallback === "function") finishedCallback();
      },
    );
  },

  sumMaterialQty: function (keyComponentList) {
    return keyComponentList.reduce(function (total, component) {
      return total + (Number(component.materialQty) || 0);
    }, 0);
  },

  /** 卡内序列号排序：扫描时间倒序（无时间排最后），同时间按关重件序号升序 */
  compareSerialByScanTime: function (left, right) {
    var leftTime = KeyComponentChange.normalizeTime(left.scanTime);
    var rightTime = KeyComponentChange.normalizeTime(right.scanTime);
    if (leftTime !== rightTime) {
      if (!leftTime) return 1;
      if (!rightTime) return -1;
      return leftTime < rightTime ? 1 : -1;
    }
    var leftSequence = String(left.materialSeq === null || left.materialSeq === undefined ? "" : left.materialSeq);
    var rightSequence = String(right.materialSeq === null || right.materialSeq === undefined ? "" : right.materialSeq);
    if (leftSequence === rightSequence) return 0;
    return leftSequence < rightSequence ? -1 : 1;
  },

  /** 卡片排序：按组内最新扫描时间倒序（无序列号的卡排最后），同时间按物料编码升序 */
  compareGroupByLatestScanTime: function (left, right) {
    if (left.latestScanTime !== right.latestScanTime) {
      if (!left.latestScanTime) return 1;
      if (!right.latestScanTime) return -1;
      return left.latestScanTime < right.latestScanTime ? 1 : -1;
    }
    return left.materialNo < right.materialNo ? -1 : 1;
  },

  /** 相同关重件物料编码合并为一张卡；序列号按 materialID 归属到配置条目 */
  groupKeyComponentList: function (keyComponentList, serialList) {
    var groups = [];
    keyComponentList.forEach(function (component) {
      var group = null;
      groups.forEach(function (item) {
        if (item.materialNo === component.materialNo) group = item;
      });
      if (!group) {
        group = {
          materialNo: component.materialNo,
          materialDesc: component.materialDesc,
          materialType: component.materialType,
          materialQty: 0,
          materialIds: [],
          serialList: [],
          latestScanTime: "",
        };
        groups.push(group);
      }
      group.materialQty += Number(component.materialQty) || 0;
      if (group.materialIds.indexOf(component.materialID) === -1) {
        group.materialIds.push(component.materialID);
      }
    });
    groups.forEach(function (group) {
      group.serialList = serialList.filter(function (serial) {
        return group.materialIds.indexOf(serial.materialID) !== -1;
      }).sort(KeyComponentChange.compareSerialByScanTime);
      group.latestScanTime = group.serialList.length
        ? KeyComponentChange.normalizeTime(group.serialList[0].scanTime)
        : "";
    });
    return groups.sort(KeyComponentChange.compareGroupByLatestScanTime);
  },

  renderKeyComponentList: function () {
    var state = KeyComponentChange.state;
    var orderInfo = state.orderInfo;
    var isChangeOrder = !!orderInfo && String(orderInfo.wipOrderType) === "2";
    var groups = KeyComponentChange.groupKeyComponentList(state.keyComponentList, state.serialList);

    $(".key-component-list .key-component-card").remove();
    $(".empty-key-component").toggleClass("hidden", groups.length > 0);
    $(".collect-quantity-tag").text(state.serialList.length + "/" + KeyComponentChange.sumMaterialQty(state.keyComponentList));
    $(".remove-quantity-tag").text(state.removeQty + "/" + state.needRemoveQty);
    $(".remove-quantity-row").toggleClass("hidden", !isChangeOrder);

    groups.forEach(function (group) {
      var $card = KeyComponentChange.cloneTemplate("template-key-component-card");
      $card.find(".key-component-material-no").text(group.materialNo);
      $card.find(".key-component-material-desc").text(group.materialDesc);
      $card.find(".key-component-material-type").text(group.materialType).toggleClass("hidden", !group.materialType);
      $card.find(".key-component-quantity").text(group.serialList.length + "/" + group.materialQty);
      group.serialList.forEach(function (serial) {
        var $row = KeyComponentChange.cloneTemplate("template-serial-row");
        var motorPositionLabel = KeyComponentChange.getMotorPositionLabel(serial.materialSeq);
        $row.find(".serial-no").text(serial.serialNo);
        $row.find(".motor-position").text(motorPositionLabel).toggleClass("hidden", !motorPositionLabel);
        $row.find(".scan-time").text(KeyComponentChange.normalizeTime(serial.scanTime));
        $row.data("serial-no", serial.serialNo);
        $card.find(".key-component-serial-list").append($row);
      });
      $(".key-component-list").append($card);
    });

    KeyComponentChange.applyButtonSwitch();
  },

  // ============== 视图1：物料二维码采集 ==============
  /** 二维码格式：物料编码|供应商|序列号:数量；任一段为空或数量非正数视为格式错误 */
  parseMaterialQrCode: function (qrText) {
    var segments = qrText.split("|");
    if (segments.length !== 3) return null;
    var materialNo = segments[0].trim();
    var partner = segments[1].trim();
    var serialSegments = segments[2].split(":");
    if (serialSegments.length !== 2) return null;
    var materialSerialNo = serialSegments[0].trim();
    var quantityText = serialSegments[1].trim();
    var materialQty = parseFloat(quantityText);
    if (!materialNo || !partner || !materialSerialNo || !quantityText) return null;
    if (isNaN(materialQty) || materialQty <= 0) return null;
    return {
      materialNo: materialNo,
      partner: partner,
      materialSerialNo: materialSerialNo,
      materialQty: materialQty,
    };
  },

  findMatchedComponents: function (materialNo) {
    return KeyComponentChange.state.keyComponentList.filter(function (component) {
      return component.materialNo === materialNo;
    });
  },

  getCollectedSequenceList: function (materialIds) {
    return KeyComponentChange.state.serialList.filter(function (serial) {
      return materialIds.indexOf(serial.materialID) !== -1 && serial.materialSeq !== null && serial.materialSeq !== undefined && String(serial.materialSeq) !== "";
    }).map(function (serial) {
      return String(serial.materialSeq);
    });
  },

  /** 同一物料编码的已扫描/需扫描数量（配置可能多条，如永磁体同步电机） */
  getMaterialQuantityState: function (matchedComponents) {
    var materialIds = matchedComponents.map(function (component) { return component.materialID; });
    var collectedQuantity = KeyComponentChange.state.serialList.filter(function (serial) {
      return materialIds.indexOf(serial.materialID) !== -1;
    }).length;
    return {
      collectedQuantity: collectedQuantity,
      requiredQuantity: KeyComponentChange.sumMaterialQty(matchedComponents),
    };
  },

  isSerialCollected: function (materialSerialNo) {
    return KeyComponentChange.state.serialList.some(function (serial) {
      return serial.serialNo === materialSerialNo;
    });
  },

  /**
   * 关重件序号判定：序号为字符串（"1" 前电机 / "2" 后电机）。单条配置直接取配置序号；
   * 永磁体同步电机两条配置且序号恰为 1、2 且未满量时自动分配尚未采集的那个；
   * 序号不明确或已满量（更换）时弹窗人工选择前/后电机。
   */
  resolveMaterialSequence: function (matchedComponents, allowCollectedSequence, chosenCallback) {
    if (matchedComponents.length === 1) {
      chosenCallback(matchedComponents[0].materialSeq);
      return;
    }
    var materialIds = matchedComponents.map(function (component) { return component.materialID; });
    var collectedSequenceList = KeyComponentChange.getCollectedSequenceList(materialIds);
    var configuredSequenceList = matchedComponents.map(function (component) { return String(component.materialSeq); });
    var isClearMotorPair = matchedComponents.length === 2 &&
      configuredSequenceList.indexOf("1") !== -1 && configuredSequenceList.indexOf("2") !== -1;
    if (isClearMotorPair && !allowCollectedSequence) {
      var freeSequence = KeyComponentChange.getMotorSequenceList().filter(function (sequence) {
        return collectedSequenceList.indexOf(sequence) === -1;
      })[0];
      if (freeSequence === undefined) {
        KeyComponentChange.showToast("提示", "前/后电机均已采集", "error");
        return;
      }
      chosenCallback(freeSequence);
      return;
    }
    KeyComponentChange.showMotorPicker(collectedSequenceList, allowCollectedSequence, chosenCallback);
  },

  /** 电机位置序号（字符串，与接口一致） */
  getMotorSequenceList: function () {
    return ["1", "2"];
  },

  /** allowCollectedSequence：已采集的位置也可选（满量后走更换流程，替换该位置的旧件） */
  showMotorPicker: function (collectedSequenceList, allowCollectedSequence, onPick) {
    var availableSequenceList = KeyComponentChange.getMotorSequenceList().filter(function (sequence) {
      return allowCollectedSequence || collectedSequenceList.indexOf(sequence) === -1;
    });
    if (!availableSequenceList.length) {
      KeyComponentChange.showToast("提示", "前/后电机均已采集", "error");
      return;
    }
    var $list = $(".motor-picker-list").empty();
    KeyComponentChange.getMotorSequenceList().forEach(function (sequence) {
      var isDisabled = !allowCollectedSequence && collectedSequenceList.indexOf(sequence) !== -1;
      var $option = KeyComponentChange.cloneTemplate("template-motor-option");
      $option.find(".motor-option-label").text(KeyComponentChange.getMotorPositionLabel(sequence));
      $option.toggleClass("disabled", isDisabled);
      $option.data("material-sequence", sequence);
      $list.append($option);
    });
    $(".template-motor-picker").data("on-pick", onPick).removeClass("hidden");
  },

  handleMaterialCheck: function () {
    var state = KeyComponentChange.state;
    if (!state.orderInfo) {
      KeyComponentChange.showToast("提示", "请先查询订单信息", "error");
      return;
    }
    var qrText = ($(".input-material-qr").val() || "").trim();
    if (!qrText) {
      KeyComponentChange.showToast("提示", "请输入或扫码物料二维码", "error");
      return;
    }
    var parsedQrCode = KeyComponentChange.parseMaterialQrCode(qrText);
    if (!parsedQrCode) {
      KeyComponentChange.showToast("提示", "二维码格式不正确（物料编码|供应商|序列号:数量）", "error");
      return;
    }
    var matchedComponents = KeyComponentChange.findMatchedComponents(parsedQrCode.materialNo);
    if (!matchedComponents.length) {
      KeyComponentChange.showToast("提示", parsedQrCode.materialNo + " 不是本订单关重件", "error");
      return;
    }
    if (KeyComponentChange.isSerialCollected(parsedQrCode.materialSerialNo)) {
      KeyComponentChange.showToast("提示", "该序列号已采集", "error");
      return;
    }
    var quantityState = KeyComponentChange.getMaterialQuantityState(matchedComponents);
    var isMaterialFull = quantityState.collectedQuantity >= quantityState.requiredQuantity;
    KeyComponentChange.resolveMaterialSequence(matchedComponents, isMaterialFull, function (materialSequence) {
      if (isMaterialFull) {
        KeyComponentChange.startMaterialChange(parsedQrCode, materialSequence);
        return;
      }
      KeyComponentChange.checkAndSave(parsedQrCode, materialSequence);
    });
  },

  buildPendingScan: function (parsedQrCode, materialSequence) {
    var inputSource = KeyComponentChange.state.inputSource;
    var component = KeyComponentChange.findMatchedComponents(parsedQrCode.materialNo)[0] || {};
    var isSequenceEmpty = materialSequence === null || materialSequence === undefined || materialSequence === "";
    return {
      materialID: component.materialID,
      materialNo: parsedQrCode.materialNo,
      materialDesc: component.materialDesc || "",
      materialSeq: isSequenceEmpty ? null : String(materialSequence),
      materialSerialNo: parsedQrCode.materialSerialNo,
      materialQty: parsedQrCode.materialQty,
      uomCode: component.uomCode || "",
      partner: parsedQrCode.partner,
      inputType: inputSource.inputType,
      inputCode: inputSource.inputCode,
    };
  },

  checkAndSave: function (parsedQrCode, materialSequence) {
    KeyComponentChange.state.pendingScan = KeyComponentChange.buildPendingScan(parsedQrCode, materialSequence);
    KeyComponentChange.submitCheckAndSave();
  },

  /** 该关重件已采集满：本次扫描不再直接入库，直接进入更换页由操作员指定被替换的旧件 */
  startMaterialChange: function (parsedQrCode, materialSequence) {
    KeyComponentChange.state.pendingScan = KeyComponentChange.buildPendingScan(parsedQrCode, materialSequence);
    KeyComponentChange.enterChangeView();
  },

  /** CheckAndSave / Save 共用报文字段（订单物料 + 本次扫描的关重件） */
  buildCheckReported: function (pendingScan) {
    var orderInfo = KeyComponentChange.state.orderInfo;
    return {
      wipOrderNo: orderInfo.wipOrderNo,
      wipOrderType: orderInfo.wipOrderType,
      productID: orderInfo.productID,
      productNo: orderInfo.productNo,
      productDesc: orderInfo.productDesc,
      serialNo: orderInfo.serialNo,
      materialID: pendingScan.materialID,
      materialNo: pendingScan.materialNo,
      materialDesc: pendingScan.materialDesc,
      materialSeq: pendingScan.materialSeq,
      materialSerialNo: pendingScan.materialSerialNo,
      materialQty: pendingScan.materialQty,
      uomCode: pendingScan.uomCode,
      partner: pendingScan.partner,
      inputType: pendingScan.inputType,
      inputCode: pendingScan.inputCode,
    };
  },

  submitCheckAndSave: function () {
    var state = KeyComponentChange.state;
    var reported = KeyComponentChange.buildCheckReported(state.pendingScan);
    KeyComponentChange.showLoading("提交中...");
    KeyComponentChange.apiCall(
      window.KeyComponentChange_CheckAndSave,
      [KeyComponentChange.buildTaskRequest("CheckAndSave", reported)],
      function (res) {
        KeyComponentChange.hideLoading();
        if (res.code !== 0) {
          KeyComponentChange.showToast("提交失败", res.msg || "保存关重件失败", "error");
          return;
        }
        // isChange = 1：本次不保存，进入更换页由操作员指定被替换的旧件
        if (String((res.data || {}).isChange) === "1") {
          KeyComponentChange.enterChangeView();
          return;
        }
        KeyComponentChange.showToast("提示", "采集成功", "success");
        KeyComponentChange.loadKeyComponentInfo(function () {
          KeyComponentChange.clearMaterialInput();
        });
      },
    );
  },

  removeSerial: function (materialSerialNo) {
    var state = KeyComponentChange.state;
    var orderInfo = state.orderInfo;
    if (!orderInfo || !materialSerialNo) return;
    KeyComponentChange.showConfirmDialog("确认删除关重件序列号 " + materialSerialNo + " ？", function () {
      KeyComponentChange.showLoading("删除中...");
      KeyComponentChange.apiCall(
        window.KeyComponentChange_Remove,
        [KeyComponentChange.buildTaskRequest("Remove", {
          wipOrderNo: orderInfo.wipOrderNo,
          wipOrderType: orderInfo.wipOrderType,
          serialNo: orderInfo.serialNo,
          materialSerialNo: materialSerialNo,
        })],
        function (res) {
          KeyComponentChange.hideLoading();
          if (res.code !== 0) {
            KeyComponentChange.showToast("删除失败", res.msg || "删除关重件失败", "error");
            return;
          }
          KeyComponentChange.showToast("提示", "删除成功", "success");
          KeyComponentChange.loadKeyComponentInfo();
        },
      );
    });
  },

  completeCheck: function () {
    var state = KeyComponentChange.state;
    state.orderInfo = null;
    state.keyComponentList = [];
    state.serialList = [];
    state.removeQty = 0;
    state.needRemoveQty = 0;
    state.pendingScan = null;
    state.changedOldGenealogyId = null;
    $(".order-no-tag").text("");
    $(".input-order-key").val("");
    $(".input-material-qr").val("");
    $(".key-component-list .key-component-card").remove();
    $(".empty-key-component").removeClass("hidden");
    $(".collect-quantity-tag").text("");
    $(".remove-quantity-tag").text("");
    $(".remove-quantity-row").addClass("hidden");
    KeyComponentChange.switchView("key-component-check-view");
    KeyComponentChange.applyButtonSwitch();
    setTimeout(function () {
      $(".input-order-key").focus();
    }, 0);
  },

  // ============== 视图2：关重件移除 ==============
  enterRemoveView: function () {
    var orderInfo = KeyComponentChange.state.orderInfo;
    if (!orderInfo) return;
    $(".remove-order-no-tag").text(KeyComponentChange.formatOrderNo(orderInfo.wipOrderNo, orderInfo.wipOrderType));
    KeyComponentChange.switchView("key-component-remove-view");
    KeyComponentChange.loadRemoveRecordList();
  },

  loadRemoveRecordList: function () {
    var orderInfo = KeyComponentChange.state.orderInfo;
    if (!orderInfo) return;
    KeyComponentChange.showLoading("加载移除明细中...");
    KeyComponentChange.apiCall(
      window.KeyComponentChange_GetRemoveKeyComponentInfo,
      [KeyComponentChange.buildTaskRequest("GetRemoveKeyComponentInfo", {
        wipOrderNo: orderInfo.wipOrderNo,
        wipOrderType: orderInfo.wipOrderType,
      })],
      function (res) {
        KeyComponentChange.hideLoading();
        if (res.code !== 0) {
          KeyComponentChange.showToast("加载失败", res.msg || "获取移除明细失败", "error");
          return;
        }
        KeyComponentChange.renderRemoveRecordList(Array.isArray(res.data) ? res.data : []);
      },
    );
  },

  renderRemoveRecordList: function (recordList) {
    $(".remove-record-list .remove-record-card").remove();
    $(".empty-remove-record").toggleClass("hidden", recordList.length > 0);
    recordList.forEach(function (record) {
      var $card = KeyComponentChange.cloneTemplate("template-remove-record-card");
      $card.find(".remove-record-order-no").text(KeyComponentChange.formatOrderNo(record.wipOrderNo, record.wipOrderType));
      $card.find(".remove-record-material-no").text(record.materialNo || "");
      $card.find(".remove-record-material-desc").text(record.materialDesc || "");
      $card.find(".remove-record-old-serial").text(record.materialSerialNo || "");
      $card.find(".remove-record-scan-time").text(KeyComponentChange.normalizeTime(record.scanTime));
      $card.data("record", record);
      $(".remove-record-list").append($card);
    });
    KeyComponentChange.applyButtonSwitch();
  },

  removeRecord: function (record) {
    if (!record) return;
    KeyComponentChange.showConfirmDialog("确认移除关重件旧序列号 " + (record.materialSerialNo || "") + " ？", function () {
      KeyComponentChange.showLoading("移除中...");
      KeyComponentChange.apiCall(
        window.KeyComponentChange_Remove,
        [KeyComponentChange.buildTaskRequest("Remove", {
          wipOrderNo: record.wipOrderNo,
          wipOrderType: record.wipOrderType,
          serialNo: record.serialNo,
          materialSerialNo: record.materialSerialNo,
        })],
        function (res) {
          KeyComponentChange.hideLoading();
          if (res.code !== 0) {
            KeyComponentChange.showToast("移除失败", res.msg || "移除关重件失败", "error");
            return;
          }
          KeyComponentChange.showToast("提示", "移除成功", "success");
          // 删除后刷新订单数据（需解绑数量、卡片列表）与待移除清单
          KeyComponentChange.loadKeyComponentInfo();
          KeyComponentChange.loadRemoveRecordList();
        },
      );
    });
  },

  // ============== 视图3：关重件更换 ==============
  enterChangeView: function () {
    var state = KeyComponentChange.state;
    var orderInfo = state.orderInfo;
    var pendingScan = state.pendingScan;
    if (!orderInfo || !pendingScan) return;
    $(".change-material-tag").text(
      KeyComponentChange.formatOrderNo(orderInfo.wipOrderNo, orderInfo.wipOrderType) + "-" +
      pendingScan.materialNo + "-" + pendingScan.materialDesc
    );
    $(".new-serial-tag").text(pendingScan.materialSerialNo);
    KeyComponentChange.switchView("key-component-change-view");
    KeyComponentChange.loadChangeRecordList();
  },

  loadChangeRecordList: function () {
    var state = KeyComponentChange.state;
    var orderInfo = state.orderInfo;
    if (!orderInfo || !state.pendingScan) return;
    KeyComponentChange.showLoading("加载更换明细中...");
    KeyComponentChange.apiCall(
      window.KeyComponentChange_GetChangeKeyComponentInfo,
      [KeyComponentChange.buildTaskRequest("GetChangeKeyComponentInfo", {
        wipOrderNo: orderInfo.wipOrderNo,
        wipOrderType: orderInfo.wipOrderType,
        materialNo: state.pendingScan.materialNo,
      })],
      function (res) {
        KeyComponentChange.hideLoading();
        if (res.code !== 0) {
          KeyComponentChange.showToast("加载失败", res.msg || "获取更换明细失败", "error");
          return;
        }
        KeyComponentChange.renderChangeRecordList(Array.isArray(res.data) ? res.data : []);
      },
    );
  },

  renderChangeRecordList: function (recordList) {
    $(".change-record-list .change-record-card").remove();
    $(".empty-change-record").toggleClass("hidden", recordList.length > 0);
    recordList.forEach(function (record) {
      var $card = KeyComponentChange.cloneTemplate("template-change-record-card");
      $card.find(".change-record-order-no").text(KeyComponentChange.formatOrderNo(record.wipOrderNo, record.wipOrderType));
      $card.find(".change-record-old-serial").text(record.materialSerialNo || "");
      $card.find(".change-record-scan-time").text(KeyComponentChange.normalizeTime(record.scanTime));
      $card.data("record", record);
      $(".change-record-list").append($card);
    });
    KeyComponentChange.applyButtonSwitch();
  },

  changeRecord: function (record) {
    var state = KeyComponentChange.state;
    if (!record || !state.pendingScan) return;
    KeyComponentChange.showConfirmDialog(
      "确认将旧序列号 " + (record.materialSerialNo || "") + " 更换为 " + state.pendingScan.materialSerialNo + " ？",
      function () {
        // 上一次已移除成功但保存失败：跳过移除，直接用已拿到的 oldGenealogyID 重试保存
        if (state.changedOldGenealogyId) {
          KeyComponentChange.saveChangedKeyComponent();
          return;
        }
        KeyComponentChange.showLoading("移除旧件中...");
        KeyComponentChange.apiCall(
          window.KeyComponentChange_Remove,
          [KeyComponentChange.buildTaskRequest("Remove", {
            wipOrderNo: record.wipOrderNo,
            wipOrderType: record.wipOrderType,
            serialNo: record.serialNo,
            materialSerialNo: record.materialSerialNo,
          })],
          function (res) {
            KeyComponentChange.hideLoading();
            if (res.code !== 0) {
              KeyComponentChange.showToast("移除失败", res.msg || "移除关重件失败", "error");
              return;
            }
            state.changedOldGenealogyId = (res.data || {}).oldGenealogyID;
            // 删除旧件后立即刷新订单数据（数量与卡片），保存新件后再刷新一次
            KeyComponentChange.loadKeyComponentInfo();
            KeyComponentChange.saveChangedKeyComponent();
          },
        );
      },
    );
  },

  saveChangedKeyComponent: function () {
    var state = KeyComponentChange.state;
    if (!state.pendingScan) return;
    var reported = KeyComponentChange.buildCheckReported(state.pendingScan);
    reported.oldGenealogyID = state.changedOldGenealogyId;
    KeyComponentChange.showLoading("保存新件中...");
    KeyComponentChange.apiCall(
      window.KeyComponentChange_Save,
      [KeyComponentChange.buildTaskRequest("Save", reported)],
      function (res) {
        KeyComponentChange.hideLoading();
        if (res.code !== 0) {
          KeyComponentChange.showToast("保存失败", "移除成功，保存失败，请重试", "error");
          return;
        }
        state.pendingScan = null;
        state.changedOldGenealogyId = null;
        KeyComponentChange.showToast("提示", "更换成功", "success");
        KeyComponentChange.switchView("key-component-check-view");
        KeyComponentChange.loadKeyComponentInfo(function () {
          KeyComponentChange.clearMaterialInput();
        });
      },
    );
  },

  backToCheckView: function () {
    var state = KeyComponentChange.state;
    state.pendingScan = null;
    state.changedOldGenealogyId = null;
    KeyComponentChange.switchView("key-component-check-view");
    KeyComponentChange.loadKeyComponentInfo(function () {
      KeyComponentChange.clearMaterialInput();
    });
  },

  // ============== 页面尺寸（表单宿主无高度链时按视口自适应，避免整页滚动条） ==============
  fitPageHeight: function () {
    var $root = $(".mom-key-component-change");
    if (!$root.length) return;
    var availableHeight = $(window).height() - $root.offset().top;
    $root.css("height", Math.max(240, availableHeight) + "px");
  },

  // ============== 事件绑定（一次性委托，页面加载时执行） ==============
  initEvents: function () {
    // 键盘统一入口：回车按当前输入框触发对应动作（输入法组字中的回车不响应）
    $(".mom-key-component-change").on("keydown", "input", function (e) {
      var $input = $(this);
      var originalEvent = e.originalEvent || e;
      if (originalEvent.isComposing || e.keyCode === 229) return;
      if (e.key !== "Enter") return;

      e.preventDefault();
      if ($input.hasClass("input-order-key")) {
        KeyComponentChange.queryOrderInfo();
      } else if ($input.hasClass("input-material-qr")) {
        KeyComponentChange.setInputSource("手输", 13);
        KeyComponentChange.handleMaterialCheck();
      }
    });

    // 视图1：动作只由 回车/搜索按钮/扫码按钮 触发（失焦不触发任何动作）
    $(".key-component-check-view").on("click", ".btn-search-order", function () {
      KeyComponentChange.queryOrderInfo();
    });
    $(".key-component-check-view").on("click", ".btn-scan-order", function () {
      KeyComponentChange.doScan(".input-order-key", function () {
        KeyComponentChange.queryOrderInfo();
      });
    });
    $(".key-component-check-view").on("click", ".btn-search-material", function () {
      KeyComponentChange.setInputSource("手输", 1);
      KeyComponentChange.handleMaterialCheck();
    });
    $(".key-component-check-view").on("click", ".btn-scan-material", function () {
      KeyComponentChange.doScan(".input-material-qr", function () {
        KeyComponentChange.setInputSource("扫码", 1);
        KeyComponentChange.handleMaterialCheck();
      });
    });
    $(".key-component-check-view").on("click", ".btn-delete-serial", function () {
      KeyComponentChange.removeSerial($(this).closest(".serial-row").data("serial-no"));
    });
    $(".key-component-check-view").on("click", ".btn-unbind", function () {
      KeyComponentChange.enterRemoveView();
    });
    $(".key-component-check-view").on("click", ".btn-complete", function () {
      KeyComponentChange.completeCheck();
    });

    // 视图2 / 视图3
    $(".key-component-remove-view").on("click", ".btn-remove-row", function () {
      KeyComponentChange.removeRecord($(this).closest(".remove-record-card").data("record"));
    });
    $(".key-component-remove-view").on("click", ".btn-back-remove", function () {
      KeyComponentChange.backToCheckView();
    });
    $(".key-component-change-view").on("click", ".btn-change-row", function () {
      KeyComponentChange.changeRecord($(this).closest(".change-record-card").data("record"));
    });
    $(".key-component-change-view").on("click", ".btn-back-change", function () {
      KeyComponentChange.backToCheckView();
    });

    // 按钮按下不夺焦点，避免点击时输入框闪失焦
    $(".mom-key-component-change").on("mousedown", "button", function (e) {
      e.preventDefault();
    });

    // 二次确认
    $(".template-confirm").on("click", function (e) {
      if (e.target === this) {
        $(".template-confirm").addClass("hidden").removeData("on-confirm");
        return;
      }
      if ($(e.target).hasClass("confirm-btn-cancel")) {
        $(".template-confirm").addClass("hidden").removeData("on-confirm");
        return;
      }
      if ($(e.target).hasClass("confirm-btn-ok")) {
        var onConfirm = $(".template-confirm").data("on-confirm");
        $(".template-confirm").addClass("hidden").removeData("on-confirm");
        if (typeof onConfirm === "function") onConfirm();
      }
    });

    // 前电机/后电机选择
    $(".motor-picker-list").on("click", ".motor-option", function () {
      if ($(this).hasClass("disabled")) return;
      var onPick = $(".template-motor-picker").data("on-pick");
      var materialSequence = $(this).data("material-sequence");
      $(".template-motor-picker").addClass("hidden").removeData("on-pick");
      if (typeof onPick === "function") onPick(materialSequence);
    });
    $(".template-motor-picker").on("click", function (e) {
      if (e.target === this || $(e.target).hasClass("picker-btn")) {
        $(".template-motor-picker").addClass("hidden").removeData("on-pick");
        KeyComponentChange.clearMaterialInput();
      }
    });

    // Toast：点击遮罩或确定按钮关闭
    $(".template-toast").on("click", function (e) {
      if (e.target === this || $(e.target).hasClass("toast-btn")) {
        KeyComponentChange.hideToast();
      }
    });
  },

  // ============== 页面初始化 ==============
  initPage: function () {
    // Portal 表单环境：HTML 片段可能晚于 JS 就绪注入，先等根容器出现再初始化（选择器空集合会崩）
    if (!$(".mom-key-component-change").length) {
      KeyComponentChange._initRetryCount++;
      if (KeyComponentChange._initRetryCount > 100) return;
      setTimeout(function () {
        KeyComponentChange.initPage();
      }, 50);
      return;
    }

    var now = KeyComponentChange.now;
    $(".header-time").text(now());
    setInterval(function () {
      $(".header-time").text(now());
    }, 1000);

    KeyComponentChange.initEvents();
    KeyComponentChange.applyButtonSwitch();
    KeyComponentChange.renderKeyComponentList();
    KeyComponentChange.fitPageHeight();
    $(window).on("resize", function () {
      KeyComponentChange.fitPageHeight();
    });
    setTimeout(function () {
      $(".input-order-key").focus();
    }, 0);
  },
};

// ============== 启动 ==============
$(function () {
  KeyComponentChange.initPage();
});
