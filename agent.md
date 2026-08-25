# agent.md — AI 代理工作守则（本仓库）

> 面向在本仓库工作的 AI 代理。工具调用详见 `TOOLCHAIN.md`；接口契约详见 `API接口对接文档.md`。
> 本文档是代理行为的最高约定，与用户口头指示冲突时以用户最新指示为准并同步更新本文档。

---

## 1. 项目概览

SanyH5：4 个独立子项目（MOM 页面），互不影响、独立部署、独立 tag。纯静态 HTML/CSS/JS（jQuery 3.4.0 走 CDN），无构建链、无 package.json、无 CI。

| 子项目 | 目录 | 架构 | API 数 |
|---|---|---|---|
| 合格证查看 | mom-cert/ | 第三方静态 HTML + index.js 叠加引擎（HTML 只读） | 0（读 $Context.inputs） |
| 装箱作业 | mom-packing/ | 骨架 + template + `Packing` 命名空间 | 4 |
| 铭牌照片上传 | mom-nameplate-photo-upload/ | 骨架 + template + `NameplatePhotoUpload` 命名空间（样板） | 4 |
| 铭牌检查结果 | mom-nameplate-check-result/ | 骨架 + template + `NameplateCheckResult` 命名空间 | 0（读 window.checkResultData，mock.js 演示） |

所有页面嵌入 Portal iframe，通过 Portal 注入的 `window.xxx` 通信；本地开发由各页独立 `mock.js` 兜底（生产不部署）。

## 2. 硬约束（违反即事故）

1. **mom-cert/index.html 第三方只读，禁止修改**——该页一切改动只能落在 `mom-cert/index.js`（index.js 先于内联脚本加载，可叠加修复）
2. **部署 3 文件约束**：每页生产部署只能有 index.html / index.js / index.css；**开发期允许额外 mock.js**（Portal 只取 3 文件，mock.js 不进生产）
3. **项目根无 package.json、无 node_modules**；工具一律全局安装
4. **不得格式化/批量修改任何 *.html**（.prettierignore 已排除；mom-cert HTML 尤其只读）
5. 文档类文件放根目录（agent.md / TOOLCHAIN.md / API接口对接文档.md），不塞进页面目录
6. 不删除/重命名任何现有文件，除非用户明确要求

## 3. 协作规则（权限相关）

1. 可能超出权限的操作（sudo、apt、写工作区之外等）：**先正常尝试一遍**
2. 因权限失败：**立即告知用户**，给出可复制的命令 + 用途说明，由用户在终端执行；用户执行完告知后验证结果
3. **禁止绕过权限限制**（沙箱升级、danger-full-access、路径规避、换工具硬闯）

## 4. 标准工作流（每项改动必须走完）

### 4.1 改动分级与验证范围

| 级别 | 改动类型 | 验证范围 |
|---|---|---|
| 小 | 文案/样式微调、注释 | eslint 该文件 + 冒烟（0 JS 错误） |
| 中 | 单页逻辑/结构改动 | 该子项目回归脚本全绿 + eslint 0/0 |
| 大 | 重构/新功能/多页改动 | 波及的**全部子项目**回归 + eslint 0/0 |
| 横切 | 公共文件（eslint.config/工具/跨页同步组件） | **所有被波及子项目**全验证 |

> 子项目互不影响：改动只在单页内时，只验证该页，不跑其他页回归。
> 结构变更（骨架/模板/id 变化）**必须同步更新对应回归脚本**再重跑。

### 4.2 步骤

1. **改前**：`git status` 工作区干净（可回滚基线）+ `git log --oneline` 确认位置
2. **影响面分析**：改公共函数/组件前，先 `rg` 找全部引用，列影响面
3. **编码**：按 §8 编码准则（架构/命名/UI/平台约束）
4. **验证**：按 4.1 分级执行（eslint → 回归脚本 → 冒烟）
5. **自查留痕**：`git diff` 复查改动；commit body 写验证摘要（lint 数/回归结果）
6. **提交**：一次提交一件事，格式见 §5
7. **失败回滚**：验证不通过立即修复；无法快速修复则 `git reset`/`checkout` 回滚到基线，不带着半成品继续

## 5. 提交规范

- 格式：`<type>: <中文描述>`
- type：`fix` 修 bug / `refactor` 重构 / `docs` 文档 / `chore` 配置工具 / `feat` 新功能
- commit body 附验证摘要：`验证：eslint 0/0，tests/<脚本> REGRESSION OK（N 项）`

### 5.1 发布 Tag 规范

