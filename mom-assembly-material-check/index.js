// ============== 装配物料检查（工位选择 + 物料检查双视图） ==============
// 数据来源：Portal 注入的 window.assemblyMaterialCheck_* 四个接口（callback 风格，
// 信封 { code, msg, data }，code 0 为成功）；本地开发由同目录 mock.js 兜底
// （生产不部署，Portal 只取 index.html / index.js / index.css 三个文件）。
// 页面结构：全部骨架在 index.html（含 template 循环模板），JS 只克隆赋值。

// ============== Portal 表单回车提交拦截 ==============
// 平台约定：页面定义该空实现钩子即可（定义即生效），不需要页面调用，用于消除输入框回车提交刷新。
function Portal_OnDocumentKeyDown() {}

// ============== 应用命名空间 ==============
var AssemblyMaterialCheck = {
  API_TIMEOUT: 10000,

  // 扫码按钮开关：false 时隐藏全部扫码按钮（改这一行即可切换）
  SCAN_BUTTON_ENABLED: true,

  state: {
    stations: [],
    filteredStations: [],
    selectedStationIndex: -1,
    workStation: "",
    workStationDesc: "",
    orderInfo: null,
  },

  _loadingCount: 0,
  _toastTimer: null,
  _initRetryCount: 0,

  // ============== 模板克隆 ==============
  cloneTemplate: function (templateClassName) {
    var fragment = document.querySelector("." + templateClassName).content.cloneNode(true);
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
    }, AssemblyMaterialCheck.API_TIMEOUT);
    args = args || [];
    fn.apply(null, args.concat([function (res) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      callback(res);
    }]));
  },

  // ============== 时间与消息提示 ==============
  now: function () {
    var d = new Date();
    var pad = function (n) { return n < 10 ? "0" + n : n; };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " +
      pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  },

  /** 非阻断提示：3 秒自动消失，也可点击提前关闭 */
  showToast: function (title, content, type) {
    if (AssemblyMaterialCheck._toastTimer) {
      clearTimeout(AssemblyMaterialCheck._toastTimer);
      AssemblyMaterialCheck._toastTimer = null;
    }
    $(".toast-title").text(title);
    $(".toast-content").text(content).removeClass("hidden");
    $(".template-toast .toast-icon-error").toggleClass("hidden", type !== "error");
    $(".template-toast .toast-icon-success").toggleClass("hidden", type === "error");
    $(".template-toast").removeClass("hidden");
    AssemblyMaterialCheck._toastTimer = setTimeout(function () {
      AssemblyMaterialCheck.hideToast();
    }, 3000);
  },

  hideToast: function () {
    if (AssemblyMaterialCheck._toastTimer) {
      clearTimeout(AssemblyMaterialCheck._toastTimer);
      AssemblyMaterialCheck._toastTimer = null;
    }
    $(".template-toast").addClass("hidden");
  },

  showLoading: function (text) {
    AssemblyMaterialCheck._loadingCount++;
    $(".loading-text").text(text || "加载中...");
    $(".template-loading").removeClass("hidden");
  },

  hideLoading: function () {
    AssemblyMaterialCheck._loadingCount = Math.max(0, AssemblyMaterialCheck._loadingCount - 1);
    if (AssemblyMaterialCheck._loadingCount === 0) {
      $(".template-loading").addClass("hidden");
    }
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
    AssemblyMaterialCheck.showToast("提示", "扫码功能仅在移动端可用，请手动输入", "error");
  },

  // ============== 视图切换 ==============
  enterMaterialCheckView: function (workStation, workStationDesc) {
    var state = AssemblyMaterialCheck.state;
    state.workStation = workStation;
    state.workStationDesc = workStationDesc || "";
    $(".work-station-tag").text(workStation + "（" + state.workStationDesc + "）");
    AssemblyMaterialCheck.resetCheckForm();
    $(".station-select-view").addClass("hidden");
    $(".material-check-view").removeClass("hidden");
    setTimeout(function () {
      $(".input-order-key").focus();
    }, 0);
  },

  backToStation: function () {
    $(".material-check-view").addClass("hidden");
    $(".station-select-view").removeClass("hidden");
    setTimeout(function () {
      $(".input-station-filter").focus();
    }, 0);
  },

  /** 扫码按钮开关：关闭时隐藏全部扫码按钮（配置见 SCAN_BUTTON_ENABLED） */
  applyScanButtonSwitch: function () {
    var enabled = AssemblyMaterialCheck.SCAN_BUTTON_ENABLED;
    $(".btn-scan-station, .btn-scan-order, .btn-scan-material").toggleClass("hidden", !enabled);
  },

  // ============== 工位选择视图 ==============
  loadStationList: function () {
    AssemblyMaterialCheck.showLoading("加载工位中...");
    AssemblyMaterialCheck.apiCall(window.assemblyMaterialCheck_getWorkStationList, [], function (res) {
      AssemblyMaterialCheck.hideLoading();
      if (res.code !== 0) {
        AssemblyMaterialCheck.showToast("加载失败", res.msg || "获取工位列表失败", "error");
        return;
      }
      AssemblyMaterialCheck.state.stations = res.data || [];
      AssemblyMaterialCheck.renderStationList();
    });
  },

  getFilteredStations: function () {
    var keyword = ($(".input-station-filter").val() || "").trim().toLowerCase();
    if (!keyword) return AssemblyMaterialCheck.state.stations;
    return AssemblyMaterialCheck.state.stations.filter(function (station) {
      var code = (station.workStation || "").toLowerCase();
      var desc = (station.workStationDesc || "").toLowerCase();
      return code.indexOf(keyword) !== -1 || desc.indexOf(keyword) !== -1;
    });
  },

  renderStationList: function () {
    var filtered = AssemblyMaterialCheck.getFilteredStations();
    AssemblyMaterialCheck.state.filteredStations = filtered;
    AssemblyMaterialCheck.state.selectedStationIndex = -1;
    $(".station-list .station-item").remove();
    $(".empty-station-list").toggleClass("hidden", filtered.length > 0);
    filtered.forEach(function (station, index) {
      var $item = AssemblyMaterialCheck.cloneTemplate("template-station-item");
      $item.find(".station-code").text(station.workStation);
      $item.find(".station-desc").text(station.workStationDesc);
      $item.data("index", index);
      $(".station-list").append($item);
    });
  },

  updateStationSelection: function () {
    var selectedIndex = AssemblyMaterialCheck.state.selectedStationIndex;
    $(".station-list .station-item").each(function (index) {
      $(this).toggleClass("selected", index === selectedIndex);
    });
    var $selected = $(".station-list .station-item").eq(selectedIndex);
    if ($selected.length) {
      $selected[0].scrollIntoView({ block: "nearest" });
    }
  },

  moveStationSelection: function (key) {
    var count = AssemblyMaterialCheck.state.filteredStations.length;
    if (!count) return;
    var next = AssemblyMaterialCheck.state.selectedStationIndex;
    if (key === "ArrowDown") {
      next = next >= count - 1 ? 0 : next + 1;
    } else {
      next = next <= 0 ? count - 1 : next - 1;
    }
    AssemblyMaterialCheck.state.selectedStationIndex = next;
    AssemblyMaterialCheck.updateStationSelection();
  },

  jumpToMaterialCheck: function (station) {
    var filtered = AssemblyMaterialCheck.state.filteredStations;
    var target = station ||
      filtered[AssemblyMaterialCheck.state.selectedStationIndex] ||
      filtered[0];
    if (!target) {
      AssemblyMaterialCheck.showToast("提示", "无可用工位", "error");
      return;
    }
    AssemblyMaterialCheck.enterMaterialCheckView(target.workStation, target.workStationDesc);
  },

  // ============== 物料检查视图 ==============
  resetCheckForm: function () {
    AssemblyMaterialCheck.state.orderInfo = null;
    $(".plan-start-time-tag").text("");
    $(".month-sequence-tag").text("");
    $(".host-code-tag").text("");
    $(".host-alias-tag").text("");
    $(".input-order-key").val("");
    $(".input-material-qr").val("");
    $(".check-result-area .check-result-row").remove();
    $(".empty-check-result").removeClass("hidden");
  },

  /** 查询订单信息：请求带当前工位（workStation）+ 订单号/VIN 检索键 */
  queryOrderInfo: function () {
    var state = AssemblyMaterialCheck.state;
    var searchKey = ($(".input-order-key").val() || "").trim();
    if (!searchKey) {
      AssemblyMaterialCheck.showToast("提示", "请输入订单号或VIN", "error");
      return;
    }
    AssemblyMaterialCheck.showLoading("查询订单中...");
    AssemblyMaterialCheck.apiCall(
      window.assemblyMaterialCheck_getWipOrderNoInfo,
      [{ serachKey: searchKey, workStation: state.workStation }],
      function (res) {
        AssemblyMaterialCheck.hideLoading();
        if (res.code !== 0) {
          AssemblyMaterialCheck.showToast("查询失败", res.msg || "查询订单信息失败", "error");
          return;
        }
        var orderInfo = res.data || {};
        state.orderInfo = orderInfo;
        $(".plan-start-time-tag").text(orderInfo.wipPlanStartTime || "");
        $(".month-sequence-tag").text(orderInfo.monthSequence || "");
        $(".host-code-tag").text(orderInfo.hostCode || "");
        $(".host-alias-tag").text(orderInfo.hostAlias || "");
        $(".check-result-area .check-result-row").remove();
        $(".empty-check-result").removeClass("hidden");
        $(".input-material-qr").val("");
        // 查询成功：聚焦物料二维码，开启连续扫码
        setTimeout(function () {
          $(".input-material-qr").focus();
        }, 0);
      },
    );
  },

  isInOrderBom: function (materialCode) {
    var bom = (AssemblyMaterialCheck.state.orderInfo && AssemblyMaterialCheck.state.orderInfo.bom) || [];
    return bom.some(function (item) {
      return item.material === materialCode;
    });
  },

  handleMaterialCheck: function () {
    var state = AssemblyMaterialCheck.state;
    if (!state.orderInfo) {
      AssemblyMaterialCheck.showToast("提示", "请先查询订单信息", "error");
      return;
    }
    var qrText = ($(".input-material-qr").val() || "").trim();
    if (!qrText) {
      AssemblyMaterialCheck.showToast("提示", "请输入或扫码物料二维码", "error");
      return;
    }
    var materialCode = qrText.split("|")[0];
    AssemblyMaterialCheck.showLoading("查询物料中...");
    AssemblyMaterialCheck.apiCall(window.assemblyMaterialCheck_getMaterialInfo, [{ material: materialCode }], function (res) {
      AssemblyMaterialCheck.hideLoading();
      if (res.code !== 0) {
        AssemblyMaterialCheck.showToast("查询失败", res.msg || "查询物料信息失败", "error");
        return;
      }
      var materialInfo = res.data || {};
      var materialDesc = materialInfo.materialDesc || "";
      var inBom = AssemblyMaterialCheck.isInOrderBom(materialCode);
      var checkResult = inBom ? "pass" : "fail";

      if (!inBom) {
        var wipOrderNo = state.orderInfo.wipOrderNo || "";
        var notFoundMessage = wipOrderNo + "-" + materialCode +
          (materialDesc ? "-" + materialDesc : "") + " 不存在";
        AssemblyMaterialCheck.showToast("提示", notFoundMessage, "error");
      }
      AssemblyMaterialCheck.appendCheckRow(materialCode, materialDesc || "-", checkResult);
      AssemblyMaterialCheck.saveCheckResult(qrText, materialCode, checkResult);
    });
  },

  appendCheckRow: function (materialCode, materialDesc, checkResult) {
    var $row = AssemblyMaterialCheck.cloneTemplate("template-check-result-row");
    $row.addClass(checkResult === "pass" ? "pass" : "fail");
    $row.find(".cr-material-code").text(materialCode);
    $row.find(".cr-material-desc").text(materialDesc);
    $row.find(".cr-check-time").text(AssemblyMaterialCheck.now());
    var $area = $(".check-result-area");
    $(".empty-check-result").addClass("hidden");
    // 检查列表按时间倒序：最新一条插到顶部
    $area.prepend($row);
    $area.prop("scrollTop", 0);
  },

  saveCheckResult: function (qrText, materialCode, checkResult) {
    var state = AssemblyMaterialCheck.state;
    var orderInfo = state.orderInfo;
    AssemblyMaterialCheck.showLoading("保存检查结果中...");
    AssemblyMaterialCheck.apiCall(window.assemblyMaterialCheck_saveCheckResult, [{
      wipOrderNo: orderInfo.wipOrderNo,
      vin: orderInfo.vin,
      workStation: state.workStation,
      qrCode: qrText,
      material: materialCode,
      checkResult: checkResult,
    }], function (res) {
      AssemblyMaterialCheck.hideLoading();
      if (res.code !== 0) {
        AssemblyMaterialCheck.showToast("保存失败", res.msg || "保存检查结果失败", "error");
        return;
      }
      // 保存成功：清空二维码并保持聚焦，连续扫码
      $(".input-material-qr").val("");
      $(".input-material-qr").focus();
    });
  },

  checkComplete: function () {
    AssemblyMaterialCheck.resetCheckForm();
    setTimeout(function () {
      $(".input-order-key").focus();
    }, 0);
  },

  // ============== 页面尺寸（表单宿主无高度链时按视口自适应，避免整页滚动条） ==============
  fitPageHeight: function () {
    var $root = $(".mom-assembly-material-check");
    if (!$root.length) return;
    var availableHeight = $(window).height() - $root.offset().top;
    $root.css("height", Math.max(240, availableHeight) + "px");
  },

  // ============== 事件绑定（一次性委托，页面加载时执行） ==============
  initEvents: function () {
    // 键盘统一入口：工位筛选方向键移动高亮；回车按当前输入框触发对应动作（输入法组字中的回车不响应）
    $(".mom-assembly-material-check").on("keydown", "input", function (e) {
      var $input = $(this);
      var originalEvent = e.originalEvent || e;
      if (originalEvent.isComposing || e.keyCode === 229) return;

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if ($input.hasClass("input-station-filter")) {
          e.preventDefault();
          AssemblyMaterialCheck.moveStationSelection(e.key);
        }
        return;
      }
      if (e.key !== "Enter") return;

      e.preventDefault();
      if ($input.hasClass("input-order-key")) {
        AssemblyMaterialCheck.queryOrderInfo();
      } else if ($input.hasClass("input-material-qr")) {
        AssemblyMaterialCheck.handleMaterialCheck();
      } else if ($input.hasClass("input-station-filter")) {
        // 工位页回车只筛选，不跳转（进检查页靠点击工位卡片）
        AssemblyMaterialCheck.renderStationList();
      }
    });

    // 工位筛选：实时筛选 + 卡片点击选择（失焦不触发任何动作）
    $(".station-select-view").on("input", ".input-station-filter", function () {
      AssemblyMaterialCheck.renderStationList();
    });
    $(".station-select-view").on("click", ".station-item", function () {
      var station = AssemblyMaterialCheck.state.filteredStations[$(this).data("index")];
      if (station) {
        AssemblyMaterialCheck.jumpToMaterialCheck(station);
      }
    });
    $(".station-select-view").on("click", ".btn-search-station", function () {
      AssemblyMaterialCheck.renderStationList();
    });
    $(".station-select-view").on("click", ".btn-scan-station", function () {
      AssemblyMaterialCheck.doScan(".input-station-filter", function () {
        AssemblyMaterialCheck.renderStationList();
      });
    });

    // 物料检查：动作只由 回车/搜索按钮/扫码按钮 触发
    $(".material-check-view").on("click", ".btn-search-order", function () {
      AssemblyMaterialCheck.queryOrderInfo();
    });
    $(".material-check-view").on("click", ".btn-scan-order", function () {
      AssemblyMaterialCheck.doScan(".input-order-key", function () {
        AssemblyMaterialCheck.queryOrderInfo();
      });
    });
    $(".material-check-view").on("click", ".btn-search-material", function () {
      AssemblyMaterialCheck.handleMaterialCheck();
    });
    $(".material-check-view").on("click", ".btn-scan-material", function () {
      AssemblyMaterialCheck.doScan(".input-material-qr", function () {
        AssemblyMaterialCheck.handleMaterialCheck();
      });
    });

    // 底部按钮
    $(".material-check-view").on("click", ".btn-check-complete", function () {
      AssemblyMaterialCheck.checkComplete();
    });
    $(".material-check-view").on("click", ".btn-back-station", function () {
      AssemblyMaterialCheck.backToStation();
    });

    // 按钮按下不夺焦点，避免点击时输入框闪失焦
    $(".icon-btn, .btn-check-complete, .btn-back-station").on("mousedown", function (e) {
      e.preventDefault();
    });

    // Toast：点击遮罩或确定按钮关闭
    $(".template-toast").on("click", function (e) {
      if (e.target === this || $(e.target).hasClass("toast-btn")) {
        AssemblyMaterialCheck.hideToast();
      }
    });
  },

  // ============== 页面初始化 ==============
  initPage: function () {
    // Portal 表单环境：HTML 片段可能晚于 JS 就绪注入，先等根容器出现再初始化（选择器空集合会崩）
    if (!$(".mom-assembly-material-check").length) {
      AssemblyMaterialCheck._initRetryCount++;
      if (AssemblyMaterialCheck._initRetryCount > 100) return;
      setTimeout(function () {
        AssemblyMaterialCheck.initPage();
      }, 50);
      return;
    }

    var now = AssemblyMaterialCheck.now;
    $(".header-time").text(now());
    setInterval(function () {
      $(".header-time").text(now());
    }, 1000);

    AssemblyMaterialCheck.initEvents();
    AssemblyMaterialCheck.applyScanButtonSwitch();
    AssemblyMaterialCheck.fitPageHeight();
    $(window).on("resize", function () {
      AssemblyMaterialCheck.fitPageHeight();
    });
    setTimeout(function () {
      $(".input-station-filter").focus();
    }, 0);
    AssemblyMaterialCheck.loadStationList();
  },
};

// ============== 启动 ==============
$(function () {
  AssemblyMaterialCheck.initPage();
});
