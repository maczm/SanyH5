// ============== 配置 ==============
var CONFIG = {
  MAX_IMAGE_WIDTH: 3000,
  MAX_IMAGE_HEIGHT: 3000,
  JPEG_QUALITY: 0.8,
  MAX_SOURCE_FILE_SIZE: 20 * 1024 * 1024,
  API_TIMEOUT: 10000,
  UPLOAD_TIMEOUT: 30000,
  RECOGNITION_TIMEOUT: 130000,
  TOAST_ERROR_DURATION: 4000,
  TOAST_SUCCESS_DURATION: 2000,
  TOAST_WARNING_DURATION: 1500,
  // 前端可配置：自动刷新间隔（秒）
  REFRESH_INTERVAL_SECONDS: 10,
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
    queryTokenSeed: 0,
    overallStatus: "empty",
    refreshCountdown: 0,
    refreshIntervalSeconds: CONFIG.REFRESH_INTERVAL_SECONDS,
    refreshInFlight: false,
    refreshErrorType: "",
    refreshErrorMessage: "",
    refreshErrorNotified: false,
    initialized: false,
  },

  _initRetryCount: 0,
  _fuidSeed: 0,
  _countdownTimer: null,

  cloneTemplate: function (templateClassName) {
    var template = document.querySelector("." + templateClassName);
    if (!template) return $();
    var fragment = template.content.cloneNode(true);
    return $(fragment.firstElementChild);
  },

  logApiJson: function (label, data) {
    var json = "";
    try {
      json = JSON.stringify(data === undefined ? null : data);
    } catch (error) {
      json = "[JSON.stringify failed]";
    }
    console.log("[CertificateAiCollect][" + label + "] " + json);
  },

  apiCall: function (fn, args, callback, timeout, apiName) {
    args = args || [];
    var name = apiName || (fn && fn.name) || "api";
    var self = this;
    var requestPayload = args.length ? args[0] : null;
    self.logApiJson(name + " request", requestPayload);

    if (typeof fn !== "function") {
      var configError = { code: -1, errorType: "config", msg: "接口未接入，请稍后重试" };
      self.logApiJson(name + " response", configError);
      callback(configError);
      return;
    }

    var done = false;
    var timer = setTimeout(function () {
      if (done) return;
      done = true;
      var timeoutError = { code: -1, errorType: "timeout", msg: "请求超时，请重试" };
      self.logApiJson(name + " response", timeoutError);
      callback(timeoutError);
    }, timeout || CONFIG.API_TIMEOUT);

    try {
      fn.apply(
        null,
        args.concat([
          function (response) {
            if (done) return;
            done = true;
            clearTimeout(timer);
            if (response && response.code !== 0 && !response.errorType) {
              response.errorType = "business";
            }
            self.logApiJson(name + " response", response);
            callback(response);
          },
        ]),
      );
    } catch (error) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      var networkError = { code: -1, errorType: "network", msg: "网络异常，请重试" };
      self.logApiJson(name + " response", networkError);
      callback(networkError);
    }
  },

  createFuid: function () {
    this._fuidSeed++;
    return "f" + Date.now().toString(36) + "-" + this._fuidSeed + "-" + Math.random().toString(36).slice(2, 8);
  },

  getOperator: function () {
    return window.Operator || "开发用户";
  },

  getErrorType: function (response) {
    if (!response) return "network";
    if (response.errorType) return response.errorType;
    if (response.code === -2) return "network";
    if (response.code === -1) return "timeout";
    return "business";
  },

  getFriendlyErrorMessage: function (response, actionName) {
    var errorType = this.getErrorType(response);
    if (errorType === "network") return "网络异常，" + actionName + "失败，请检查网络后重试";
    if (errorType === "timeout") return "请求超时，" + actionName + "失败，请重试";
    if (errorType === "config") return "接口未接入，请稍后重试";
    return response && response.msg ? response.msg : actionName + "失败，请重试";
  },

  getImageSource: function (image) {
    if (!image) return "";
    return image.url || image.dataUrl || "";
  },

  normalizeImage: function (image, index) {
    if (typeof image === "string") {
      return { fuid: this.createFuid(), dataUrl: image, url: "", sort: index };
    }
    var source = image || {};
    return {
      fuid: this.toText(source.fuid) || this.createFuid(),
      url: this.toText(source.url),
      oss: this.toText(source.oss),
      dataUrl: this.toText(source.dataUrl),
      fileName: this.toText(source.fileName),
      size: this.toNumber(source.size, 0),
      contentType: this.toText(source.contentType),
      width: this.toNumber(source.width, 0),
      height: this.toNumber(source.height, 0),
      sort: this.toNumber(source.sort, index),
    };
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

  serializeImages: function (images) {
    var list = Object.prototype.toString.call(images) === "[object Array]" ? images : [];
    return list.map(function (image, index) {
      var source = image || {};
      return {
        fuid: source.fuid || "",
        fileName: source.fileName || "",
        url: source.url || "",
        oss: source.oss || "",
        size: source.size || 0,
        contentType: source.contentType || "",
        width: source.width || 0,
        height: source.height || 0,
        sort: typeof source.sort === "number" ? source.sort : index,
      };
    });
  },

  uploadImage: function (payload, callback) {
    if (typeof window.uploadCertificateAiCollectImage !== "function") {
      callback({ code: -1, errorType: "config", msg: "图片上传接口未接入，请稍后重试" });
      return;
    }
    this.apiCall(
      window.uploadCertificateAiCollectImage,
      [payload],
      callback,
      CONFIG.UPLOAD_TIMEOUT,
      "uploadCertificateAiCollectImage",
    );
  },

  parseBoolean: function (value) {
    return value === true || value === 1 || value === "1" || value === "true";
  },

  // ============== 顶部 Toast（可堆叠，不阻断操作） ==============
  showToast: function (message, type, duration) {
    var $toast = this.cloneTemplate("template-cert-ai-toast");
    if (!$toast.length) return $toast;
    var iconMap = { loading: "⏳", success: "✅", error: "❌", warning: "⚠️" };
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
    this.renderRefreshChip();
  },

  hideConfirm: function () {
    this.state.pendingResetKey = "";
    $(".confirm-mask").addClass("hidden");
    this.renderRefreshChip();
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

      var allowedStatuses = { uncollected: true, pending: true, success: true, fail: true };
      var status = allowedStatuses[row.status] ? row.status : "uncollected";
      var result = row.result === "pass" || row.result === "fail" ? row.result : null;
      var failureType = this.toText(row.failureType);
      if (status === "success") {
        result = "pass";
        failureType = "";
      } else if (status === "fail" && !failureType) {
        failureType = result === "fail" ? "aiRejected" : "apiError";
      }
      var imageList = [];
      if (Object.prototype.toString.call(row.images) === "[object Array]") {
        for (var imageIndex = 0; imageIndex < row.images.length; imageIndex++) {
          imageList.push(this.normalizeImage(row.images[imageIndex], imageIndex));
        }
      }

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
        requestId: this.toText(row.requestId) || this.createFuid(),
        recognitionId: this.toText(row.recognitionId),
        images: imageList,
        status: status,
        result: result,
        failureType: failureType,
        aiResult: this.toText(row.aiResult),
        recognitionTime: this.toText(row.recognitionTime),
        dirty: false,
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

  getEligibleSubcategories: function (mainCategory) {
    var result = [];
    for (var i = 0; i < mainCategory.subs.length; i++) {
      var subcategory = mainCategory.subs[i];
      if (subcategory.maxCount === 0) continue;
      if (subcategory.required || subcategory.images.length > 0 || subcategory.status !== "uncollected") {
        result.push(subcategory);
      }
    }
    return result;
  },

  isAllNoNeed: function (mainCategory) {
    if (!mainCategory.subs.length) return false;
    for (var i = 0; i < mainCategory.subs.length; i++) {
      if (mainCategory.subs[i].maxCount > 0) return false;
    }
    return true;
  },

  computeMainCategoryStatus: function (mainCategory) {
    var eligible = this.getEligibleSubcategories(mainCategory);
    if (!eligible.length) return "uncollected";
    var hasFail = false;
    var hasPending = false;
    var allSuccess = true;
    for (var i = 0; i < eligible.length; i++) {
      var subcategory = eligible[i];
      if (subcategory.status === "fail") hasFail = true;
      if (subcategory.status === "pending") hasPending = true;
      if (subcategory.status !== "success") allSuccess = false;
    }
    if (hasFail) return "fail";
    if (hasPending) return "pending";
    if (allSuccess) return "success";
    return "uncollected";
  },

  computeMainCategoryResult: function (mainCategory) {
    var eligible = this.getEligibleSubcategories(mainCategory);
    if (!eligible.length) return null;
    var hasFail = false;
    var allPass = true;
    for (var i = 0; i < eligible.length; i++) {
      var subcategory = eligible[i];
      if (subcategory.result === "fail") hasFail = true;
      if (subcategory.result !== "pass") allPass = false;
    }
    if (hasFail) return "fail";
    if (allPass) return "pass";
    return null;
  },

  computeOverallStatus: function () {
    var mainCategories = this.state.mainCategories;
    if (!mainCategories.length) return "empty";
    var hasStatusFail = false;
    var hasPending = false;
    var hasEligible = false;
    var allEligiblePass = true;
    for (var i = 0; i < mainCategories.length; i++) {
      var mainCategory = mainCategories[i];
      var eligible = this.getEligibleSubcategories(mainCategory);
      var status = this.computeMainCategoryStatus(mainCategory);
      var result = this.computeMainCategoryResult(mainCategory);
      mainCategory.status = status;
      mainCategory.result = result;
      if (eligible.length) {
        hasEligible = true;
        if (result !== "pass") allEligiblePass = false;
      }
      if (status === "fail") hasStatusFail = true;
      if (status === "pending") hasPending = true;
    }
    if (hasStatusFail) return "fail";
    if (hasPending) return "pending";
    if (hasEligible && allEligiblePass) return "success";
    return "uncollected";
  },

  getSubcategoryStatusTag: function (subcategory) {
    if (subcategory.maxCount === 0) return { text: "无需采集", className: "tag-gray" };
    if (subcategory.status === "pending") return { text: "识别中", className: "tag-warning" };
    if (subcategory.status === "success") return { text: "识别完成", className: "tag-green" };
    if (subcategory.status === "fail") return { text: "识别失败", className: "tag-red" };
    return { text: "未采集", className: "tag-blue" };
  },

  getMainCategoryStatusTag: function (status, allNoNeed) {
    if (allNoNeed) return { text: "无需采集", className: "status-none" };
    if (status === "pending") return { text: "识别中", className: "status-pending" };
    if (status === "success") return { text: "识别完成", className: "status-success" };
    if (status === "fail") return { text: "识别失败", className: "status-fail" };
    return { text: "未采集完成", className: "status-uncollected" };
  },

  getMainResultTag: function (result) {
    if (result === "pass") return { text: "结果：通过", className: "result-pass" };
    if (result === "fail") return { text: "结果：不通过", className: "result-fail" };
    return { text: "结果：-", className: "result-none" };
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

  getAiResultDisplay: function (subcategory) {
    var timeSuffix = subcategory.recognitionTime ? " · 识别时间：" + subcategory.recognitionTime : "";
    if (subcategory.maxCount === 0) {
      return { label: "AI结论：", text: "无需识别", className: "status-none" };
    }
    if (subcategory.status === "pending") {
      return { label: "AI结论：", text: "识别中...", className: "status-pending" };
    }
    if (subcategory.status === "success") {
      return {
        label: "AI结论：",
        text: (subcategory.aiResult || "照片清晰，校验通过") + timeSuffix,
        className: "status-success",
      };
    }
    if (subcategory.status === "fail") {
      if (subcategory.failureType === "apiError") {
        return {
          label: "接口异常：",
          text: (subcategory.aiResult || "识别接口异常") + timeSuffix,
          className: "status-fail",
        };
      }
      if (subcategory.failureType === "timeout") {
        return {
          label: "识别超时：",
          text: (subcategory.aiResult || "识别超时，请重试") + timeSuffix,
          className: "status-fail",
        };
      }
      return {
        label: "AI结论：",
        text: (subcategory.aiResult || "图片模糊，无法识别") + timeSuffix,
        className: "status-fail",
      };
    }
    return { label: "AI结论：", text: "待识别", className: "status-none" };
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
    this.renderRefreshChip();
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
    $(".category-title").text("采集项：" + (mainCategory.name || "-"));

    var allNoNeed = this.isAllNoNeed(mainCategory);
    var mainTag = this.getMainCategoryStatusTag(mainCategory.status, allNoNeed);
    $(".main-status-text").attr("class", "main-status-text " + mainTag.className).text(mainTag.text);
    var resultTag = this.getMainResultTag(mainCategory.result);
    $(".main-result-text").attr("class", "main-result-text " + resultTag.className).text(resultTag.text);

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
      $reqTag.addClass("hidden");
    } else if (subcategory.required) {
      $reqTag.removeClass("hidden").attr("class", "req-tag").text("必采");
    } else {
      $reqTag.removeClass("hidden").attr("class", "req-tag optional").text("选采");
    }

    var $countTag = $card.find(".count-tag");
    var countText = this.getCountText(subcategory);
    if (subcategory.maxCount > 0) countText += " (已拍 " + subcategory.images.length + ")";
    var countClass = "unmet";
    if (
      subcategory.maxCount > 0 &&
      this.checkSubcategoryCountValid(subcategory) &&
      !(subcategory.images.length === 0 && !subcategory.required)
    ) {
      countClass = "met";
    }
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
    var canEdit = subcategory.status === "uncollected";
    var canDelete = canEdit;

    for (var i = 0; i < subcategory.images.length; i++) {
      var $photo = this.cloneTemplate("template-cert-ai-photo-item");
      $photo
        .find("img")
        .attr("src", this.getImageSource(subcategory.images[i]))
        .attr("alt", subcategory.subcategoryName + " 采集照片 " + (i + 1));
      $photo.find(".img-del-bar").attr("data-index", i).toggleClass("hidden", !canDelete);
      $photo.find(".loading-mask").toggleClass("hidden", subcategory.status !== "pending");
      $uploadBox.before($photo);
    }

    if (subcategory.maxCount === 0) {
      $uploadBox.addClass("hidden");
      $noNeed.removeClass("hidden");
    } else if (!canEdit || subcategory.images.length >= subcategory.maxCount) {
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
    var showReset = subcategory.status === "success" || subcategory.status === "fail";
    $pendingButton.toggleClass("hidden", !showPending);
    $reRecognize.toggleClass("hidden", !showReRecognize);
    $resetData.toggleClass("hidden", !showReset).prop("disabled", false);
    $actionRow.toggleClass("hidden", !(showPending || showReRecognize || showReset));

    var aiDisplay = this.getAiResultDisplay(subcategory);
    $card
      .find(".ai-result-row")
      .removeClass("status-success status-fail status-pending status-none")
      .addClass(aiDisplay.className);
    $card.find(".ai-result-label").text(aiDisplay.label);
    $card.find(".ai-result-value").text(aiDisplay.text);
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

    var hasResultFail = false;
    for (var index = 0; index < mainCategories.length; index++) {
      if (mainCategories[index].result === "fail") hasResultFail = true;
    }

    var conclusionText = "";
    if (overallStatus === "empty") {
      conclusionText = this.state.orderInfo.orderNo ? "暂无采集项" : "待查询";
    } else if (overallStatus === "success") {
      conclusionText = "全部通过";
      $conclusion.addClass("status-success");
    } else if (overallStatus === "fail") {
      conclusionText = hasResultFail ? "存在异常（不通过）" : "存在识别失败";
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

    var allNoNeed = this.isAllNoNeed(mainCategory);
    var statusText = "未采集完成";
    var statusClass = "status-uncollected";
    if (allNoNeed) {
      statusText = "无需采集";
      statusClass = "status-none";
    } else if (mainCategory.status === "pending") {
      statusText = "识别中";
      statusClass = "status-waiting";
    } else if (mainCategory.status === "success") {
      statusText = "识别完成";
      statusClass = "status-pass";
    } else if (mainCategory.status === "fail") {
      statusText = "识别失败";
      statusClass = "status-fail";
    }
    $row.find(".list-status").attr("class", "list-status " + statusClass).text(statusText);

    var resultText = "-";
    var resultClass = "status-none";
    if (mainCategory.result === "pass") {
      resultText = "通过";
      resultClass = "status-pass";
    } else if (mainCategory.result === "fail") {
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

  hasPendingRecognition: function () {
    var mainCategories = this.state.mainCategories;
    for (var i = 0; i < mainCategories.length; i++) {
      for (var j = 0; j < mainCategories[i].subs.length; j++) {
        if (mainCategories[i].subs[j].status === "pending") return true;
      }
    }
    return false;
  },

  hasDirtyLocalData: function () {
    var mainCategories = this.state.mainCategories;
    for (var i = 0; i < mainCategories.length; i++) {
      for (var j = 0; j < mainCategories[i].subs.length; j++) {
        var subcategory = mainCategories[i].subs[j];
        if (subcategory.dirty && subcategory.images.length > 0) return true;
      }
    }
    return false;
  },

  isRefreshPaused: function () {
    return (
      document.hidden ||
      this.state.querying ||
      this.state.submitting ||
      this.state.readingImage ||
      this.hasDirtyLocalData() ||
      $(".confirm-mask").not(".hidden").length > 0 ||
      $(".conflict-mask").not(".hidden").length > 0 ||
      $(".refresh-config-mask").not(".hidden").length > 0
    );
  },

  getRefreshIntervalSeconds: function () {
    var seconds = parseFloat(this.state.refreshIntervalSeconds);
    if (isNaN(seconds)) return CONFIG.REFRESH_INTERVAL_SECONDS;
    return Math.min(600, Math.max(3, Math.round(seconds)));
  },

  stopRefreshTimer: function () {
    if (this._countdownTimer) {
      clearInterval(this._countdownTimer);
      this._countdownTimer = null;
    }
  },

  startRefreshTimer: function (initialSeconds) {
    this.stopRefreshTimer();
    if (!this.state.mainCategories.length || !this.state.orderInfo.orderNo) {
      this.state.refreshCountdown = 0;
      this.renderRefreshChip();
      return;
    }
    this.state.refreshCountdown =
      typeof initialSeconds === "number" ? initialSeconds : this.getRefreshIntervalSeconds();
    this.renderRefreshChip();
    var self = this;
    this._countdownTimer = setInterval(function () {
      self.tickRefreshCountdown();
    }, 1000);
  },

  tickRefreshCountdown: function () {
    if (!this.state.mainCategories.length || !this.state.orderInfo.orderNo) {
      this.stopRefreshTimer();
      this.renderRefreshChip();
      return;
    }
    if (this.state.refreshInFlight || this.isRefreshPaused()) {
      this.renderRefreshChip();
      return;
    }
    this.state.refreshCountdown--;
    if (this.state.refreshCountdown <= 0) {
      this.refreshSilently(false);
      return;
    }
    this.renderRefreshChip();
  },

  refreshSilently: function (manual) {
    if (!this.state.mainCategories.length || !this.state.orderInfo.orderNo) {
      this.stopRefreshTimer();
      this.renderRefreshChip();
      return;
    }
    if (this.state.refreshInFlight) return;
    if (!manual && this.isRefreshPaused()) {
      this.state.refreshCountdown = this.getRefreshIntervalSeconds();
      this.renderRefreshChip();
      return;
    }
    if (typeof window.getCertificateAiCollectStatus !== "function") {
      this.state.refreshErrorType = "config";
      this.state.refreshErrorMessage = "状态查询接口未接入";
      this.renderRefreshChip();
      return;
    }

    var self = this;
    this.state.refreshInFlight = true;
    this.renderRefreshChip();
    this.apiCall(
      window.getCertificateAiCollectStatus,
      [{ orderNo: this.state.orderInfo.orderNo }],
      function (response) {
        self.state.refreshInFlight = false;
        if (!response || response.code !== 0) {
          self.state.refreshErrorType = self.getErrorType(response);
          self.state.refreshErrorMessage = self.getFriendlyErrorMessage(response, "刷新");
          if (!self.state.refreshErrorNotified) {
            self.state.refreshErrorNotified = true;
            self.showToast(self.state.refreshErrorMessage, "error", CONFIG.TOAST_ERROR_DURATION);
          }
          self.state.refreshCountdown = self.getRefreshIntervalSeconds();
          self.renderRefreshChip();
          return;
        }
        self.state.refreshErrorType = "";
        self.state.refreshErrorMessage = "";
        self.state.refreshErrorNotified = false;
        self.mergeStatusData(response.data || {});
        self.renderAll();
        self.state.refreshCountdown = self.getRefreshIntervalSeconds();
        self.renderRefreshChip();
      },
      CONFIG.API_TIMEOUT,
      "getCertificateAiCollectStatus",
    );
  },

  applySubcategoryStatus: function (subcategory, record) {
    if (!subcategory || !record) return false;
    if (subcategory.dirty) return false;
    if (record.mainCategoryCode && record.mainCategoryCode !== subcategory.mainCategoryCode) return false;
    if (record.subcategoryCode && record.subcategoryCode !== subcategory.subcategoryCode) return false;
    if (record.requestId && subcategory.requestId && record.requestId !== subcategory.requestId) return false;
    if (record.businessId && subcategory.businessId && record.businessId !== subcategory.businessId) return false;
    // 不用“未采集”覆盖本地已产生的识别中/完成/失败状态（提交失败时后台可能还没有识别记录）
    if (record.status === "uncollected" && subcategory.status !== "uncollected") return false;

    var allowedStatuses = { uncollected: true, pending: true, success: true, fail: true };
    var nextStatus = allowedStatuses[record.status] ? record.status : subcategory.status;
    var nextFailureType = this.toText(record.failureType);
    var nextResult = null;
    if (nextStatus === "success" || record.result === "pass") {
      nextStatus = "success";
      nextResult = "pass";
      nextFailureType = "";
    } else if (nextStatus === "fail" || record.result === "fail") {
      nextStatus = "fail";
      nextResult = record.result === "fail" || nextFailureType === "aiRejected" ? "fail" : null;
    }

    subcategory.status = nextStatus;
    subcategory.result = nextResult;
    subcategory.failureType = nextFailureType;
    subcategory.aiResult = this.toText(record.aiResult);
    subcategory.recognitionTime = this.toText(record.recognitionTime);
    if (record.requestId) subcategory.requestId = record.requestId;
    return true;
  },

  extractRecognitionRecord: function (data, subcategory) {
    var source = data || {};
    if (source.subcategory && typeof source.subcategory === "object") return source.subcategory;
    if (Object.prototype.toString.call(source.subcategories) === "[object Array]") {
      for (var i = 0; i < source.subcategories.length; i++) {
        var record = source.subcategories[i] || {};
        if (
          record.mainCategoryCode === subcategory.mainCategoryCode &&
          record.subcategoryCode === subcategory.subcategoryCode
        ) {
          return record;
        }
      }
    }
    if (source.status || source.result || source.aiResult) return source;
    return null;
  },

  mergeStatusData: function (data) {
    var list = Object.prototype.toString.call(data.subcategories) === "[object Array]" ? data.subcategories : [];
    for (var i = 0; i < list.length; i++) {
      var record = list[i] || {};
      var found = this.findSubcategory(record.mainCategoryCode, record.subcategoryCode);
      if (!found) continue;
      this.applySubcategoryStatus(found.subcategory, record);
    }
  },

  renderRefreshChip: function () {
    var $control = $(".refresh-control");
    if (!this.state.mainCategories.length || !this.state.orderInfo.orderNo) {
      $control.addClass("hidden");
      return;
    }
    $control.removeClass("hidden is-error is-paused is-pending");
    var text = "";
    var title = "";
    if (this.state.refreshInFlight) {
      text = "刷新中";
      title = "正在刷新状态";
    } else if (this.state.refreshErrorType) {
      $control.addClass("is-error");
      if (this.state.refreshErrorType === "network") text = "网络异常·重试";
      else if (this.state.refreshErrorType === "timeout") text = "刷新超时·重试";
      else if (this.state.refreshErrorType === "config") text = "刷新不可用";
      else text = "刷新失败·重试";
      title = this.state.refreshErrorMessage + "，点击重试";
    } else if (this.isRefreshPaused()) {
      $control.addClass("is-paused");
      text = "已暂停";
      title = "有未保存数据或弹窗，刷新已暂停";
    } else {
      text = this.state.refreshCountdown + "s";
      title = this.state.refreshCountdown + "秒后刷新，点击立即刷新";
    }
    $control.find(".refresh-text").text(text);
    $(".refresh-chip").attr("title", title).attr("aria-label", title);
  },

  updateRefreshPresetSelection: function (seconds) {
    $(".refresh-preset").each(function () {
      var presetSeconds = parseInt($(this).attr("data-seconds"), 10);
      $(this).toggleClass("active", presetSeconds === seconds);
    });
  },

  openRefreshConfigModal: function () {
    if (!this.state.mainCategories.length) return;
    var seconds = this.getRefreshIntervalSeconds();
    $(".refresh-custom-input").val(seconds);
    $(".refresh-config-error").addClass("hidden");
    this.updateRefreshPresetSelection(seconds);
    $(".refresh-config-mask").removeClass("hidden");
    this.renderRefreshChip();
  },

  closeRefreshConfigModal: function () {
    $(".refresh-config-mask").addClass("hidden");
    this.renderRefreshChip();
  },

  saveRefreshConfig: function () {
    var seconds = parseInt($(".refresh-custom-input").val(), 10);
    if (isNaN(seconds) || seconds < 3 || seconds > 600) {
      $(".refresh-config-error").removeClass("hidden");
      return;
    }
    $(".refresh-config-error").addClass("hidden");
    this.state.refreshIntervalSeconds = seconds;
    this.closeRefreshConfigModal();
    this.startRefreshTimer();
  },

  handleRefreshChipClick: function () {
    if (!this.state.mainCategories.length || !this.state.orderInfo.orderNo) return;
    if (this.state.querying || this.state.submitting || this.state.readingImage) return;
    if (this.hasDirtyLocalData()) {
      this.showToast("有未保存的图片，暂不刷新", "warning", CONFIG.TOAST_WARNING_DURATION);
      return;
    }
    if (
      $(".confirm-mask").not(".hidden").length ||
      $(".conflict-mask").not(".hidden").length ||
      $(".refresh-config-mask").not(".hidden").length
    ) {
      return;
    }
    this.state.refreshErrorType = "";
    this.state.refreshErrorMessage = "";
    this.state.refreshErrorNotified = false;
    this.state.refreshCountdown = 0;
    this.refreshSilently(true);
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
    this.state.queryTokenSeed++;
    var queryToken = this.state.queryTokenSeed;
    this.state.querying = true;
    this.renderRefreshChip();
    var $loadingToast = this.showToast("查询中...", "loading", 0);
    this.apiCall(
      window.getCertificateAiCollectTask,
      [{ searchKey: keyword }],
      function (response) {
        if (queryToken !== self.state.queryTokenSeed) {
          self.removeToast($loadingToast);
          return;
        }
        self.state.querying = false;
        self.removeToast($loadingToast);
        if (!response || response.code !== 0) {
          self.showToast(self.getFriendlyErrorMessage(response, "查询"), "error", CONFIG.TOAST_ERROR_DURATION);
          self.renderRefreshChip();
          return;
        }
        self.applyTaskData(response.data || {});
      },
      CONFIG.API_TIMEOUT,
      "getCertificateAiCollectTask",
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
    this.startRefreshTimer();
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
    if (subcategory.maxCount === 0 || subcategory.status !== "uncollected") return;
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
    if (found.subcategory.maxCount === 0 || found.subcategory.status !== "uncollected") return;
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
    this.renderRefreshChip();
    var $loadingToast = this.showToast("图片处理中...", "loading", 0);
    this.compressImage(
      file,
      function (compressed) {
        if (sessionId !== self.state.taskSessionId) {
          self.state.readingImage = false;
          self.removeToast($loadingToast);
          self.renderRefreshChip();
          return;
        }
        var current = self.getSubcategoryByKey(uploadKey);
        if (!current) {
          self.state.readingImage = false;
          self.removeToast($loadingToast);
          self.renderRefreshChip();
          return;
        }
        if (current.subcategory.images.length >= current.subcategory.maxCount) {
          self.state.readingImage = false;
          self.removeToast($loadingToast);
          self.renderRefreshChip();
          self.showToast("该子类别已达拍摄上限", "error", CONFIG.TOAST_ERROR_DURATION);
          return;
        }

        $loadingToast.find(".toast-message").text("图片上传中...");
        var imageId = self.createFuid();
        var fileName = file.name || "";
        self.uploadImage(
          {
            fuid: imageId,
            fileName: fileName,
            base64: compressed.dataUrl,
          },
          function (response) {
            self.state.readingImage = false;
            self.removeToast($loadingToast);
            self.renderRefreshChip();
            if (sessionId !== self.state.taskSessionId) return;
            if (!response || response.code !== 0) {
              self.showToast(
                self.getFriendlyErrorMessage(response, "图片上传"),
                "error",
                CONFIG.TOAST_ERROR_DURATION,
              );
              return;
            }
            var data = response.data || {};
            if (!data.url || !data.oss) {
              self.showToast("图片上传返回缺少URL或OSS，请重试", "error", CONFIG.TOAST_ERROR_DURATION);
              return;
            }
            var latest = self.getSubcategoryByKey(uploadKey);
            if (!latest) return;
            if (latest.subcategory.images.length >= latest.subcategory.maxCount) {
              self.showToast("该子类别已达拍摄上限", "error", CONFIG.TOAST_ERROR_DURATION);
              return;
            }
            latest.subcategory.images.push({
              fuid: data.fuid || imageId,
              url: data.url,
              oss: data.oss,
              fileName: fileName,
              size: file.size || 0,
              contentType: file.type || "",
              width: compressed.width || 0,
              height: compressed.height || 0,
              sort: latest.subcategory.images.length,
            });
            self.invalidateSubcategory(latest.subcategory);
            self.renderAll();
            self.renderRefreshChip();
          },
        );
      },
      function (message) {
        self.state.readingImage = false;
        self.removeToast($loadingToast);
        self.renderRefreshChip();
        if (sessionId !== self.state.taskSessionId) return;
        self.showToast(message || "图片读取失败，请重试", "error", CONFIG.TOAST_ERROR_DURATION);
      },
    );
  },

  invalidateSubcategory: function (subcategory) {
    subcategory.status = "uncollected";
    subcategory.result = null;
    subcategory.failureType = "";
    subcategory.aiResult = "";
    subcategory.recognitionTime = "";
    subcategory.dirty = true;
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
    if (subcategory.status !== "uncollected") return;
    var index = parseInt($button.attr("data-index"), 10);
    if (isNaN(index) || index < 0 || index >= subcategory.images.length) return;
    subcategory.images.splice(index, 1);
    this.invalidateSubcategory(subcategory);
    this.renderAll();
    this.renderRefreshChip();
  },

  // ============== 识别 ==============
  applyRecognitionStartFailure: function (subcategory, response) {
    var errorType = this.getErrorType(response);
    subcategory.status = "fail";
    subcategory.result = null;
    subcategory.failureType = errorType === "timeout" ? "timeout" : "apiError";
    subcategory.aiResult = this.getFriendlyErrorMessage(response, "识别提交");
    subcategory.recognitionTime = "";
    subcategory.dirty = false;
    this.renderAll();
    this.startRefreshTimer();
    this.showToast(subcategory.aiResult, "error", CONFIG.TOAST_ERROR_DURATION);
  },

  startRecognition: function (subcategory) {
    if (!subcategory.images.length) return false;
    var self = this;
    var token = this.bumpRecognitionToken(subcategory.key);
    var businessId = this.createFuid();

    subcategory.status = "pending";
    subcategory.result = null;
    subcategory.failureType = "";
    subcategory.aiResult = "";
    subcategory.recognitionTime = "";
    subcategory.businessId = businessId;
    subcategory.dirty = false;

    this.renderAll();
    this.startRefreshTimer();

    if (typeof window.startCertificateAiCollectRecognition !== "function") {
      this.applyRecognitionStartFailure(subcategory, {
        code: -1,
        errorType: "config",
        msg: "识别接口未接入，请稍后重试",
      });
      return false;
    }

    var payload = {
      orderNo: this.state.orderInfo.orderNo || "",
      mainCategoryCode: subcategory.mainCategoryCode,
      subcategoryCode: subcategory.subcategoryCode,
      requestId: subcategory.requestId,
      businessId: businessId,
      images: this.serializeImages(subcategory.images),
      operator: this.getOperator(),
    };

    this.apiCall(
      window.startCertificateAiCollectRecognition,
      [payload],
      function (response) {
        if (self.state.recognitionTokens[subcategory.key] !== token) return;
        var current = self.getSubcategoryByKey(subcategory.key);
        if (!current) return;
        if (!response || response.code !== 0) {
          self.applyRecognitionStartFailure(current.subcategory, response);
          return;
        }
        var data = response.data || {};
        current.subcategory.recognitionId = data.recognitionId || businessId;
        var record = self.extractRecognitionRecord(data, current.subcategory);
        if (record) self.applySubcategoryStatus(current.subcategory, record);
        self.renderAll();
        self.startRefreshTimer();
      },
      CONFIG.RECOGNITION_TIMEOUT,
      "startCertificateAiCollectRecognition",
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
    if (typeof window.deactivateCertificateAiCollectItem !== "function") {
      this.showToast("更新数据接口未接入，请稍后重试", "error", CONFIG.TOAST_ERROR_DURATION);
      return;
    }

    var self = this;
    var subcategory = found.subcategory;
    var $loadingToast = this.showToast("更新中...", "loading", 0);
    this.apiCall(
      window.deactivateCertificateAiCollectItem,
      [
        {
          orderNo: this.state.orderInfo.orderNo || "",
          mainCategoryCode: subcategory.mainCategoryCode,
          subcategoryCode: subcategory.subcategoryCode,
          requestId: subcategory.requestId,
          businessId: this.createFuid(),
          operator: this.getOperator(),
        },
      ],
      function (response) {
        self.removeToast($loadingToast);
        if (!response || response.code !== 0) {
          self.showToast(self.getFriendlyErrorMessage(response, "更新数据"), "error", CONFIG.TOAST_ERROR_DURATION);
          return;
        }
        self.bumpRecognitionToken(subcategory.key);
        subcategory.images = [];
        subcategory.status = "uncollected";
        subcategory.result = null;
        subcategory.failureType = "";
        subcategory.aiResult = "";
        subcategory.recognitionTime = "";
        subcategory.requestId = self.createFuid();
        subcategory.dirty = false;
        self.renderAll();
        self.startRefreshTimer();
        self.showToast("已更新，请重新采集", "success", CONFIG.TOAST_SUCCESS_DURATION);
      },
      CONFIG.API_TIMEOUT,
      "deactivateCertificateAiCollectItem",
    );
  },

  advanceToNextItem: function () {
    var mainCategories = this.state.mainCategories;
    if (this.state.currentMainIndex < mainCategories.length - 1) {
      this.state.currentMainIndex++;
      this.renderAll();
      this.scrollActiveViewTop();
    } else {
      this.switchView("list");
      this.renderAll();
      this.scrollActiveViewTop();
    }
  },

  showConflict: function (data) {
    var operator = data && data.operator ? data.operator : "其他用户";
    var time = data && data.time ? data.time : "";
    var message = operator + (time ? "在" + time : "") + "已完成录入，请不要重复录入。";
    $(".conflict-message").text(message);
    $(".conflict-mask").removeClass("hidden");
    this.renderRefreshChip();
  },

  hideConflict: function () {
    $(".conflict-mask").addClass("hidden");
    this.renderRefreshChip();
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
      this.showToast("当前采集项不存在", "error", CONFIG.TOAST_ERROR_DURATION);
      return;
    }

    var self = this;
    var toSave = [];
    var hasIncomplete = false;
    for (var i = 0; i < mainCategory.subs.length; i++) {
      var subcategory = mainCategory.subs[i];
      if (subcategory.maxCount === 0) continue;
      if (subcategory.status !== "uncollected") continue;
      if (!this.checkSubcategoryCountValid(subcategory)) hasIncomplete = true;
      if (subcategory.images.length > 0) toSave.push(subcategory);
    }

    if (!toSave.length) {
      if (hasIncomplete) this.showToast("采集未完成", "warning", CONFIG.TOAST_WARNING_DURATION);
      else this.showToast("无可保存的新数据", "warning", CONFIG.TOAST_WARNING_DURATION);
      this.advanceToNextItem();
      return;
    }

    if (typeof window.saveCertificateAiCollectDraft !== "function") {
      this.showToast("保存接口未接入，请稍后重试", "error", CONFIG.TOAST_ERROR_DURATION);
      return;
    }

    this.state.submitting = true;
    this.renderRefreshChip();
    var businessId = this.createFuid();
    var payload = {
      orderNo: this.state.orderInfo.orderNo || "",
      operator: this.getOperator(),
      mainCategoryCode: mainCategory.code,
      businessId: businessId,
      subcategories: toSave.map(function (item) {
        return {
          mainCategoryCode: item.mainCategoryCode,
          subcategoryCode: item.subcategoryCode,
          requestId: item.requestId,
          images: self.serializeImages(item.images),
          status: "uncollected",
        };
      }),
    };

    var $loadingToast = this.showToast("保存中...", "loading", 0);
    this.apiCall(
      window.saveCertificateAiCollectDraft,
      [payload],
      function (response) {
        self.removeToast($loadingToast);
        self.state.submitting = false;
        self.renderRefreshChip();
        if (!response || response.code !== 0) {
          if (
            response &&
            (response.code === 40901 || response.errorType === "conflict")
          ) {
            self.showConflict(response.data || {});
            return;
          }
          self.showToast(self.getFriendlyErrorMessage(response, "保存"), "error", CONFIG.TOAST_ERROR_DURATION);
          return;
        }

        for (var a = 0; a < toSave.length; a++) {
          var saved = toSave[a];
          saved.dirty = false;
          if (self.checkSubcategoryCountValid(saved)) {
            self.startRecognition(saved);
          }
        }

        var stillIncomplete = false;
        for (var b = 0; b < mainCategory.subs.length; b++) {
          var current = mainCategory.subs[b];
          if (current.maxCount === 0) continue;
          if (current.status === "uncollected" && !self.checkSubcategoryCountValid(current)) {
            stillIncomplete = true;
          }
        }
        if (stillIncomplete) {
          self.showToast("采集未完成", "warning", CONFIG.TOAST_WARNING_DURATION);
        }
        self.advanceToNextItem();
        self.startRefreshTimer();
      },
      CONFIG.API_TIMEOUT,
      "saveCertificateAiCollectDraft",
    );
  },

  // ============== 图片压缩（含 EXIF 旋转修正） ==============
  compressImage: function (file, successCallback, errorCallback) {
    var completed = false;
    function finishSuccess(compressed) {
      if (completed) return;
      completed = true;
      successCallback(compressed);
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
          finishSuccess({ dataUrl: base64, width: canvas.width, height: canvas.height });
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

    $root.on("click", ".header-toggle", function () {
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

    $root.on("click", ".refresh-chip", function () {
      self.handleRefreshChipClick();
    });

    $root.on("click", ".refresh-config-btn", function () {
      self.openRefreshConfigModal();
    });

    $root.on("click", ".refresh-config-cancel", function () {
      self.closeRefreshConfigModal();
    });

    $root.on("click", ".refresh-config-save", function () {
      self.saveRefreshConfig();
    });

    $root.on("click", ".refresh-preset", function () {
      var seconds = parseInt($(this).attr("data-seconds"), 10);
      $(".refresh-custom-input").val(seconds);
      $(".refresh-config-error").addClass("hidden");
      self.updateRefreshPresetSelection(seconds);
    });

    $(".refresh-custom-input").on("input", function () {
      $(".refresh-config-error").addClass("hidden");
      var seconds = parseInt($(this).val(), 10);
      if (!isNaN(seconds)) self.updateRefreshPresetSelection(seconds);
    });

    $(".refresh-custom-input").on("keydown", function (event) {
      if (event.key !== "Enter" && event.keyCode !== 13) return;
      event.preventDefault();
      self.saveRefreshConfig();
    });

    $root.on("click", ".conflict-btn-close", function () {
      self.hideConflict();
    });

    $root.on("click", ".conflict-btn-refresh", function () {
      self.hideConflict();
      if (self.state.orderInfo.orderNo) self.queryOrder(self.state.orderInfo.orderNo);
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

    $(".conflict-mask").on("click", function (event) {
      if (event.target === this) self.hideConflict();
    });

    $(".refresh-config-mask").on("click", function (event) {
      if (event.target === this) self.closeRefreshConfigModal();
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