- 格式：**`<子项目名>-v<主>.<次>.<补丁>`**（如 `mom-packing-v0.1.0`），带 `-a` 附注说明
- 子项目名 = 页面目录名；版本号 SemVer 递增
- **前置**：该子项目验证全绿（eslint 0/0 + 对应回归脚本 OK）
- 时机：可交付/可部署/里程碑节点（日常提交不打 tag）
- 全量体检（TOOLCHAIN §全量体检）：可选，用于整体确认/定期体检，不绑定 tag 流程
- 现有：photo-upload v0.1.0~0.3.0 / mom-cert v0.1.0 / mom-packing v0.1.0 / check-result v0.1.0

## 6. 文档地图

| 文档 | 内容 | 维护责任 |
|---|---|---|
| TOOLCHAIN.md | 环境事实、环节-工具映射、环境坑、全量体检命令 | 工具/环境变化时更新 |
| API接口对接文档.md | Portal window API 契约（两模块合并版） | 接口变化时更新（先改文档后改代码） |
| agent.md | 本文档 | 规则变化时更新 |

## 7. 当前整改状态

- 4 个子项目：改造完成、已知 bug 全部修复、回归脚本落盘 ✅
- 一致性证书 tab 显示矛盾（mom-cert）：**待业务确认**（确认后由 index.js 侧处理）

## 8. 编码准则

### 8.1 生产平台语法高亮兼容（平台约束）

- 平台高亮器对**正则字面量中的裸特殊字符**（`<` `>` `&` `"` `'`）识别有缺陷：会把 `<` 当 HTML 标签开始、把引号当字符串边界，导致**从该行起后续全部代码高亮错乱**（运行不受影响，仅高亮问题）
- 规避：优先用 `split/join` 链式替换；确需正则时用 `new RegExp("...", "g")` 字符串构造，**禁止在正则字面量中出现上述字符**
- 排查线索：高亮从某行起全部错乱 → 向上找最近的正则字面量检查裸特殊字符

### 8.2 工具使用约定

- 修改跨文件重复的公共代码后，必须 `rg` 全局搜索同模式代码，逐一确认所有副本已同步
- 删除/重构骨架元素必须 HTML/CSS/JS 三处同步清理，`rg` 确认无残留

### 8.3 页面开发模式（项目标准）

页面统一采用**「HTML 骨架 + template 克隆 + JS 赋值」**架构，JS 零 HTML 拼接：

| 结构类型 | 处理方式 |
|---|---|
| 固定结构（表单/卡片头/按钮区） | HTML 直接写 |
| 多态结构（同一区域多种形态） | HTML 预埋 `.hidden` 块，JS 切换显示 |
| 循环结构（卡片/缩略图/下拉选项/详情行） | `<template>` 预埋 + `cloneTemplate()` 克隆赋值 |
| 弹窗（toast/确认/模板选择/预览/loading） | 骨架常驻 HTML（hidden），JS 只显隐 + 填值 |

- 赋值一律用 `.text()/.val()/.attr()`（天然防 XSS，**不需要转义函数**）
- 列表/多态块中同功能按钮用 **class 委托**，禁止重复 id

### 8.4 技术坑（工具/平台相关）

- **`cloneTemplate` 必须取 `firstElementChild`**：`$(fragment)` 上 `.data()` 存在 DocumentFragment 节点，append 进 DOM 后元素读不到 → 模板必须单根结构
- **`.hidden`（display:none !important）与 jQuery `show()/hide()/toggle()` 冲突**：统一用 `addClass/removeClass/toggleClass("hidden")`
- **骨架常驻后的事件策略**：动态克隆元素一律委托绑定；弹窗回调数据挂 `.data()`；预览缩放等实例状态每次打开先 `off()` 再 `on()` 重新绑定
- 页面初次渲染（初始显隐状态）必须在 `initPage` 中显式执行一次

### 8.5 UI 一致性规范（用户确认的交互标准）

- 折叠卡片统一形态：**左侧图标 + 标题 + 清空按钮（箭头左侧）+ 双态箭头**，点击卡片头折叠/展开
- 同类组件（如折叠卡片）样式与交互必须完全一致（背景/内边距/字体/圆角逐项对齐）
- 弹窗类 UI（toast/确认/选择）骨架预埋，运行时不重建 DOM

### 8.6 命名规范（全称、易懂）

- **禁止缩写标识符**：`cb`→`callback`、`tpl`→`template`、`pt`→`photoType`、`$dd`→`$dropdown`、`s`→`state`、`sid`→`sessionId` 等
- 变量/函数/对象属性：用**完整单词或完整词组**（`sessionId`、`selectedTemplateId`、`renderOrderInfo`）
- DOM id：完整语义词组（如 `machine-code-value`），**禁止拼凑缩写**（如 `machvin`）
- CSS 类名：`btn-`/`icon-` 等行业前缀可沿用，但类名主体用完整单词（新命名不缩写）
- 循环变量允许 `i/j/k`（惯例），其余一律全称

