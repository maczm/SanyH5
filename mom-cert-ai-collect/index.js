// ============== 配置 ==============
var CONFIG = {
  MAX_IMAGE_WIDTH: 3000,
  MAX_IMAGE_HEIGHT: 3000,
  JPEG_QUALITY: 0.8,
  MAX_SOURCE_FILE_SIZE: 20 * 1024 * 1024,
  API_TIMEOUT: 10000,
  RESIZE_DEBOUNCE: 150,
  TOAST_DURATION: 3000,
};

/*
 * ============== 生产对接说明 ==============
 *
 * Mock 机制：
 *   本地开发：同目录 mock.js 提供全部 Mock API 兜底（生产不部署该文件，
 *             Portal 只取 index.html / index.js / index.css 三个文件）
 *   Portal 生产：iframe 加载前向 window 注入同名真实函数，
 *   JS 通过 typeof window.xxx 非 function 类型判断自动使用真实函数
 *
 * 页面结构：全部骨架在 index.html（含弹窗预埋与 template 标签循环模板），
 *          JS 只负责克隆模板、赋值（text/val/attr）与显隐切换，不拼接 HTML。
 *
 * 各 API 说明：
 *   API 1 (查询任务) : 获取订单信息 + 子类别采集配置
 *   API 2 (图片识别) : 提交某子类别的图片，返回 pass/fail 与 AI 结论
 *   window.CertificateAiCollectOrderNo : 可选预置订单号（Portal 注入）
 *   window.parent.OpenCamera          : 扫码（Portal 父窗口注入）
 */

var BUTTON_SWITCH = {
  searchOrder: { visible: true, permitted: true, deniedMessage: "" },
  scanOrder: { visible: true, permitted: true, deniedMessage: "" },
};

var BUTTON_SELECTOR = {
  searchOrder: ".btn-search-order",
  scanOrder: ".btn-scan-order",
};

