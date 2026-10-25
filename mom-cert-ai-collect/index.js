// ============== 配置 ==============
var CONFIG = {
  MAX_IMAGE_WIDTH: 3000,
  MAX_IMAGE_HEIGHT: 3000,
  JPEG_QUALITY: 0.8,
  MAX_SOURCE_FILE_SIZE: 20 * 1024 * 1024,
  API_TIMEOUT: 10000,
  TOAST_ERROR_DURATION: 4000,
  TOAST_SUCCESS_DURATION: 2000,
};

var BUTTON_SWITCH = {
  searchOrder: { visible: true, permitted: true, deniedMessage: "" },
  scanOrder: { visible: true, permitted: true, deniedMessage: "" },
};

var BUTTON_SELECTOR = {
  searchOrder: ".btn-search-order",
  scanOrder: ".btn-scan-order",
};

var CertificateAiCollect = {
  state: {
    orderInfo: { orderNo: "", hostCode: "", vin: "", monthSequence: "" },
    mainCategories: [],
    currentMainIndex: 0,
    view: "detail",
    orderCollapsed: false,
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

  _initRetryCount: 0,

  cloneTemplate: function (templateClassName) {
    var template = document.querySelector("." + templateClassName);
    if (!template) return $();
    var fragment = template.content.cloneNode(true);
    return $(fragment.firstElementChild);
  },

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

  // ============== 顶部 Toast（可堆叠，不阻断操作） ==============
  showToast: function (message, type, duration) {
    var $toast = this.cloneTemplate("template-cert-ai-toast");
    if (!$toast.length) return $toast;
    var iconMap = { loading: "⏳", success: "✅", error: "❌" };
    $toast.addClass(type || "loading");
    $toast.find(".toast-icon").text(iconMap[type] || "");
    $toast.find(".toast-message").text(message || "");
    $(".toast-container").append($toast);
    if (duration > 0) {
      var self = this;
      setTimeout(function () {
        self.removeToast($toast);
      }, duration);
    }
    return $toast;
  },

  removeToast: function ($toast) {
    if (!$toast || !$toast.length) return;
    $toast.addClass("is-hiding");
    setTimeout(function () {
      $toast.remove();
    }, 300);
  },

  showConfirm: function (subcategoryKey) {
    this.state.pendingResetKey = subcategoryKey;
    $(".confirm-mask").removeClass("hidden");
  },

  hideConfirm: function () {
    this.state.pendingResetKey = "";
    $(".confirm-mask").addClass("hidden");
  },

  // ============== 数据归一化 ==============
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

  getSubcategoryStatusTag: function (subcategory) {
    if (subcategory.maxCount === 0) return { text: "无需采集", className: "tag-gray" };
    if (subcategory.status === "pending") return { text: "识别中", className: "tag-warning" };
    if (subcategory.status === "success") return { text: "已完成", className: "tag-green" };
    if (subcategory.status === "fail") return { text: "失败", className: "tag-red" };
    return { text: "未采集", className: "tag-blue" };
  },

  getMainCategoryStatusTag: function (status) {
    if (status === "pending") return { text: "识别中", className: "tag-warning" };
    if (status === "success") return { text: "已完成", className: "tag-green" };
    if (status === "fail") return { text: "失败", className: "tag-red" };
    return { text: "采集中", className: "tag-blue" };
  },

  getCountText: function (subcategory) {
    if (subcategory.maxCount === 0) return "无需采集";
    if (subcategory.required) {
      if (subcategory.minCount === subcategory.maxCount) return "需 " + subcategory.minCount + " 张";
      return "需 " + subcategory.minCount + "-" + subcategory.maxCount + " 张";
    }
    if (subcategory.minCount === 0) return "选填(0张即可)";
    if (subcategory.minCount === subcategory.maxCount) return "选填(如上传需 " + subcategory.minCount + " 张)";
    return "选填(如上传需 " + subcategory.minCount + "-" + subcategory.maxCount + " 张)";
  },

  getAiResultText: function (subcategory) {
    if (subcategory.maxCount === 0) return "无需识别";
    if (subcategory.status === "pending") return "识别中...";
    if (subcategory.status === "success") return subcategory.aiResult || "照片清晰，校验通过";
    if (subcategory.status === "fail") return subcategory.aiResult || "图片模糊，无法识别";
    return "待识别";
  },

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
    return this.findSubcategory($card.attr("data-main-category-code"), $card.attr("data-subcategory-code"));
  },

  // ============== 渲染 ==============
  renderAll: function () {
    var overallStatus = this.computeOverallStatus();
    this.state.overallStatus = overallStatus;
    this.renderHeader(overallStatus);
    this.renderDetail();
    this.renderList(overallStatus);
    this.renderPageIndicator();
    this.updateActionButtons();
    this.applyButtonSwitch();
  },

  renderHeader: function (overallStatus) {
    var orderInfo = this.state.orderInfo;
    $(".order-no-value").text(orderInfo.orderNo || "-").attr("title", orderInfo.orderNo || "");
    $(".host-code-value").text(orderInfo.hostCode || "-").attr("title", orderInfo.hostCode || "");
    $(".vin-value").text(orderInfo.vin || "-").attr("title", orderInfo.vin || "");
    $(".month-sequence-value").text(orderInfo.monthSequence || "-").attr("title", orderInfo.monthSequence || "");

    var $orderBox = $(".header-row-primary .order-box");
    $orderBox.removeClass("status-success status-fail");
    if (overallStatus === "success") $orderBox.addClass("status-success");
    if (overallStatus === "fail") $orderBox.addClass("status-fail");

    this.renderCollapsedState();
  },

  renderCollapsedState: function () {
    var collapsed = this.state.orderCollapsed;
    $(".page-header").toggleClass("is-collapsed", collapsed);
    $(".header-toggle-icon").toggleClass("collapsed", collapsed);
    $(".header-toggle").attr("aria-expanded", collapsed ? "false" : "true");
    $(".btn-collapse-header").attr("aria-expanded", collapsed ? "false" : "true");
  },

  renderDetail: function () {
    var mainCategories = this.state.mainCategories;
    var $content = $(".content");
    var $subList = $(".subcategory-list");
    var $empty = $(".empty-task");
    var scrollTop = $content.scrollTop();

    $subList.find(".sub-item-card").remove();

    if (!mainCategories.length) {
      $(".main-category-header").addClass("hidden");
      $subList.addClass("hidden");
      $empty.find("p").text(
        this.state.orderInfo.orderNo ? "该订单暂无采集项" : "请输入单号/VIN/月顺序号查询采集任务",
      );
      $empty.removeClass("hidden");
      $content.scrollTop(0);
      return;
    }

    if (this.state.currentMainIndex < 0 || this.state.currentMainIndex >= mainCategories.length) {
      this.state.currentMainIndex = 0;
    }
    var mainCategory = mainCategories[this.state.currentMainIndex];
    $(".main-category-header").removeClass("hidden");
    $subList.removeClass("hidden");
    $empty.addClass("hidden");
    $(".category-title").text("主类别：" + (mainCategory.name || "-"));

    var mainTag = this.getMainCategoryStatusTag(mainCategory.status);
    $(".category-status-tag").attr("class", "category-status-tag " + mainTag.className).text(mainTag.text);

    for (var i = 0; i < mainCategory.subs.length; i++) {
      $subList.append(this.renderSubCard(mainCategory, mainCategory.subs[i]));
    }
    $content.scrollTop(scrollTop);
  },

  renderSubCard: function (mainCategory, subcategory) {
    var $card = this.cloneTemplate("template-cert-ai-sub-card");
    if (!$card.length) return $card;
    $card
      .attr("data-main-category-code", mainCategory.code)
      .attr("data-subcategory-code", subcategory.subcategoryCode);

    $card.find(".sub-name").text(subcategory.subcategoryName);

    var $reqTag = $card.find(".req-tag");
    if (subcategory.maxCount === 0) {
      $reqTag.attr("class", "req-tag no-need").text("无需采集");
    } else if (subcategory.required) {
      $reqTag.attr("class", "req-tag").text("必采");
    } else {
      $reqTag.attr("class", "req-tag optional").text("选采");
    }

    var $countTag = $card.find(".count-tag");
    var countText = this.getCountText(subcategory);
    if (subcategory.maxCount > 0) countText += " (已拍 " + subcategory.images.length + ")";
    var countClass =
      subcategory.maxCount > 0 && this.checkSubcategoryCountValid(subcategory) ? "met" : "unmet";
    $countTag
      .attr("class", "count-tag " + countClass)
      .text(countText)
      .toggleClass("hidden", subcategory.maxCount === 0);

    var statusTag = this.getSubcategoryStatusTag(subcategory);
    $card.find(".status-tag").attr("class", "status-tag " + statusTag.className).text(statusTag.text);

    var $reqText = $card.find(".sub-req-text");
    if (subcategory.requirementDescription) {
      $reqText.removeClass("hidden").text("采集要求：" + subcategory.requirementDescription);
    } else {
      $reqText.addClass("hidden");
    }

    var $uploadArea = $card.find(".img-upload-area");
    var $uploadBox = $uploadArea.find(".upload-box");
    var $noNeed = $uploadArea.find(".no-need-collect");
    var canDelete = subcategory.status === "uncollected" || subcategory.status === "fail";

    for (var i = 0; i < subcategory.images.length; i++) {
      var $photo = this.cloneTemplate("template-cert-ai-photo-item");
      $photo
        .find("img")
        .attr("src", subcategory.images[i])
        .attr("alt", subcategory.subcategoryName + " 采集照片 " + (i + 1));
      $photo.find(".img-del-bar").attr("data-index", i).toggleClass("hidden", !canDelete);
      $photo.find(".loading-mask").toggleClass("hidden", subcategory.status !== "pending");
      $uploadBox.before($photo);
    }

    if (subcategory.maxCount === 0) {
      $uploadBox.addClass("hidden");
      $noNeed.removeClass("hidden");
    } else if (subcategory.images.length >= subcategory.maxCount || subcategory.status === "pending") {
      $uploadBox.addClass("hidden");
      $noNeed.addClass("hidden");
    } else {
      $uploadBox.removeClass("hidden");
      $noNeed.addClass("hidden");
    }

    var $actionRow = $card.find(".action-btns");
    var $pendingButton = $card.find(".btn-pending");
    var $reRecognize = $card.find(".btn-re-recognize");
    var $resetData = $card.find(".btn-reset-data");
    var showPending = subcategory.status === "pending";
    var showReRecognize = subcategory.status === "fail";
    var showReset = subcategory.status === "success" || subcategory.status === "fail" || showPending;
    $pendingButton.toggleClass("hidden", !showPending);
    $reRecognize.toggleClass("hidden", !showReRecognize);
    $resetData.toggleClass("hidden", !showReset).prop("disabled", showPending);
    $actionRow.toggleClass("hidden", !(showPending || showReRecognize || showReset));

    $card.find(".ai-result-value").text(this.getAiResultText(subcategory));
    return $card;
  },

  renderList: function (overallStatus) {
    var mainCategories = this.state.mainCategories;
    var $body = $(".list-table-body");
    var $table = $(".list-table");
    var $empty = $(".empty-task-table");
    var $conclusion = $(".list-conclusion");
    var $container = $(".table-container");
    var scrollTop = $container.scrollTop();

    $body.find(".list-row").remove();
    $conclusion.removeClass("status-success status-fail status-pending");

    var conclusionText = "";
    if (overallStatus === "empty") {
      conclusionText = this.state.orderInfo.orderNo ? "暂无采集项" : "待查询";
    } else if (overallStatus === "success") {
      conclusionText = "全部通过";
      $conclusion.addClass("status-success");
    } else if (overallStatus === "fail") {
      conclusionText = "存在异常（不通过）";
      $conclusion.addClass("status-fail");
    } else if (overallStatus === "pending") {
      conclusionText = "识别中";
      $conclusion.addClass("status-pending");
    } else {
      conclusionText = "采集中";
    }
    $conclusion.text(conclusionText);

    if (!mainCategories.length) {
      $table.addClass("hidden");
      $empty.find("p").text(this.state.orderInfo.orderNo ? "该订单暂无采集项" : "暂无采集任务");
      $empty.removeClass("hidden");
      $container.scrollTop(0);
      return;
    }

    $table.removeClass("hidden");
    $empty.addClass("hidden");
    for (var i = 0; i < mainCategories.length; i++) {
      $body.append(this.renderListRow(mainCategories[i], i));
    }
    $container.scrollTop(scrollTop);
  },

  renderListRow: function (mainCategory, index) {
    var $row = this.cloneTemplate("template-cert-ai-list-row");
    if (!$row.length) return $row;
    $row.attr("data-main-index", index).attr("tabindex", "0");
    $row.find(".list-index").text(index + 1);
    $row.find(".list-main-name").text(mainCategory.name || "-");

    var statusText = "未采集";
    var statusClass = "status-none";
    if (mainCategory.status === "pending") {
      statusText = "识别中";
      statusClass = "status-waiting";
    } else if (mainCategory.status === "success") {
      statusText = "已完成";
      statusClass = "status-pass";
    } else if (mainCategory.status === "fail") {
      statusText = "失败";
      statusClass = "status-fail";
    }
    $row.find(".list-status").attr("class", "list-status " + statusClass).text(statusText);

    var resultText = "-";
    var resultClass = "status-none";
    if (mainCategory.status === "success") {
      resultText = "通过";
      resultClass = "status-pass";
    } else if (mainCategory.status === "fail") {
      resultText = "不通过";
      resultClass = "status-fail";
    }
    $row.find(".list-result").attr("class", "list-result " + resultClass).text(resultText);
    return $row;
  },

  renderPageIndicator: function () {
    var mainCategories = this.state.mainCategories;
    if (!mainCategories.length) {
      $(".page-indicator").text("0/0");
      return;
    }
    if (this.state.view === "list") {
      $(".page-indicator").text("共 " + mainCategories.length + " 项");
    } else {
      $(".page-indicator").text(this.state.currentMainIndex + 1 + "/" + mainCategories.length);
    }
  },

  updateActionButtons: function () {
    var hasData = this.state.mainCategories.length > 0;
    $(".btn-open-list").toggleClass("disabled", !hasData).attr("aria-disabled", hasData ? "false" : "true");
    $(".btn-save").toggleClass("disabled", !hasData).attr("aria-disabled", hasData ? "false" : "true");
    $(".btn-back-detail").toggleClass("disabled", !hasData).attr("aria-disabled", hasData ? "false" : "true");
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
        $button.prop("disabled", !config.deniedMessage);
      }
    }
  },

  ensureButtonPermitted: function (buttonName) {
    var config = BUTTON_SWITCH[buttonName];
    if (!config) return true;
    if (config.permitted) return true;
    if (config.deniedMessage) this.showToast(config.deniedMessage, "error", CONFIG.TOAST_ERROR_DURATION);
    return false;
  },

  // ============== 视图切换 ==============
  switchView: function (viewName) {
    this.state.view = viewName;
    $(".view-detail").toggleClass("active", viewName === "detail");
    $(".view-list").toggleClass("active", viewName === "list");
  },

  scrollActiveViewTop: function () {
    if (this.state.view === "list") $(".table-container").scrollTop(0);
    else $(".content").scrollTop(0);
  },

  openList: function () {
    if (!this.state.mainCategories.length) {
      this.showToast("请先查询订单", "error", CONFIG.TOAST_ERROR_DURATION);
      return;
    }
    this.switchView("list");
    this.renderAll();
    this.scrollActiveViewTop();
  },

  backDetail: function () {
    if (!this.state.mainCategories.length) {
      this.showToast("请先查询订单", "error", CONFIG.TOAST_ERROR_DURATION);
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
    this.renderCollapsedState();
  },

  // ============== 查询与扫码 ==============
  queryOrder: function (searchKey) {
    var keyword = this.toText(searchKey).trim();
    if (!keyword) {
      this.showToast("请输入单号/VIN/月顺序号", "error", CONFIG.TOAST_ERROR_DURATION);
      $(".input-search").trigger("focus");
      return;
    }
    if (this.state.querying) return;
    if (typeof window.getCertificateAiCollectTask !== "function") {
      this.showToast("查询接口未接入，请稍后重试", "error", CONFIG.TOAST_ERROR_DURATION);
      return;
    }

    var self = this;
    this.state.querying = true;
    var $loadingToast = this.showToast("查询中...", "loading", 0);
    this.apiCall(
      window.getCertificateAiCollectTask,
      [{ searchKey: keyword }],
      function (response) {
        self.state.querying = false;
        self.removeToast($loadingToast);
        if (!response || response.code !== 0) {
          self.showToast(
            response && response.msg ? response.msg : "未查询到订单，请重试",
            "error",
            CONFIG.TOAST_ERROR_DURATION,
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
    this.state.orderCollapsed = false;
    if (normalized.orderInfo.orderNo) $(".input-search").val(normalized.orderInfo.orderNo);
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
      if (window.parent && typeof window.parent.OpenCamera === "function") openCamera = window.parent.OpenCamera;
    } catch (error) {
      // 跨域访问 window.parent 会抛 SecurityError
    }
    if (!openCamera && typeof window.OpenCamera === "function") openCamera = window.OpenCamera;
    if (!openCamera) {
      this.showToast("扫码功能仅在移动端可用，请手动输入", "error", CONFIG.TOAST_ERROR_DURATION);
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
          self.showToast("未获取到扫码结果", "error", CONFIG.TOAST_ERROR_DURATION);
          return;
        }
        $(".input-search").val(value);
        self.queryOrder(value);
      });
    } catch (error) {
      this.showToast("扫码功能暂不可用，请手动输入", "error", CONFIG.TOAST_ERROR_DURATION);
    }
  },

  // ============== 拍照与图片 ==============
  openPhotoPicker: function ($card) {
    var found = this.getSubcategoryFromCard($card);
    if (!found) return;
    var subcategory = found.subcategory;
    if (subcategory.maxCount === 0 || subcategory.status === "pending") return;
    if (subcategory.images.length >= subcategory.maxCount) {
      this.showToast("该子类别已达拍摄上限", "error", CONFIG.TOAST_ERROR_DURATION);
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
      this.showToast("请选择图片文件", "error", CONFIG.TOAST_ERROR_DURATION);
      return;
    }
    if (!file.size) {
      this.showToast("图片文件为空，请重新选择", "error", CONFIG.TOAST_ERROR_DURATION);
      return;
    }
    if (file.size > CONFIG.MAX_SOURCE_FILE_SIZE) {
      this.showToast("图片过大，请选择 20MB 以内的照片", "error", CONFIG.TOAST_ERROR_DURATION);
      return;
    }

    var found = this.getSubcategoryByKey(uploadKey);
    if (!found) return;
    if (found.subcategory.maxCount === 0 || found.subcategory.status === "pending") return;
    if (found.subcategory.images.length >= found.subcategory.maxCount) {
      this.showToast("该子类别已达拍摄上限", "error", CONFIG.TOAST_ERROR_DURATION);
      return;
    }
    if (this.state.readingImage) {
      this.showToast("图片处理中，请稍候", "error", CONFIG.TOAST_ERROR_DURATION);
      return;
    }

    var self = this;
    var sessionId = this.state.taskSessionId;
    this.state.readingImage = true;
    var $loadingToast = this.showToast("图片处理中...", "loading", 0);
    this.compressImage(
      file,
      function (base64) {
        self.state.readingImage = false;
        self.removeToast($loadingToast);
        if (sessionId !== self.state.taskSessionId) return;
        var current = self.getSubcategoryByKey(uploadKey);
        if (!current) return;
        if (current.subcategory.images.length >= current.subcategory.maxCount) {
          self.showToast("该子类别已达拍摄上限", "error", CONFIG.TOAST_ERROR_DURATION);
          return;
        }
        current.subcategory.images.push(base64);
        self.invalidateSubcategory(current.subcategory);
        self.renderAll();
      },
      function (message) {
        self.state.readingImage = false;
        self.removeToast($loadingToast);
        if (sessionId !== self.state.taskSessionId) return;
        self.showToast(message || "图片读取失败，请重试", "error", CONFIG.TOAST_ERROR_DURATION);
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
    var found = this.getSubcategoryFromCard($button.closest(".sub-item-card"));
    if (!found) return;
    var subcategory = found.subcategory;
    if (subcategory.status !== "uncollected" && subcategory.status !== "fail") return;
    var index = parseInt($button.attr("data-index"), 10);
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
          target.aiResult = response && response.msg ? response.msg : "识别超时，请重试";
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
      this.showToast("该子类别还没有照片，请先拍照", "error", CONFIG.TOAST_ERROR_DURATION);
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
    this.showToast("已重置，请重新拍照", "success", CONFIG.TOAST_SUCCESS_DURATION);
  },

  // ============== 保存并继续 ==============
  saveAndContinue: function () {
    if (this.state.querying || this.state.submitting) return;
    var mainCategories = this.state.mainCategories;
    if (!mainCategories.length) {
      this.showToast("请先查询订单", "error", CONFIG.TOAST_ERROR_DURATION);
      return;
    }
    var mainCategory = mainCategories[this.state.currentMainIndex];
    if (!mainCategory) {
      this.showToast("当前主类别不存在", "error", CONFIG.TOAST_ERROR_DURATION);
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
          "【" + subcategory.subcategoryName + "】需至少 " + minimum + " 张，当前 " + subcategory.images.length + " 张",
        );
      } else {
        messages.push(
          "【" + subcategory.subcategoryName + "】最多 " + subcategory.maxCount + " 张，当前 " + subcategory.images.length + " 张",
        );
      }
    }

    if (messages.length) {
      this.showToast("未完成！" + messages.join("；"), "error", CONFIG.TOAST_ERROR_DURATION);
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

  // ============== 事件 ==============
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

    $root.on("click", ".btn-collapse-header, .header-toggle", function () {
      self.toggleOrderInfo();
    });

    $root.on("click", ".btn-open-list", function () {
      if ($(this).hasClass("disabled")) {
        self.showToast("请先查询订单", "error", CONFIG.TOAST_ERROR_DURATION);
        return;
      }
      self.openList();
    });

    $root.on("click", ".btn-save", function () {
      if ($(this).hasClass("disabled")) {
        self.showToast("请先查询订单", "error", CONFIG.TOAST_ERROR_DURATION);
        return;
      }
      self.saveAndContinue();
    });

    $root.on("click", ".btn-back-detail", function () {
      if ($(this).hasClass("disabled")) {
        self.showToast("请先查询订单", "error", CONFIG.TOAST_ERROR_DURATION);
        return;
      }
      self.backDetail();
    });

    $root.on("click", ".upload-box", function () {
      self.openPhotoPicker($(this).closest(".sub-item-card"));
    });

    $root.on("click", ".img-del-bar", function (event) {
      event.stopPropagation();
      self.removePhoto($(this));
    });

    $root.on("click", ".btn-re-recognize", function () {
      self.reRecognize($(this).closest(".sub-item-card"));
    });

    $root.on("click", ".btn-reset-data", function () {
      if ($(this).prop("disabled")) return;
      self.openResetConfirm($(this).closest(".sub-item-card"));
    });

    $root.on("click", ".list-row", function () {
      self.jumpToMainCategory($(this).attr("data-main-index"));
    });

    $root.on("click", ".confirm-btn-cancel", function () {
      self.hideConfirm();
    });

    $root.on("click", ".confirm-btn-ok", function () {
      self.confirmReset();
    });

    $(".confirm-mask").on("click", function (event) {
      if (event.target === this) self.hideConfirm();
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

    $root.on("keydown", ".list-row", function (event) {
      var originalEvent = event.originalEvent || event;
      if (originalEvent.isComposing || event.keyCode === 229) return;
      if (event.key !== "Enter" && event.key !== " " && event.keyCode !== 13 && event.keyCode !== 32) return;
      event.preventDefault();
      self.jumpToMainCategory($(this).attr("data-main-index"));
    });
  },

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

    var presetOrderNo = window.CertificateAiCollectOrderNo || "";
    if (presetOrderNo) {
      $(".input-search").val(presetOrderNo);
      this.queryOrder(presetOrderNo);
    }
  },
};

function Portal_OnDocumentKeyDown() {}

$(function () {
  CertificateAiCollect.initPage();
});