### 8.7 注释规范（少注释，靠命名表达意图）

- 好代码不需要过多注释：**能用命名表达意图的就不写注释**，变量/函数名本身说明用途（配合 §8.6 全称命名）
- 只保留必要注释：
  - **方法头注释**：函数用途、参数含义、返回值（复杂函数加关键步骤说明）
  - **"为什么"类注释**：业务规则、平台约束、绕坑原因（如 §8.1 高亮规避、XSS 前置拦截），这类注释代码本身表达不出来，必须写
  - **绕坑/兼容性注释**：技术坑、浏览器/平台兼容 hack
- 禁止：
  - 逐行解释性注释、与代码重复的废话注释（如 `// 获取订单信息` 配 `getOrderInfo()`）
  - 注释掉的死代码（直接删除，git 历史可查）
- 注释内容同样受 §8.1 高亮兼容约束

### 8.8 Mock/演示数据隔离（不污染业务代码）

- Mock 数据与 Mock API **必须放独立文件**（页面目录内 `mock.js`，开发期部署，生产不部署——Portal 只取 index.html/index.js/index.css）
- **禁止在业务 JS（index.js）内联任何演示数据**：包括 `MOCK_RESULT` 式常量、`__DEV__` 分支内嵌数据、mock 逻辑
- 页面 index.html 用 `<script src="mock.js">` 引用（置于业务 JS 之前）；业务 JS 对未注入数据只做检测，无数据时展示空态/兜底，零 Mock 代码
- 例外：mom-cert 因第三方 HTML 只读无法引用 mock.js，暂维持 `__DEV__` 内联（待评估动态加载方案，此例外不扩散到其他页面）

## 9. 新页面/改造页面标准流程（样板：mom-nameplate-photo-upload）

1. **骨架先行**：先写 index.html 完整骨架——固定结构直写、多态结构 `.hidden` 块预埋、循环结构 `<template>` 预埋（单根结构）、弹窗骨架常驻 hidden
2. **命名空间**：按业务语义命名（`NameplatePhotoUpload` 式，避免泛化如 `PhotoUpload`），全称易懂
3. **JS 只赋值**：`cloneTemplate` 克隆 + `text/val/attr` 填充 + `addClass/removeClass` 类切换，**零 HTML 拼接**
4. **事件**：一次性委托绑定；弹窗回调挂 `.data()`；实例状态（预览缩放）每次打开 `off()+on()`
5. **样式归 CSS**：内联 style 仅限动态值（如进度条宽度）；初始隐藏用 `.hidden`
6. **Mock**：独立 `mock.js`（§8.8，生产不部署），业务 JS 零 Mock 代码
7. **回归脚本**：编写 `tests/<子项目>.regress.cjs` 并加入 §11 表格

## 10. Definition of Done（改动完成标准）

每项改动（修 bug / 重构 / 新功能）完成前逐项自检：

- [ ] ESLint **0 error 0 warning**
- [ ] 对应回归脚本全绿 + 0 JS 错误（横切改动：全部波及子项目）
- [ ] 结构变更已同步更新回归脚本
- [ ] 命名符合 §8.6（全称、易懂、业务语义）
- [ ] 注释符合 §8.7（少注释，命名表达意图；只留方法头/为什么/绕坑注释）
- [ ] Mock/演示数据符合 §8.8（独立 mock.js，业务 JS 零内联）
- [ ] 骨架符合 §8.3/§9（HTML 骨架 + template + JS 赋值，零拼接）
- [ ] 折叠/弹窗交互符合 §8.5（与样板页一致）
- [ ] 接口变更同步 API接口对接文档.md（先改文档后改代码）
- [ ] 提交符合 §5（含验证摘要），工作区干净

## 11. 页面回归必测清单（tests/ 脚本）

| 子项目 | 脚本 | 覆盖点 |
|---|---|---|
| mom-nameplate-photo-upload | `tests/nameplate-photo-upload.regress.cjs` | 加载/下拉筛选/查询/真实上传/删除/预览/模板多态/保存(saveType)/提交(saveType)/折叠/空态/清空 |
| mom-packing | `tests/packing.regress.cjs` | 加载/单号搜索/物料搜索/选中面板/上传/数量校验/提交重置/步骤回退 |
| mom-cert | `tests/mom-cert.regress.cjs` | dev 渲染/校验/触屏 tooltip/生产缺字段不崩/XSS 前置拦截 |
| mom-nameplate-check-result | `tests/check-result.regress.cjs` | Mock 渲染/MATCH-MISMATCH 与单位/无数据空态/未知枚举显示原文/轮询自动刷新/未知任务状态 |

运行：`cd /home/wangzm/projects/SanyH5 && NODE_PATH=$(npm root -g) node tests/<脚本>`（前置：nginx 8080）