// ============== 应用命名空间 ==============
// 所有页面逻辑挂在 CertificateAiCollect 下，避免全局函数互相覆盖（Portal 同 iframe 切页场景）
var CertificateAiCollect = {
  state: {
    orderInfo: {
      orderNo: "",
      hostCode: "",
      vin: "",
      monthSequence: "",
    },
    mainCategories: [],
    currentMainIndex: 0,
    view: "detail",
    orderCollapsed: true,
    querying: false,
    submitting: false,
    readingImage: false,
    uploadKey: "",
    pendingResetKey: "",
    recognitionTokens: {},
    recognitionTokenSeed: 0,
    taskSessionId: 0,
    overallStatus: "empty",
    initialized: false,
  },

  _toastTimer: null,
  _loadingCount: 0,
  _initRetryCount: 0,

  // ============== 模板克隆 ==============
  /**
   * 克隆 template 标签骨架并返回 jQuery 对象（取根元素，保证 .data() 落在真实 DOM 节点上）
   * @param {string} templateClassName - template 元素的 class 名（不含点）
   */
  cloneTemplate: function (templateClassName) {
    var template = document.querySelector("." + templateClassName);
    if (!template) return $();
    var fragment = template.content.cloneNode(true);
    return $(fragment.firstElementChild);
  },

  // ============== 工具函数 ==============
  debounce: function (wait, callback) {
    var timer = null;
    return function () {
      var context = this;
      var args = arguments;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        callback.apply(context, args);
      }, wait);
    };
  },

  /**
   * API 调用包装：统一加超时兜底，防止 Portal 函数永不回调时页面卡死。
   * fn 为 window 注入的函数（callback 风格），args 为除 callback 外的参数数组。
   */
  apiCall: function (fn, args, callback, timeout) {
    if (typeof fn !== "function") {
      callback({ code: -1, msg: "接口未接入，请稍后重试" });
      return;
    }
    var done = false;
    var timer = setTimeout(function () {
      if (done) return;
      done = true;
      callback({ code: -1, msg: "请求超时，请重试" });
    }, timeout || CONFIG.API_TIMEOUT);
    args = args || [];
    try {
      fn.apply(
        null,
        args.concat([
          function (response) {
            if (done) return;
            done = true;
            clearTimeout(timer);
            callback(response);
          },
        ]),
      );
    } catch (error) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      callback({ code: -1, msg: "请求异常，请重试" });
    }
  },

  toText: function (value) {
    if (value === null || typeof value === "undefined") return "";
    return String(value);
  },

  toNumber: function (value, fallback) {
    var number = parseInt(value, 10);
    return isNaN(number) ? fallback : number;
  },

  toNonNegativeInt: function (value, fallback) {
    var number = parseInt(value, 10);
    if (isNaN(number) || number < 0) return fallback;
    return number;
  },

  parseBoolean: function (value) {
    return value === true || value === 1 || value === "1" || value === "true";
  },

  // ============== 加载动画（骨架预埋，仅显隐+填值；引用计数支持并发） ==============
  showLoading: function (text) {
    this._loadingCount++;
    $(".loading-text").text(text || "加载中...");
    $(".loading-mask").removeClass("hidden");
  },

  hideLoading: function () {
    this._loadingCount = Math.max(0, this._loadingCount - 1);
    if (this._loadingCount === 0) {
      $(".loading-mask").addClass("hidden");
    }
  },

  // ============== Toast（骨架预埋，3s 自动关闭） ==============
  showToast: function (title, content, type) {
    var self = this;
    if (this._toastTimer) {
      clearTimeout(this._toastTimer);
      this._toastTimer = null;
    }
    var isSuccess = type === "success";
    $(".toast-icon-success").toggleClass("hidden", !isSuccess);
    $(".toast-icon-error").toggleClass("hidden", isSuccess);
    $(".toast-title").text(title || "提示");
    $(".toast-content").text(content || "");
    $(".toast-mask").removeClass("hidden");
    this._toastTimer = setTimeout(function () {
      self.hideToast();
    }, CONFIG.TOAST_DURATION);
  },

  hideToast: function () {
    if (this._toastTimer) {
      clearTimeout(this._toastTimer);
      this._toastTimer = null;
    }
    $(".toast-mask").addClass("hidden");
  },

  // ============== 更新数据确认 ==============
  showConfirm: function (subcategoryKey) {
    this.state.pendingResetKey = subcategoryKey;
    $(".confirm-mask").removeClass("hidden");
  },

  hideConfirm: function () {
    this.state.pendingResetKey = "";
    $(".confirm-mask").addClass("hidden");
  },

  // ============== 数据归一化 ==============
  /**
   * 将接口返回的平铺 subcategories 归并为主类别 / 子类别两层。
   * maxCount=0 优先判定为无需采集；required=true 时最少 1 张。
   */
  normalizeTaskData: function (data) {
    var source = data || {};
    var orderSource = source.orderInfo || {};
    var orderInfo = {
      orderNo: this.toText(orderSource.orderNo),
      hostCode: this.toText(orderSource.hostCode),
      vin: this.toText(orderSource.vin),
      monthSequence: this.toText(orderSource.monthSequence),
    };
    var rows = Object.prototype.toString.call(source.subcategories) === "[object Array]" ? source.subcategories : [];
    var mainMap = {};
    var mainList = [];

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i] || {};
      var mainCode = this.toText(row.mainCategoryCode) || "MAIN-" + i;
      var mainName = this.toText(row.mainCategoryName) || mainCode;
      var mainSort = this.toNumber(row.mainCategorySort, mainList.length);
      var main = mainMap[mainCode];
      if (!main) {
        main = {
          code: mainCode,
          name: mainName,
          sort: mainSort,
          orderIndex: mainList.length,
          subs: [],
          subCodeMap: {},
        };
        mainMap[mainCode] = main;
        mainList.push(main);
      } else {
        if (!main.name && mainName) main.name = mainName;
        if (mainSort < main.sort) main.sort = mainSort;
      }

      var subCode = this.toText(row.subcategoryCode) || "SUB-" + i;
      if (main.subCodeMap[subCode]) continue;
      main.subCodeMap[subCode] = true;

      var required = this.parseBoolean(row.required);
      var maxCount = this.toNonNegativeInt(row.maxCount, 1);
      var minCount = this.toNonNegativeInt(row.minCount, 0);
      if (maxCount === 0) {
        required = false;
        minCount = 0;
      }
      if (required && minCount === 0) minCount = 1;
      if (minCount > maxCount) minCount = maxCount;

      main.subs.push({
        key: mainCode + "::" + subCode,
        mainCategoryCode: mainCode,
        mainCategoryName: main.name,
        subcategoryCode: subCode,
        subcategoryName: this.toText(row.subcategoryName) || subCode,
        required: required,
        minCount: minCount,
        maxCount: maxCount,
        sort: this.toNumber(row.sort, main.subs.length),
        orderIndex: main.subs.length,
        requirementDescription: this.toText(row.requirementDescription),
        images: [],
        status: "uncollected",
        result: null,
        aiResult: "",
      });
    }

    mainList.sort(function (left, right) {
      if (left.sort !== right.sort) return left.sort - right.sort;
      return left.orderIndex - right.orderIndex;
    });

    var mainCategories = [];
    for (var m = 0; m < mainList.length; m++) {
      var mainItem = mainList[m];
      mainItem.subs.sort(function (left, right) {
        if (left.sort !== right.sort) return left.sort - right.sort;
        return left.orderIndex - right.orderIndex;
      });
      for (var n = 0; n < mainItem.subs.length; n++) {
        mainItem.subs[n].mainCategoryName = mainItem.name;
      }
      mainCategories.push(mainItem);
    }

    return { orderInfo: orderInfo, mainCategories: mainCategories };
  },

  // ============== 校验与状态 ==============
  getMinimumImageCount: function (subcategory) {
    if (subcategory.maxCount === 0) return 0;
    return subcategory.required ? Math.max(1, subcategory.minCount) : subcategory.minCount;
  },

  checkSubcategoryCountValid: function (subcategory) {
    if (subcategory.maxCount === 0) return true;
    var count = subcategory.images.length;
    if (count === 0) return !subcategory.required;
    var minimum = this.getMinimumImageCount(subcategory);
    return count >= minimum && count <= subcategory.maxCount;
  },

  checkSubcategoryComplete: function (subcategory) {
    if (subcategory.maxCount === 0) return true;
    if (!this.checkSubcategoryCountValid(subcategory)) return false;
    if (subcategory.images.length === 0) return !subcategory.required;
    return subcategory.status === "success";
  },

  computeMainCategoryStatus: function (mainCategory) {
    var hasFail = false;
    var hasPending = false;
    var allComplete = true;
    for (var i = 0; i < mainCategory.subs.length; i++) {
      var subcategory = mainCategory.subs[i];
      if (subcategory.status === "fail") hasFail = true;
      if (subcategory.status === "pending") hasPending = true;
      if (!this.checkSubcategoryComplete(subcategory)) allComplete = false;
    }
    if (hasFail) return "fail";
    if (hasPending) return "pending";
    if (allComplete) return "success";
    return "uncollected";
  },

  computeOverallStatus: function () {
    var mainCategories = this.state.mainCategories;
    if (!mainCategories.length) return "empty";
    var hasFail = false;
    var hasPending = false;
    var allSuccess = true;
    for (var i = 0; i < mainCategories.length; i++) {
      var mainCategory = mainCategories[i];
      var status = this.computeMainCategoryStatus(mainCategory);
      mainCategory.status = status;
      mainCategory.result = status === "success" ? "pass" : status === "fail" ? "fail" : null;
      if (status === "fail") hasFail = true;
      if (status === "pending") hasPending = true;
      if (status !== "success") allSuccess = false;
    }
    if (hasFail) return "fail";
    if (hasPending) return "pending";
    if (allSuccess) return "success";
    return "uncollected";
  },

  getSubcategoryBadgeInfo: function (subcategory) {
    if (subcategory.maxCount === 0) {
      return { text: "无需采集", className: "no-need" };
    }
    if (subcategory.status === "pending") {
      return { text: "识别中", className: "waiting" };
    }
    if (subcategory.status === "fail") {
      return { text: "未通过", className: "fail" };
    }
    if (subcategory.status === "success") {
      return { text: "已完成", className: "done" };
    }
    var count = subcategory.images.length;
    if (!this.checkSubcategoryCountValid(subcategory)) {
      var minimum = this.getMinimumImageCount(subcategory);
      var need = Math.max(0, minimum - count);
      return {
        text: "还需 " + need + " 张（已拍 " + count + "/" + minimum + "）",
        className: "pending",
      };
    }
    if (count === 0) {
      return subcategory.required
        ? { text: "还需 1 张（已拍 0/1）", className: "pending" }
        : { text: "选填", className: "optional" };
    }
    return { text: "待提交（已拍 " + count + "）", className: "pending" };
  },

  getMainCategoryStatusBadge: function (status) {
    if (status === "pending") return { text: "识别中", className: "waiting" };
    if (status === "success") return { text: "已完成", className: "done" };
    if (status === "fail") return { text: "失败", className: "fail" };
    return { text: "采集中", className: "pending" };
  },

  getOrderStatusBadge: function (overallStatus) {
    if (overallStatus === "empty") {
      return {
        text: this.state.orderInfo.orderNo ? "暂无采集项" : "待查询",
        className: "optional",
      };
    }
    if (overallStatus === "pending") return { text: "识别中", className: "waiting" };
    if (overallStatus === "success") return { text: "已完成", className: "done" };
    if (overallStatus === "fail") return { text: "存在异常", className: "fail" };
    return { text: "采集中", className: "pending" };
  },

  getOverallConclusionText: function (overallStatus) {
    if (overallStatus === "empty") {
      return this.state.orderInfo.orderNo ? "暂无采集项" : "待查询";
    }
    if (overallStatus === "pending") return "识别中";
    if (overallStatus === "success") return "全部通过";
    if (overallStatus === "fail") return "存在异常（不通过）";
    return "采集中";
  },

  setBadge: function ($element, baseClassName, badgeInfo) {
    $element.attr("class", baseClassName + " " + badgeInfo.className).text(badgeInfo.text);
  },

  // ============== 数据查找 ==============
  findSubcategory: function (mainCategoryCode, subcategoryCode) {
    var mainCategories = this.state.mainCategories;
    for (var i = 0; i < mainCategories.length; i++) {
      var mainCategory = mainCategories[i];
      if (mainCategory.code !== mainCategoryCode) continue;
      for (var j = 0; j < mainCategory.subs.length; j++) {
        if (mainCategory.subs[j].subcategoryCode === subcategoryCode) {
          return { mainCategory: mainCategory, subcategory: mainCategory.subs[j] };
        }
      }
    }
    return null;
  },

  getSubcategoryByKey: function (subcategoryKey) {
    var mainCategories = this.state.mainCategories;
    for (var i = 0; i < mainCategories.length; i++) {
      var mainCategory = mainCategories[i];
      for (var j = 0; j < mainCategory.subs.length; j++) {
        if (mainCategory.subs[j].key === subcategoryKey) {
          return { mainCategory: mainCategory, subcategory: mainCategory.subs[j] };
        }
      }
    }
    return null;
  },

  getSubcategoryFromCard: function ($card) {
    if (!$card || !$card.length) return null;
    return this.findSubcategory(
      $card.attr("data-main-category-code"),
      $card.attr("data-subcategory-code"),
    );
  },

  // ============== 渲染入口 ==============
  renderAll: function () {
    var overallStatus = this.computeOverallStatus();
    this.state.overallStatus = overallStatus;
    this.renderOrderInfo(overallStatus);
    this.renderDetail();
    this.renderList(overallStatus);
    this.updateActionButtons();
    this.applyButtonSwitch();
  },

  renderOrderInfo: function (overallStatus) {
    var orderInfo = this.state.orderInfo;
    $(".order-no-value").text(orderInfo.orderNo || "-").attr("title", orderInfo.orderNo || "");
    $(".host-code-value").text(orderInfo.hostCode || "-").attr("title", orderInfo.hostCode || "");
    $(".vin-value").text(orderInfo.vin || "-").attr("title", orderInfo.vin || "");
    $(".month-sequence-value")
      .text(orderInfo.monthSequence || "-")
      .attr("title", orderInfo.monthSequence || "");

    var summaryParts = [];
    if (orderInfo.orderNo) summaryParts.push(orderInfo.orderNo);
    if (orderInfo.hostCode) summaryParts.push(orderInfo.hostCode);
    if (orderInfo.vin) summaryParts.push(orderInfo.vin);
    $(".order-info-summary").text(summaryParts.join(" · ")).attr("title", summaryParts.join(" · "));

    this.setBadge(
      $(".order-status-badge"),
      "card-badge order-status-badge",
      this.getOrderStatusBadge(overallStatus),
    );

    $(".order-info-card")
      .removeClass("status-empty status-uncollected status-pending status-success status-fail")
      .addClass("status-" + overallStatus);
    this.renderOrderCollapsedState();
  },

  renderOrderCollapsedState: function () {
    var collapsed = this.state.orderCollapsed;
    $(".order-info-card").toggleClass("is-collapsed", collapsed);
    $(".order-info-header").attr("aria-expanded", collapsed ? "false" : "true");
    $(".order-info-arrow .arrow-down").toggleClass("hidden", !collapsed);
    $(".order-info-arrow .arrow-up").toggleClass("hidden", collapsed);
  },

  renderDetail: function () {
    var mainCategories = this.state.mainCategories;
    var $categoryBar = $(".category-bar");
    var $cardList = $(".category-card-list");
    var $empty = $(".empty-task");
    var scrollTop = $cardList.scrollTop();

    $cardList.find(".category-card").remove();

    if (!mainCategories.length) {
      this.state.currentMainIndex = 0;
      $categoryBar.addClass("hidden");
      $(".page-indicator").text("0/0");
      $empty.find("p").text(
        this.state.orderInfo.orderNo
          ? "该订单暂无采集项"
          : "请输入单号/VIN/月顺序号查询采集任务",
      );
      $empty.removeClass("hidden");
      $cardList.scrollTop(0);
      return;
    }

    if (this.state.currentMainIndex < 0 || this.state.currentMainIndex >= mainCategories.length) {
      this.state.currentMainIndex = 0;
    }
    var mainCategory = mainCategories[this.state.currentMainIndex];
    $categoryBar.removeClass("hidden");
    $(".category-name").text(mainCategory.name || "-");
    this.setBadge(
      $(".category-status-badge"),
      "card-badge category-status-badge",
      this.getMainCategoryStatusBadge(mainCategory.status),
    );
    $(".page-indicator").text(this.state.currentMainIndex + 1 + "/" + mainCategories.length);
    $empty.addClass("hidden");

    for (var i = 0; i < mainCategory.subs.length; i++) {
      $cardList.append(this.renderCategoryCard(mainCategory, mainCategory.subs[i]));
    }
    $cardList.scrollTop(scrollTop);
  },

  renderCategoryCard: function (mainCategory, subcategory) {
    var $card = this.cloneTemplate("template-cert-ai-category-card");
    if (!$card.length) return $card;

    $card
      .attr("data-main-category-code", mainCategory.code)
      .attr("data-subcategory-code", subcategory.subcategoryCode);

    if (subcategory.maxCount === 0) {
      $card.addClass("no-need");
    } else if (subcategory.status === "success") {
      $card.addClass("complete");
    } else if (subcategory.status === "fail") {
      $card.addClass("fail");
    } else if (subcategory.status === "pending") {
      $card.addClass("pending");
    }

    $card.find(".category-card-title").text(subcategory.subcategoryName);

    var $requirementBadge = $card.find(".requirement-badge");
    if (subcategory.maxCount === 0) {
      $requirementBadge.addClass("hidden");
    } else {
      $requirementBadge
        .removeClass("hidden")
        .attr("class", "requirement-badge" + (subcategory.required ? "" : " optional"))
        .text(subcategory.required ? "必采" : "选采");
    }

    this.setBadge(
      $card.find(".status-badge"),
      "card-badge status-badge",
      this.getSubcategoryBadgeInfo(subcategory),
    );

    var percent = 0;
    if (subcategory.maxCount > 0) {
      percent =
        subcategory.status === "success"
          ? 100
          : Math.round((subcategory.images.length / subcategory.maxCount) * 100);
    }
    percent = Math.max(0, Math.min(100, percent));
    $card.find(".progress-fill").css("width", percent + "%");

    var $requirementNote = $card.find(".requirement-note");
    if (subcategory.requirementDescription) {
      $requirementNote.removeClass("hidden").text(subcategory.requirementDescription);
    } else {
      $requirementNote.addClass("hidden");
    }

    var $photoList = $card.find(".photo-thumb-list");
    var $addPhoto = $photoList.find(".photo-add");
    var $fullTip = $photoList.find(".photo-full-tip");
    var $noNeedNote = $photoList.find(".no-need-note");
    var canDelete = subcategory.status === "uncollected" || subcategory.status === "fail";

    for (var i = 0; i < subcategory.images.length; i++) {
      var $photo = this.cloneTemplate("template-cert-ai-photo-item");
      $photo
        .find("img")
        .attr("src", subcategory.images[i])
        .attr("alt", subcategory.subcategoryName + " 采集照片 " + (i + 1));
      $photo.find(".photo-delete").attr("data-index", i).toggleClass("hidden", !canDelete);
      $photo.find(".photo-processing").toggleClass("hidden", subcategory.status !== "pending");
      $addPhoto.before($photo);
    }

    if (subcategory.maxCount === 0) {
      $addPhoto.addClass("hidden");
      $fullTip.addClass("hidden");
      $noNeedNote.removeClass("hidden");
    } else if (subcategory.images.length >= subcategory.maxCount) {
      $addPhoto.addClass("hidden");
      $fullTip.removeClass("hidden");
      $noNeedNote.addClass("hidden");
    } else {
      $addPhoto.removeClass("hidden");
      $fullTip.addClass("hidden");
      $noNeedNote.addClass("hidden");
    }

    var showReRecognize = subcategory.status === "fail";
    var showReset = subcategory.status === "success" || subcategory.status === "fail";
    $card.find(".btn-re-recognize").toggleClass("hidden", !showReRecognize);
    $card.find(".btn-reset-data").toggleClass("hidden", !showReset);
    $card.find(".card-action-row").toggleClass("hidden", !(showReRecognize || showReset));

    var showAi =
      subcategory.maxCount > 0 &&
      !(subcategory.images.length === 0 && !subcategory.required && subcategory.status === "uncollected");
    var $aiResult = $card.find(".ai-result");
    if (!showAi) {
      $aiResult.addClass("hidden");
    } else {
      var aiText = "待识别";
      var aiClass = "";
      if (subcategory.status === "pending") {
        aiText = "识别中...";
        aiClass = "pending";
      } else if (subcategory.status === "success") {
        aiText = subcategory.aiResult || "照片清晰，校验通过";
        aiClass = "success";
      } else if (subcategory.status === "fail") {
        aiText = subcategory.aiResult || "图片模糊，无法识别";
        aiClass = "fail";
      }
      $aiResult
        .removeClass("hidden pending success fail")
        .addClass(aiClass)
        .find(".ai-result-text")
        .text("AI：" + aiText);
    }

    return $card;
  },

  renderList: function (overallStatus) {
    var mainCategories = this.state.mainCategories;
    var $summary = $(".overall-summary-card");
    var $value = $(".overall-conclusion");
    var $progressText = $(".overall-progress-text");
    var $progressFill = $(".overall-progress-fill");
    var $rowList = $(".category-row-list");
    var $empty = $(".empty-task-list");
    var scrollTop = $rowList.scrollTop();

    $rowList.find(".category-row").remove();
    $summary.removeClass("status-success status-fail status-pending");
    $value.removeClass("success fail pending");

    var completedCount = 0;
    for (var i = 0; i < mainCategories.length; i++) {
      if (mainCategories[i].status === "success") completedCount++;
    }

    $value.text(this.getOverallConclusionText(overallStatus));
    if (overallStatus === "success") {
      $summary.addClass("status-success");
      $value.addClass("success");
    } else if (overallStatus === "fail") {
      $summary.addClass("status-fail");
      $value.addClass("fail");
    } else if (overallStatus === "pending") {
      $summary.addClass("status-pending");
      $value.addClass("pending");
    }

    if (mainCategories.length) {
      $progressText.text("已完成 " + completedCount + "/" + mainCategories.length + " 个主类别");
    } else {
      $progressText.text("");
    }
    var overallPercent = mainCategories.length
      ? Math.round((completedCount / mainCategories.length) * 100)
      : 0;
    $progressFill.css("width", overallPercent + "%");

    if (!mainCategories.length) {
      $empty.find("p").text(
        this.state.orderInfo.orderNo ? "该订单暂无采集项" : "暂无采集任务",
      );
      $empty.removeClass("hidden");
      $rowList.scrollTop(0);
      return;
    }

    $empty.addClass("hidden");
    for (var j = 0; j < mainCategories.length; j++) {
      $rowList.append(this.renderCategoryRow(mainCategories[j], j));
    }
    $rowList.scrollTop(scrollTop);
  },

  renderCategoryRow: function (mainCategory, index) {
    var $row = this.cloneTemplate("template-cert-ai-category-row");
    if (!$row.length) return $row;
    $row.attr("data-main-index", index).attr("tabindex", "0");

    if (mainCategory.status === "success") {
      $row.addClass("complete");
    } else if (mainCategory.status === "fail") {
      $row.addClass("fail");
    } else if (mainCategory.status === "pending") {
      $row.addClass("pending");
    }

    $row.find(".category-index").text(index + 1);
    $row.find(".category-row-name").text(mainCategory.name || "-");
    this.setBadge(
      $row.find(".row-status-badge"),
      "card-badge row-status-badge",
      this.getMainCategoryStatusBadge(mainCategory.status),
    );

    var resultText = "-";
    var resultClass = "";
    if (mainCategory.status === "success") {
      resultText = "通过";
      resultClass = "success";
    } else if (mainCategory.status === "fail") {
      resultText = "不通过";
      resultClass = "fail";
    }
    var $result = $row.find(".category-row-result").text(resultText);
    if (resultClass) $result.addClass(resultClass);

    return $row;
  },

  updateActionButtons: function () {
    var hasData = this.state.mainCategories.length > 0;
    this.setButtonDisabled($(".btn-open-list"), !hasData);
    this.setButtonDisabled($(".btn-save"), !hasData);
    this.setButtonDisabled($(".btn-back-detail"), !hasData);
  },

  setButtonDisabled: function ($button, disabled) {
    $button.toggleClass("disabled", disabled).attr("aria-disabled", disabled ? "true" : "false");
  },

  applyButtonSwitch: function () {
    var $root = $(".mom-cert-ai-collect");
    for (var name in BUTTON_SWITCH) {
      if (!Object.prototype.hasOwnProperty.call(BUTTON_SWITCH, name)) continue;
      var config = BUTTON_SWITCH[name];
      var $button = $root.find(BUTTON_SELECTOR[name]);
      $button.toggleClass("hidden", !config.visible);
      if (config.permitted) {
        $button.removeClass("disabled").attr("aria-disabled", "false").prop("disabled", false);
      } else {
        $button.addClass("disabled").attr("aria-disabled", "true");
        if (!config.deniedMessage) {
          $button.prop("disabled", true);
        } else {
          $button.prop("disabled", false);
        }
      }
    }
  },

  ensureButtonPermitted: function (buttonName) {
    var config = BUTTON_SWITCH[buttonName];
    if (!config) return true;
    if (config.permitted) return true;
    if (config.deniedMessage) {
      this.showToast("提示", config.deniedMessage, "error");
    }
    return false;
  },

  // ============== 视图切换 ==============
  switchView: function (viewName) {
    this.state.view = viewName;
    $(".view-detail").toggleClass("hidden", viewName !== "detail");
    $(".view-list").toggleClass("hidden", viewName !== "list");
  },

  scrollActiveViewTop: function () {
    if (this.state.view === "list") {
      $(".category-row-list").scrollTop(0);
    } else {
      $(".category-card-list").scrollTop(0);
    }
  },

  openList: function () {
    if (!this.state.mainCategories.length) {
      this.showToast("提示", "请先查询订单", "error");
      return;
    }
    this.switchView("list");
    this.renderAll();
    this.scrollActiveViewTop();
  },

  backDetail: function () {
    if (!this.state.mainCategories.length) {
      this.showToast("提示", "请先查询订单", "error");
      return;
    }
    this.switchView("detail");
    this.renderAll();
    this.scrollActiveViewTop();
  },

  jumpToMainCategory: function (index) {
    var mainCategories = this.state.mainCategories;
    if (!mainCategories.length) return;
    var parsedIndex = parseInt(index, 10);
    if (isNaN(parsedIndex) || parsedIndex < 0 || parsedIndex >= mainCategories.length) return;
    this.state.currentMainIndex = parsedIndex;
    this.switchView("detail");
    this.renderAll();
    this.scrollActiveViewTop();
  },

  toggleOrderInfo: function () {
    this.state.orderCollapsed = !this.state.orderCollapsed;
    this.renderOrderCollapsedState();
  },

  // ============== 查询与扫码 ==============
  queryOrder: function (searchKey) {
    var keyword = this.toText(searchKey).trim();
    if (!keyword) {
      this.showToast("提示", "请输入单号/VIN/月顺序号", "error");
      $(".input-search").trigger("focus");
      return;
    }
    if (this.state.querying) return;
    if (typeof window.getCertificateAiCollectTask !== "function") {
      this.showToast("查询失败", "查询接口未接入，请稍后重试", "error");
      return;
    }

    var self = this;
    this.state.querying = true;
    this.showLoading("查询中...");
    this.apiCall(
      window.getCertificateAiCollectTask,
      [{ searchKey: keyword }],
      function (response) {
        self.state.querying = false;
        self.hideLoading();
        if (!response || response.code !== 0) {
          self.showToast(
            "查询失败",
            response && response.msg ? response.msg : "未查询到订单，请重试",
            "error",
          );
          return;
        }
        self.applyTaskData(response.data || {});
      },
      CONFIG.API_TIMEOUT,
    );
  },

  applyTaskData: function (data) {
    var normalized = this.normalizeTaskData(data);
    this.state.taskSessionId++;
    this.state.recognitionTokens = {};
    this.state.recognitionTokenSeed++;
    this.state.uploadKey = "";
    this.state.submitting = false;
    this.hideConfirm();
    this.state.orderInfo = normalized.orderInfo;
    this.state.mainCategories = normalized.mainCategories;
    this.state.currentMainIndex = 0;
    this.state.orderCollapsed = true;
    if (normalized.orderInfo.orderNo) {
      $(".input-search").val(normalized.orderInfo.orderNo);
    }
    this.switchView("detail");
    this.renderAll();
    this.scrollActiveViewTop();
  },

  doScan: function () {
    if (this.state.querying) return;
    if (!this.ensureButtonPermitted("scanOrder")) return;

    var self = this;
    var openCamera = null;
    try {
      if (window.parent && typeof window.parent.OpenCamera === "function") {
        openCamera = window.parent.OpenCamera;
      }
    } catch (error) {
      // 跨域访问 window.parent 会抛 SecurityError
    }
    if (!openCamera && typeof window.OpenCamera === "function") {
      openCamera = window.OpenCamera;
    }
    if (!openCamera) {
      this.showToast("提示", "扫码功能仅在移动端可用，请手动输入", "error");
      return;
    }

    try {
      openCamera(function (result) {
        var value =
          result && (result.data || result.value)
            ? result.data || result.value
            : typeof result === "string"
              ? result
              : "";
        value = self.toText(value).trim();
        if (!value) {
          self.showToast("扫码失败", "未获取到扫码结果", "error");
          return;
        }
        $(".input-search").val(value);
        self.queryOrder(value);
      });
    } catch (error) {
      this.showToast("扫码失败", "扫码功能暂不可用，请手动输入", "error");
    }
  },

  // ============== 拍照与图片 ==============
  openPhotoPicker: function ($card) {
    var found = this.getSubcategoryFromCard($card);
    if (!found) return;
    var subcategory = found.subcategory;
    if (subcategory.maxCount === 0 || subcategory.status === "pending") return;
    if (subcategory.images.length >= subcategory.maxCount) {
      this.showToast("提示", "该子类别已达拍摄上限", "error");
      return;
    }
    var $input = $(".photo-input-hidden");
    if (!$input.length) return;
    this.state.uploadKey = subcategory.key;
    $input.val("");
    $input[0].click();
  },

  handlePhotoInputChange: function (input) {
    var file = input && input.files && input.files[0] ? input.files[0] : null;
    var uploadKey = this.state.uploadKey;
    this.state.uploadKey = "";
    if (input) input.value = "";
    if (!file || !uploadKey) return;

    if (file.type.toLowerCase().indexOf("image/") !== 0) {
      this.showToast("图片读取失败", "请选择图片文件", "error");
      return;
    }
    if (!file.size) {
      this.showToast("图片读取失败", "图片文件为空，请重新选择", "error");
      return;
    }
    if (file.size > CONFIG.MAX_SOURCE_FILE_SIZE) {
      this.showToast("图片读取失败", "图片过大，请选择 20MB 以内的照片", "error");
      return;
    }

    var found = this.getSubcategoryByKey(uploadKey);
    if (!found) return;
    if (found.subcategory.maxCount === 0 || found.subcategory.status === "pending") return;
    if (found.subcategory.images.length >= found.subcategory.maxCount) {
      this.showToast("提示", "该子类别已达拍摄上限", "error");
      return;
    }
    if (this.state.readingImage) {
      this.showToast("提示", "图片处理中，请稍候", "error");
      return;
    }

    var self = this;
    var sessionId = this.state.taskSessionId;
    this.state.readingImage = true;
    this.showLoading("图片处理中...");
    this.compressImage(
      file,
      function (base64) {
        self.state.readingImage = false;
        self.hideLoading();
        if (sessionId !== self.state.taskSessionId) return;
        var current = self.getSubcategoryByKey(uploadKey);
        if (!current) return;
        if (current.subcategory.images.length >= current.subcategory.maxCount) {
          self.showToast("提示", "该子类别已达拍摄上限", "error");
          return;
        }
        current.subcategory.images.push(base64);
        self.invalidateSubcategory(current.subcategory);
        self.renderAll();
      },
      function (message) {
        self.state.readingImage = false;
        self.hideLoading();
        if (sessionId !== self.state.taskSessionId) return;
        self.showToast("图片读取失败", message || "请重试", "error");
      },
    );
  },

  invalidateSubcategory: function (subcategory) {
    subcategory.status = "uncollected";
    subcategory.result = null;
    subcategory.aiResult = "";
    this.bumpRecognitionToken(subcategory.key);
  },

  bumpRecognitionToken: function (subcategoryKey) {
    this.state.recognitionTokenSeed++;
    var token = this.state.recognitionTokenSeed;
    this.state.recognitionTokens[subcategoryKey] = token;
    return token;
  },

  removePhoto: function ($button) {
    var found = this.getSubcategoryFromCard($button.closest(".category-card"));
    if (!found) return;
    var subcategory = found.subcategory;
    if (subcategory.status !== "uncollected" && subcategory.status !== "fail") return;
    var index = parseInt($button.closest(".photo-item").attr("data-index"), 10);
    if (isNaN(index) || index < 0 || index >= subcategory.images.length) return;
    subcategory.images.splice(index, 1);
    this.invalidateSubcategory(subcategory);
    this.renderAll();
  },

  // ============== 识别 ==============
  startRecognition: function (subcategory) {
    if (!subcategory.images.length) return false;
    if (typeof window.recognizeCertificateAiCollectSubcategory !== "function") {
      subcategory.status = "fail";
      subcategory.result = "fail";
      subcategory.aiResult = "识别接口未接入，请稍后重试";
      return false;
    }

    var self = this;
    var token = this.bumpRecognitionToken(subcategory.key);
    subcategory.status = "pending";
    subcategory.result = null;
    subcategory.aiResult = "";

    var payload = {
      orderNo: this.state.orderInfo.orderNo || "",
      mainCategoryCode: subcategory.mainCategoryCode,
      subcategoryCode: subcategory.subcategoryCode,
      images: subcategory.images.slice(),
    };

    this.apiCall(
      window.recognizeCertificateAiCollectSubcategory,
      [payload],
      function (response) {
        if (self.state.recognitionTokens[subcategory.key] !== token) return;
        var current = self.getSubcategoryByKey(subcategory.key);
        if (!current || current.subcategory.status !== "pending") return;
        var target = current.subcategory;
        if (!response || response.code !== 0) {
          target.status = "fail";
          target.result = "fail";
          target.aiResult =
            response && response.msg ? response.msg : "识别超时，请重试";
        } else {
          var data = response.data || {};
          var result = self.toText(data.result).toLowerCase();
          var aiResult = self.toText(data.aiResult);
          if (result === "pass") {
            target.status = "success";
            target.result = "pass";
            target.aiResult = aiResult || "照片清晰，校验通过";
          } else {
            target.status = "fail";
            target.result = "fail";
            target.aiResult = aiResult || "图片模糊，无法识别";
          }
        }
        self.renderAll();
      },
      CONFIG.API_TIMEOUT,
    );
    return true;
  },

  reRecognize: function ($card) {
    var found = this.getSubcategoryFromCard($card);
    if (!found) return;
    var subcategory = found.subcategory;
    if (subcategory.status !== "fail") return;
    if (!subcategory.images.length) {
      this.showToast("提示", "该子类别还没有照片，请先拍照", "error");
      return;
    }
    this.startRecognition(subcategory);
    this.renderAll();
  },

  openResetConfirm: function ($card) {
    var found = this.getSubcategoryFromCard($card);
    if (!found) return;
    var subcategory = found.subcategory;
    if (subcategory.status !== "success" && subcategory.status !== "fail") return;
    this.showConfirm(subcategory.key);
  },

  confirmReset: function () {
    var subcategoryKey = this.state.pendingResetKey;
    this.hideConfirm();
    if (!subcategoryKey) return;
    var found = this.getSubcategoryByKey(subcategoryKey);
    if (!found) return;
    var subcategory = found.subcategory;
    this.bumpRecognitionToken(subcategory.key);
    subcategory.images = [];
    subcategory.status = "uncollected";
    subcategory.result = null;
    subcategory.aiResult = "";
    this.renderAll();
    this.showToast("已重置", "请重新拍照采集", "success");
  },

  // ============== 保存并继续 ==============
  saveAndContinue: function () {
    if (this.state.querying || this.state.submitting) return;
    var mainCategories = this.state.mainCategories;
    if (!mainCategories.length) {
      this.showToast("提示", "请先查询订单", "error");
      return;
    }
    var mainCategory = mainCategories[this.state.currentMainIndex];
    if (!mainCategory) {
      this.showToast("提示", "当前主类别不存在", "error");
      return;
    }

    var messages = [];
    for (var i = 0; i < mainCategory.subs.length; i++) {
      var subcategory = mainCategory.subs[i];
      if (subcategory.maxCount === 0) continue;
      if (this.checkSubcategoryCountValid(subcategory)) continue;
      var minimum = this.getMinimumImageCount(subcategory);
      if (subcategory.images.length < minimum) {
        messages.push(
          "【" +
            subcategory.subcategoryName +
            "】需至少 " +
            minimum +
            " 张，当前 " +
            subcategory.images.length +
            " 张",
        );
      } else {
        messages.push(
          "【" +
            subcategory.subcategoryName +
            "】最多 " +
            subcategory.maxCount +
            " 张，当前 " +
            subcategory.images.length +
            " 张",
        );
      }
    }

    if (messages.length) {
      this.showToast("未完成", messages.join("；"), "error");
      return;
    }

    this.state.submitting = true;
    for (var j = 0; j < mainCategory.subs.length; j++) {
      var target = mainCategory.subs[j];
      if (target.maxCount > 0 && target.images.length > 0 && target.status === "uncollected") {
        this.startRecognition(target);
      }
    }

    if (this.state.currentMainIndex < mainCategories.length - 1) {
      this.state.currentMainIndex++;
      this.renderAll();
      this.scrollActiveViewTop();
    } else {
      this.switchView("list");
      this.renderAll();
      this.scrollActiveViewTop();
    }

    var self = this;
    setTimeout(function () {
      self.state.submitting = false;
    }, 300);
  },

  // ============== 图片压缩（含 EXIF 旋转修正） ==============
  compressImage: function (file, successCallback, errorCallback) {
    var completed = false;
    function finishSuccess(base64) {
      if (completed) return;
      completed = true;
      successCallback(base64);
    }
    function finishError(message) {
      if (completed) return;
      completed = true;
      errorCallback(message);
    }

    var reader = new FileReader();
    reader.onload = function (event) {
      var img = new Image();
      img.onload = function () {
        try {
          var width = img.width;
          var height = img.height;
          var orientation = CertificateAiCollect.readExifOrientation(event.target.result);

          if (width > CONFIG.MAX_IMAGE_WIDTH) {
            height = Math.round((height * CONFIG.MAX_IMAGE_WIDTH) / width);
            width = CONFIG.MAX_IMAGE_WIDTH;
          }
          if (height > CONFIG.MAX_IMAGE_HEIGHT) {
            width = Math.round((width * CONFIG.MAX_IMAGE_HEIGHT) / height);
            height = CONFIG.MAX_IMAGE_HEIGHT;
          }
          if (!width || !height) {
            finishError("图片尺寸异常，请重试");
            return;
          }

          var canvas = document.createElement("canvas");
          var context = canvas.getContext("2d");
          if (!context) {
            finishError("当前浏览器不支持图片处理");
            return;
          }

          switch (orientation) {
            case 3:
              canvas.width = width;
              canvas.height = height;
              context.translate(width, height);
              context.rotate(Math.PI);
              break;
            case 6:
              canvas.width = height;
              canvas.height = width;
              context.translate(height, 0);
              context.rotate(Math.PI / 2);
              break;
            case 8:
              canvas.width = height;
              canvas.height = width;
              context.translate(0, width);
              context.rotate(-Math.PI / 2);
              break;
            default:
              canvas.width = width;
              canvas.height = height;
          }
          context.drawImage(img, 0, 0, width, height);

          var base64 = canvas.toDataURL("image/jpeg", CONFIG.JPEG_QUALITY);
          if (!base64 || base64.indexOf("data:image") !== 0) {
            finishError("图片处理失败，请重试");
            return;
          }
          finishSuccess(base64);
        } catch (error) {
          finishError("图片处理失败，请重试");
        }
      };
      img.onerror = function () {
        finishError("图片读取失败，请重试");
      };
      img.src = event.target.result;
    };
    reader.onerror = function () {
      finishError("图片读取失败，请重试");
    };
    reader.readAsDataURL(file);
  },

  /**
   * 读取 JPEG EXIF Orientation（1-8），非 JPEG/无 EXIF 返回 1。
   * 用于压缩时修正手机竖拍照片的旋转。
   */
  readExifOrientation: function (dataUrl) {
    try {
      var base64 = dataUrl.split(",")[1];
      var binary = atob(base64);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      var dataView = new DataView(bytes.buffer);
      if (dataView.getUint16(0, false) !== 0xffd8) return 1;
      var offset = 2;
      var length = bytes.length;
      while (offset < length - 4) {
        if (dataView.getUint8(offset) !== 0xff) {
          offset++;
          continue;
        }
        var marker = dataView.getUint8(offset + 1);
        if (marker === 0xe1) {
          var segmentLength = dataView.getUint16(offset + 2, false);
          if (dataView.getUint32(offset + 4, false) === 0x45786966) {
            var tiffOffset = offset + 10;
            var littleEndian = dataView.getUint16(tiffOffset, false) === 0x4949;
            if (dataView.getUint16(tiffOffset + 2, littleEndian) !== 0x002a) return 1;
            var ifdOffset = dataView.getUint32(tiffOffset + 4, littleEndian) + tiffOffset;
            var entries = dataView.getUint16(ifdOffset, littleEndian);
            for (var entryIndex = 0; entryIndex < entries; entryIndex++) {
              var entryOffset = ifdOffset + 2 + entryIndex * 12;
              if (dataView.getUint16(entryOffset, littleEndian) === 0x0112) {
                return dataView.getUint16(entryOffset + 8, littleEndian);
              }
            }
          }
          offset += segmentLength + 2;
        } else {
          offset++;
        }
      }
    } catch (error) {
      return 1;
    }
    return 1;
  },

  // ============== 页面尺寸 ==============
  /**
   * 表单宿主可能在根容器上方留不可见占位；父层无 padding/border 时用等量负 margin 抵消。
   * 必须紧接在 fitPageHeight() 之前执行。
   */
  compensateHostTopGap: function () {
    var $root = $(".mom-cert-ai-collect");
    if (!$root.length) return;
    $root.css("margin-top", "");
    var $host = $root.parent();
    if ((parseFloat($host.css("padding-top")) || 0) > 0) return;
    if ((parseFloat($host.css("border-top-width")) || 0) > 0) return;
    var gap = Math.round($root.offset().top - $host.offset().top);
    if (gap <= 0 || gap > 40) return;
    $root.css("margin-top", -gap + "px");
  },

  fitPageHeight: function () {
    var $root = $(".mom-cert-ai-collect");
    if (!$root.length) return;
    var availableHeight = $(window).height() - $root.offset().top;
    $root.css("height", Math.max(240, availableHeight) + "px");
  },

  // ============== 事件绑定（一次性委托） ==============
  initEvents: function () {
    var self = this;
    var $root = $(".mom-cert-ai-collect");

    $root.on("click", ".btn-search-order", function () {
      if (!self.ensureButtonPermitted("searchOrder")) return;
      self.queryOrder($(".input-search").val());
    });

    $root.on("click", ".btn-scan-order", function () {
      if (!self.ensureButtonPermitted("scanOrder")) return;
      self.doScan();
    });

    $root.on("click", ".btn-toggle-order", function () {
      self.toggleOrderInfo();
    });

    $root.on("click", ".btn-open-list", function () {
      if ($(this).hasClass("disabled")) {
        self.showToast("提示", "请先查询订单", "error");
        return;
      }
      self.openList();
    });

    $root.on("click", ".btn-save", function () {
      if ($(this).hasClass("disabled")) {
        self.showToast("提示", "请先查询订单", "error");
        return;
      }
      self.saveAndContinue();
    });

    $root.on("click", ".btn-back-detail", function () {
      if ($(this).hasClass("disabled")) {
        self.showToast("提示", "请先查询订单", "error");
        return;
      }
      self.backDetail();
    });

    $root.on("click", ".photo-add", function () {
      self.openPhotoPicker($(this).closest(".category-card"));
    });

    $root.on("click", ".photo-delete", function (event) {
      event.stopPropagation();
      self.removePhoto($(this));
    });

    $root.on("click", ".btn-re-recognize", function () {
      self.reRecognize($(this).closest(".category-card"));
    });

    $root.on("click", ".btn-reset-data", function () {
      self.openResetConfirm($(this).closest(".category-card"));
    });

    $root.on("click", ".category-row", function () {
      self.jumpToMainCategory($(this).attr("data-main-index"));
    });

    $root.on("click", ".confirm-btn-cancel", function () {
      self.hideConfirm();
    });

    $root.on("click", ".confirm-btn-ok", function () {
      self.confirmReset();
    });

    $root.on("click", ".toast-btn", function () {
      self.hideToast();
    });

    $(".confirm-mask").on("click", function (event) {
      if (event.target === this) self.hideConfirm();
    });

    $(".toast-mask").on("click", function (event) {
      if (event.target === this) self.hideToast();
    });

    $(".photo-input-hidden").on("change", function () {
      self.handlePhotoInputChange(this);
    });

    $root.on("keydown", ".input-search", function (event) {
      var originalEvent = event.originalEvent || event;
      if (originalEvent.isComposing || event.keyCode === 229) return;
      if (event.key !== "Enter" && event.keyCode !== 13) return;
      event.preventDefault();
      self.queryOrder($(this).val());
    });

    $root.on("keydown", ".btn-toggle-order", function (event) {
      var originalEvent = event.originalEvent || event;
      if (originalEvent.isComposing || event.keyCode === 229) return;
      if (event.key !== "Enter" && event.key !== " " && event.keyCode !== 13 && event.keyCode !== 32) {
        return;
      }
      event.preventDefault();
      self.toggleOrderInfo();
    });

    $root.on("keydown", ".category-row", function (event) {
      var originalEvent = event.originalEvent || event;
      if (originalEvent.isComposing || event.keyCode === 229) return;
      if (event.key !== "Enter" && event.key !== " " && event.keyCode !== 13 && event.keyCode !== 32) {
        return;
      }
      event.preventDefault();
      self.jumpToMainCategory($(this).attr("data-main-index"));
    });
  },

  // ============== 页面初始化 ==============
  initPage: function () {
    if (!$(".mom-cert-ai-collect").length) {
      this._initRetryCount++;
      if (this._initRetryCount > 100) return;
      var self = this;
      setTimeout(function () {
        self.initPage();
      }, 50);
      return;
    }

    if (this.state.initialized) return;
    this.state.initialized = true;

    this.initEvents();
    this.renderAll();
    this.compensateHostTopGap();
    this.fitPageHeight();

    var self = this;
    $(window).on(
      "resize",
      this.debounce(CONFIG.RESIZE_DEBOUNCE, function () {
        self.compensateHostTopGap();
        self.fitPageHeight();
      }),
    );

    var presetOrderNo = window.CertificateAiCollectOrderNo || "";
    if (presetOrderNo) {
      $(".input-search").val(presetOrderNo);
      this.queryOrder(presetOrderNo);
    }
  },
};

// Portal 表单环境：定义空实现阻止输入框回车提交表单
function Portal_OnDocumentKeyDown() {}

$(function () {
  CertificateAiCollect.initPage();
});
