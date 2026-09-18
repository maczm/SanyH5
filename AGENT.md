# AGENT.md — AI 代理工作守则（本仓库）

> 面向在本仓库工作的 AI 代理。**本文档是代理行为的最高约定**，与用户口头指示冲突时以用户最新指示为准并同步更新本文档；工具链与环境见 §14，文档地图见 §6。

---

## 1. 项目概览

SanyH5：6 个独立子项目（MOM 页面），互不影响、独立部署、独立 tag。纯静态 HTML/CSS/JS（jQuery 3.4.0 本地化，根目录 `jquery.min.js` 各页 `../jquery.min.js` 引用），无构建链、无 package.json、无 CI。

| 子项目 | 目录 | 架构 | API 数 |
|---|---|---|---|
| 合格证查看 | mom-cert/ | 第三方静态 HTML + index.js 叠加引擎（HTML 只读） | 0（读 $Context.inputs） |
| 装箱作业 | mom-packing/ | 骨架 + template + `Packing` 命名空间 | 4 |
| 铭牌照片上传 | mom-nameplate-photo-upload/ | 骨架 + template + `NameplatePhotoUpload` 命名空间（样板） | 4 |
| 铭牌检查结果 | mom-nameplate-check-result/ | 骨架 + template + `NameplateCheckResult` 命名空间 | 0（读 window.checkResultData，mock.js 演示） |
| 装配物料检查 | mom-assembly-material-check/ | 骨架 + template + `AssemblyMaterialCheck` 命名空间（双视图：工位选择/物料检查） | 4（window.assemblyMaterialCheck_*） |
| 关重件更换 | mom-key-component-change/ | 骨架 + template + `KeyComponentChange` 命名空间（三视图：更换/移除/更换确认） | 7（window.KeyComponentChange_*） |

所有页面嵌入 Portal iframe，通过 Portal 注入的 `window.xxx` 通信；本地开发由各页独立 `mock.js` 兜底（生产不部署）。

## 2. 硬约束（违反即事故）

1. **mom-cert/index.html 第三方只读，禁止修改**——该页一切改动只能落在 `mom-cert/index.js`（index.js 先于内联脚本加载，可叠加修复）；唯一例外：2025-09 用户批准 jQuery CDN 改本地（仅 script src 一行），此后仍禁止其他修改
2. **部署 3 文件约束**：每页生产部署只能有 index.html / index.js / index.css；**开发期允许额外 mock.js**（Portal 只取 3 文件，mock.js 不进生产）；根目录 `jquery.min.js` 为各页共享的本地 jQuery，随解决方案整体部署（非页面级文件，各页以 `../jquery.min.js` 引用）
3. **项目根无 package.json、无 node_modules**；工具一律全局安装
4. **不得格式化/批量修改任何 *.html**（.prettierignore 已排除；mom-cert HTML 尤其只读）
5. **约束只在本文件**：全部约束/规则/约定只能写在根目录 `AGENT.md`；接口协议与流程图一律放 `docs/`（命名见 §6），`docs/<中文模块名>INF.md` **只放协议、零约束**
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
| 横切 | 公共文件（eslint.config/工具/跨页同步组件） | 仅**受该文件波及**的子项目（见 §4.3 第 2 行，不跑未波及的页面） |

> 子项目互不影响：改动只在单页内时只验证该页，不跑其他页回归（选定口径见 §4.3）；结构变更（骨架/模板/class 变化）**必须同步更新对应回归脚本**再重跑。改动的完成标准见 §10。

### 4.2 步骤

1. **改前**：`git status` 工作区干净（可回滚基线）+ `git log --oneline` 确认位置
2. **影响面分析**：改公共函数/组件前，先 `rg` 找全部引用，列影响面
3. **编码**：按 §8 编码准则（架构/命名/UI/平台约束）
4. **验证**：先按 §4.3 用 git 圈定受影响子项目，再按 §4.1 分级执行（eslint → 回归脚本 → 冒烟），命令见 §11、§14.2（单子项目命令见 §14.3）
5. **自查留痕**：`git diff` 复查改动；commit body 写验证摘要（见 §5）
6. **提交**：一次提交一件事，格式见 §5
7. **失败回滚**：验证不通过立即修复；无法快速修复则 `git reset`/`checkout` 回滚到基线，不带着半成品继续

### 4.3 回归范围按改动圈定（**逐子项目验证；禁止全量体检**）

**每次改动先用 git 查清动了哪些子项目，只跑这些子项目的回归脚本**；本仓库**不存在「全量体检」**——不做全页面巡检、不跑跨项目执行器；部署同样是**一个子项目一个子项目地做**（§14.3）。

```bash
# 改了哪些文件 → 映射到子项目目录名（跑之前先看这一行输出）
git status --porcelain | cut -c4- | grep -E '^mom-[^/]+/' | cut -d/ -f1 | sort -u
# 已提交未发布时：git diff --name-only origin/master...HEAD | grep -E '^mom-[^/]+/' | cut -d/ -f1 | sort -u
```

| 改动范围 | 回归范围 | 示例 |
|---|---|---|
| 单个 `mom-xxx/` 下的 index.js/index.css/index.html/mock.js | 只跑 `tests/` 下该项目的脚本（见 §11 覆盖点） | 改 `mom-packing/Index.js` → 只跑 `packing.regress.cjs` |
| 多个 `mom-xxx/` 或无 `mom-` 前缀的公共文件（eslint.config、jquery.min.js） | 波及的全部子项目 | 改 `jquery.min.js` → 6 页全跑 |
| 只有 `AGENT.md` / `docs/` / `.prettier*` / `.gitignore` | **不跑回归**（可做 §14.3 环境快速自检） | 本次文档去冗余 |

- 判定依据是**实际改动的文件**，不是"提交信息"或"感觉可能影响"；拿不准就先跑 `git diff --stat`
- 上一条命令输出为空（只有文档/配置改动）即无需回归；不要因为「提交前」或「要部署」就把范围升级为全部页面
- 脚本与子项目的对应关系以 §11 必测点为准；新增页面按 §9 第 7 条临时补脚本

## 5. 提交规范

- 格式：`<type>: <中文描述>`
- type：`fix` 修 bug / `refactor` 重构 / `docs` 文档 / `chore` 配置工具 / `feat` 新功能
- commit body 附验证摘要（写清实际跑了哪些，见 §4.3）：`验证：eslint 0/0，tests/<脚本> REGRESSION OK`；纯文档改动写 `文档改动，未跑回归`

### 5.1 发布 Tag 规范

- 格式：**`<子项目名>-v<主>.<次>.<补丁>`**（如 `mom-packing-v0.1.0`），带 `-a` 附注说明；子项目名 = 页面目录名，版本号 SemVer 递增
- 前置：**该标签对应子项目**验证全绿（eslint 0/0 + 该页回归 OK，§4.1/§4.3）；不要求其他子项目，不跑全量
- 部署与 tag 都按子项目独立进行：一次只处理一个页面目录（命令见 §14.3）
- 时机：可交付/可部署/里程碑节点（日常提交不打 tag）
- 现有：photo-upload v0.1.0~0.3.0 / mom-cert v0.1.0 / mom-packing v0.1.0 / check-result v0.1.0

## 6. 文档地图

| 文档 | 内容 |
|---|---|
| AGENT.md | 全部约束/规则/约定 + 工具链与环境（§14） |
| `docs/<中文模块名>INF.md` | 各页 Portal window API 协议（函数签名 + 入参/出参字段，零约束） |
| `docs/<中文模块名>流程图.md` | 页面流程图（用户操作流程 / 状态机 / 接口时序 / 数据流），现有 `docs/关重件更换流程图.md` |

维护责任：接口变化时更新 `INF.md`；该页流程或结构变化时同步流程图；规则/工具/环境变化时更新本文（§2 约束集中原则）。

## 7. 当前整改状态

- 4 个子项目：改造完成、已知 bug 全部修复、回归脚本落盘 ✅
- 新建 mom-assembly-material-check（装配物料检查，双视图）与 mom-key-component-change（关重件更换，三视图）：均已交付 ✅
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
- 列表/多态块中同功能按钮用 **class 委托**，禁止重复标识（一个 class 只标识一个元素）

### 8.4 技术坑（工具/平台相关）

- **`cloneTemplate` 必须取 `firstElementChild`**：`$(fragment)` 上 `.data()` 存在 DocumentFragment 节点，append 进 DOM 后元素读不到 → 模板必须单根结构
- **`.hidden`（display:none !important）与 jQuery `show()/hide()/toggle()` 冲突**：统一用 `addClass/removeClass/toggleClass("hidden")`
- **骨架常驻后的事件策略**：动态克隆元素一律委托绑定；弹窗回调数据挂 `.data()`；预览缩放等实例状态每次打开先 `off()` 再 `on()` 重新绑定
- **禁止用失焦（blur / focusout）触发业务动作**：移动端与表单宿主下失焦时机不可靠，且与按钮点击抢事件（点击按钮会先失焦）；业务动作只由 **回车 / 按钮 / 扫码** 触发
- 回车处理统一入口：委托在页面根容器上按输入框 class 分派，并跳过输入法组字中的回车（`isComposing` 或 `keyCode === 229`）
- **扫码类输入框的键盘控制**：输入框平时保持可编辑（扫码枪可直接键入、连续扫码），**程序化聚焦时先临时 `readonly` 再聚焦**（聚焦瞬间只读 → 不弹软键盘），聚焦后解锁；手动点击照常弹键盘。摄像头扫码与扫码枪两种方式因此并存（OpenCamera 契约见 §12.4）
- 页面初次渲染（初始显隐状态）必须在 `initPage` 中显式执行一次

### 8.5 UI 一致性规范（用户确认的交互标准）

- 折叠卡片统一形态：**左侧图标 + 标题 + 清空按钮（箭头左侧）+ 双态箭头**，点击卡片头折叠/展开
- 同类组件（如折叠卡片）样式与交互必须完全一致（背景/内边距/字体/圆角逐项对齐）
- 弹窗类 UI（toast/确认/选择）骨架预埋，运行时不重建 DOM

### 8.6 命名规范（全称、易懂）

- **禁止缩写标识符**：`cb`→`callback`、`tpl`→`template`、`pt`→`photoType`、`$dd`→`$dropdown`、`s`→`state`、`sid`→`sessionId` 等
- 变量/函数/对象属性：用**完整单词或完整词组**（`sessionId`、`selectedTemplateId`、`renderOrderInfo`）
- DOM class：完整语义词组（如 `machine-code-value`），**禁止拼凑缩写**（如 `machvin`）
- 禁止 id（§8.10）：元素定位只用 class
- CSS 类名：`btn-`/`icon-` 等行业前缀可沿用，但类名主体用完整单词（新命名不缩写）
- 循环变量允许 `i/j/k`（惯例），其余一律全称

### 8.7 注释规范（少注释，靠命名表达意图）

- 好代码不需要过多注释：**能用命名表达意图的就不写注释**，变量/函数名本身说明用途（配合 §8.6 全称命名）
- 只保留必要注释：**方法头注释**（函数用途、参数含义、返回值，复杂函数加关键步骤）、**"为什么"类注释**（业务规则、平台约束、绕坑原因，如 §8.1 高亮规避、XSS 前置拦截）、**绕坑/兼容性注释**
- 禁止逐行解释性注释、与代码重复的废话注释（如 `// 获取订单信息` 配 `getOrderInfo()`），禁止注释掉的死代码（直接删除，git 历史可查）
- 注释内容同样受 §8.1 高亮兼容约束

### 8.8 Mock/演示数据隔离（不污染业务代码）

- Mock 数据与 Mock API **必须放独立文件**（页面目录内 `mock.js`，开发期部署、生产不部署，见 §2 第 2 条）；**禁止在业务 JS（index.js）内联任何演示数据**（`MOCK_RESULT` 式常量、`__DEV__` 分支内嵌数据、mock 逻辑）
- 页面 index.html 用 `<script src="mock.js">` 引用（置于业务 JS 之前）；业务 JS 对未注入数据只做检测，无数据时展示空态/兜底，零 Mock 代码
- 例外：mom-cert 因第三方 HTML 只读无法引用 mock.js（§2 第 1 条），暂维持 `__DEV__` 内联（待评估动态加载方案，此例外不扩散到其他页面）

## 8.9 Portal 表单粘贴：回车提交拦截（平台约束）

- 页面以三文件交付（§2 第 2 条），生产侧将代码**按 html/js/css 三段粘贴进 Portal 表单页**，页面处于 form 上下文：输入框内按回车会默认提交表单、整页刷新，必须拦截
- 拦截方式：页面**直接定义空实现的全局函数** `function Portal_OnDocumentKeyDown() {}` 即可（Portal 约定的页面钩子，定义即生效）；**不需要页面调用，也不需要写任何逻辑**，更不要覆盖成有副作用的实现
- 页面自身对 Enter 的业务响应（搜索/确认）绑定在输入框自身的 **keydown** 事件；与该钩子职责分离，互不影响

## 8.10 全面禁用 id（平台约束，一刀切）

- SanyH5（Portal 表单环境）下 **id 属性一律不可用**：表单控件（button / input / select / textarea）的 id 在运行页面里取不到；页面**一律不写 id、不用 id 选择器**（含 div / span / template 等所有元素）
- HTML 用 **class 标识**，JS / CSS 用 **class 选择器**，事件用 **class 委托**（§8.3）
- `<template>` 用 class 标识，`cloneTemplate` 内部用 `document.querySelector("." + templateClassName)` 获取；工具函数（如扫码）接收 class 选择器而非 id
- 唯一例外：mom-cert 第三方 HTML（只读、含大量第三方 id）的 index.js 只能按第三方 id 定位（§2 第 1 条）；此例外不扩散到自研页面
- 排查线索：元素点击无响应、输入框读值为空、清空/回填无效 → 先检查是否用了 id

## 8.11 输入框按钮与按钮开关（用户确认的交互标准）

1. **每个输入框必须成对提供「搜索按钮」与「扫码按钮」**（class 成对命名 `btn-search-*` / `btn-scan-*`）：搜索按钮走手动输入后的查询，扫码按钮走 `OpenCamera`；业务动作只由 回车 / 按钮 / 扫码 触发（§8.4 禁失焦触发）
2. **每个按钮独立配置「显示开关」与「权限开关」**，集中在页面命名空间的一个 `BUTTON_SWITCH` 常量对象里（禁止散落在各处 if 中）：
   - `visible: false` → 给按钮加 `.hidden`（不显示）
   - `permitted: false` → 给按钮加 `disabled`（**置灰禁用、保留占位**，布局不跳动）
   - 开关对象按按钮语义命名（`searchOrder` / `scanOrder` / `unbind` / `complete` / `deleteSerial` / `removeRecord` / `changeRecord` / `back`），一个按钮一项，互相独立
3. **开关按「class → 按钮」映射表统一应用**：常量 `BUTTON_SELECTOR`（开关项 → 按钮 class 选择器）+ 统一函数 `applyButtonSwitch()`（初始化与每次渲染后各调一次）；**循环结构克隆出来的行内按钮必须在渲染后重放一次**，否则克隆元素拿不到初始作用域上的开关状态
4. **业务条件与开关叠加取交集**：如解绑按钮 = `wipOrderType === 2 && needRemoveQty > removeQty && BUTTON_SWITCH.unbind.visible`，由专门的更新函数（如 `updateUnbindButton()`）在开关应用末尾统一计算，不允许两处各写一半
5. 本条对**新建/改造页面**生效；既有页面在后续改造时同步，不做一次性批量改造

## 9. 新页面/改造页面标准流程（样板：mom-nameplate-photo-upload）

1. **骨架先行**：先写 index.html 完整骨架——固定结构直写、多态结构 `.hidden` 块预埋、循环结构 `<template>` 预埋（单根结构）、弹窗骨架常驻 hidden（形制见 §8.3，坑见 §8.4）
2. **命名空间**：按业务语义命名（`NameplatePhotoUpload` 式，避免泛化如 `PhotoUpload`），全称易懂（§8.6）
3. **JS 只赋值**：`cloneTemplate` 克隆 + `text/val/attr` 填充 + `addClass/removeClass` 类切换，**零 HTML 拼接**
4. **事件**：一次性委托绑定；弹窗回调挂 `.data()`；实例状态（预览缩放）每次打开 `off()+on()`
5. **样式归 CSS**：内联 style 仅限动态值（如进度条宽度）；初始隐藏用 `.hidden`
6. **Mock**：独立 `mock.js`（§8.8，生产不部署），业务 JS 零 Mock 代码
7. **回归脚本**：按 §11 规则临时写 `tests/<子项目>.regress.cjs` 并覆盖该页必测点；**tests/ 不入库，验证完删除**

## 10. Definition of Done（改动完成标准）

每项改动（修 bug / 重构 / 新功能）完成前逐项自检：

- [ ] 验证按 §4.3 圈定范围、按 §4.1 分级执行且全绿：eslint **0 error 0 warning**、受影响子项目回归脚本全绿 + 0 JS 错误、结构变更已同步回归脚本
- [ ] 业务规则符合 §8.1~§8.11（按改动涉及的条目）：命名 §8.6、注释 §8.7、Mock §8.8、骨架与交互 §8.3/§8.5/§9、回车拦截 §8.9、零 id §8.10、按钮开关 §8.11
- [ ] 接口变更同步 `docs/<中文模块名>INF.md`（先改文档后改代码，§12.6），且未向其写入任何约束（§2 第 5 条）
- [ ] 提交符合 §5（含实际跑了哪些脚本的验证摘要），工作区干净且 **`tests/` 已清理**（§11）

## 11. 页面回归：临时脚本与必测点（tests/ 不纳入 git）

**`tests/` 不做版本管理**（`.gitignore` 已排除）：脚本是**用后即弃的验证工具**，**用完就删**，下次要用时按本节覆盖点**重写**。因此：

- **需要时重写**：只写本次改动涉及子项目的脚本（§4.3）；不预先保有全部页面的脚本，也不写跨项目执行器
- **每次使用后清理**：验证完成（并记入 commit body 的验证摘要）后即 `rm -rf tests/`；**不允许把 tests/ 留在工作区**，更不允许提交（含 `git add -f` 强加）
- 重写时复用既有模式：Playwright 无头 + `NODE_PATH=$(npm root -g)` + `waitIdle()` 状态等待 + `window.__mockDelayMilliseconds` 调低 Mock 延迟（模板可从 git 历史 `5b8da6d` 取回，**仅作参考，不恢复入库**）
- 运行前置：nginx 8080 在跑（§14.2）；命令 `cd /home/wangzm/projects/SanyH5 && NODE_PATH=$(npm root -g) node tests/<脚本>`

| 子项目 | 建议脚本名 | 重写时必须覆盖的必测点 |
|---|---|---|
| mom-nameplate-photo-upload | `tests/nameplate-photo-upload.regress.cjs` | 加载/下拉筛选/查询/真实上传/删除/预览/模板多态/保存(saveType)/提交(saveType)/折叠/空态/清空 |
| mom-packing | `tests/packing.regress.cjs` | 加载/单号搜索/物料搜索/选中面板/上传/数量校验/提交重置/步骤回退 |
| mom-cert | `tests/mom-cert.regress.cjs` | dev 渲染/校验/触屏 tooltip/生产缺字段不崩/XSS 前置拦截 |
| mom-nameplate-check-result | `tests/check-result.regress.cjs` | Mock 渲染/MATCH-MISMATCH 与单位/无数据空态/未知枚举显示原文/轮询自动刷新/未知任务状态 |
| mom-assembly-material-check | `tests/assembly-material-check.regress.cjs` | 工位加载与实时筛选/方向键选择/双视图切换/订单查询/BOM 校验(pass-fail)/连续扫码/失焦触发/检查完成重置/返回 |
| mom-key-component-change | `tests/key-component-change.regress.cjs` | 加载/按钮开关(显示+权限, 含克隆行重放)/订单查询(回车+搜索, 订单号与VIN判定)/数量标签/卡片合并与排序/二维码校验/前后电机(自动分配+弹窗+取消)/校验并保存两分支/移除页/更换页(移除+保存+失败重试)/行删除/解绑按钮业务条件/完成重置/小屏布局/容器缺失/提交防重/换单清态(含关重件信息加载失败不跨单)/更换串位拦截与待保存标记/半完成返回确认/位置用尽降级人工选择/同码多配置 materialID 归属/慢响应丢弃(过期响应守卫)/接口缺失守卫/序号人工选择(前-后互斥+取消+覆盖自动分配+行显隐)/待更换明细按位置过滤/序号按钮开关 |

| 时机 | 命令 | 耗时（实测） |
|---|---|---|
| 迭代中（改完一个点） | `eslint <改的文件>` + 该子项目脚本 | lint 2s；单页脚本 5~85s（key-component-change 最慢） |
| 提交前 | 同左，**不因提交动作升级为全量** | 同上 |
| 部署前（单个子项目） | 该页 eslint + 该页脚本 + 该页 tidy，命令见 §14.3 | lint 2s + 脚本 5~85s |
| 只为看通过数 | 跑一次 `tee` 到文件再统计，**不要为了 `grep -c ✅` 重跑整套** | — |

其他提速手段：断言等待用**状态等待**而非固定 sleep（样板：脚本里的 `waitIdle()` 等 loading 遮罩消失）；长命令丢后台任务（`run_in_background`），别在一条命令里重复跑同一套脚本；eslint + tidy 合并成一条命令只跑一次；页面回归可在页面脚本执行前注入 `window.__mockDelayMilliseconds` 调低 Mock 延迟（当前仅 mom-key-component-change 的 `mock.js` 实现，其他页重写脚本时按需补）。

---

## 12. 接口公共约定（Portal window API）

> 各页接口协议（window 函数名 + 调用签名 + 入参/出参字段）见 `docs/<中文模块名>INF.md`（§6）；该文件只放协议、零约束（§2 第 5 条）。

### 12.1 运行方式

H5 页面嵌入 Portal iframe，**Portal 在加载 iframe 之前**向 `window` 注入全局函数。页面通过 `typeof window.xxx != 'function'` 检测：已注入则使用真实函数；未注入则启用本地 Mock（各页独立 `mock.js`，**仅本地开发、生产不部署**，见 §8.8）。

### 12.2 回调格式（全部 API 一致）

```js
callback({ code: number, msg: string, data?: any })
```

- `code: 0` = 成功；非 `0` = 失败
- `msg`：失败时为错误描述，页面直接展示给用户
- 所有 API 均为 callback 风格，无 Promise/返回值约定

### 12.3 注入清单（每页 Portal window 属性）

| 页面 | window 属性（类型） |
|---|---|
| mom-packing | 常量 `Operator`（string，当前操作员姓名/工号，Header 展示 + 提交回传）；函数 `searchByPackingList`（装箱单号搜索）、`searchByMaterialCode`（物料编码搜索）、`uploadPackingImage`（图片上传）、`submitPacking`（装箱提交） |
| mom-nameplate-photo-upload | 常量 `Operator`（string，同上）；函数 `getStationList`（获取工位列表）、`getPhotoConfig`（照片类型配置 + 订单信息）、`uploadPhoto`（上传单张照片）、`submitPhotoRecord`（照片记录提交/保存，`saveType` 区分） |
| mom-assembly-material-check | 函数 `assemblyMaterialCheck_getWorkStationList`（获取工位列表）、`assemblyMaterialCheck_getWipOrderNoInfo`（查询订单/主机/BOM 信息）、`assemblyMaterialCheck_getMaterialInfo`（查询物料信息）、`assemblyMaterialCheck_saveCheckResult`（保存单条检查结果） |
| mom-key-component-change | 函数 `KeyComponentChange_GetWipOrderNoInfo`（查询订单信息）、`KeyComponentChange_GetKeyComponentInfo`（查询关重件配置与已采集序列号）、`KeyComponentChange_CheckAndSave`（校验并保存扫描件，返回 `isChange` 决定是否走换件）、`KeyComponentChange_Remove`（移除关重件，返回 `oldGenealogyID`）、`KeyComponentChange_GetRemoveKeyComponentInfo`（查询待移除明细）、`KeyComponentChange_GetChangeKeyComponentInfo`（查询待更换明细）、`KeyComponentChange_Save`（保存新关重件，带被替换旧件 ID） |
| mom-cert / mom-nameplate-check-result | 无注入 API：分别读 `$Context.inputs` / `window.checkResultData` |

### 12.4 公共能力

**扫码**：Portal 父窗口提供 `window.parent.OpenCamera(callback)`，回调返回 `{ data: "扫码结果字符串" }`（兼容 `{ value: "..." }` 或纯字符串）。

> 图片压缩规格、物料二维码格式只适用于部分页面，已按页面级约束归到 §13.0，不属平台公共能力。

### 12.5 Mock（本地开发）

各页独立 `mock.js`（mom-packing / mom-nameplate-photo-upload / mom-assembly-material-check / mom-key-component-change）承载本页全部 Mock 数据与 API 兜底，**生产不部署该文件**，无需任何清理动作（规则见 §8.8）。

### 12.6 文档权威与变更顺序

接口协议以 `docs/<中文模块名>INF.md` 为准（如 `docs/关重件更换INF.md`）；页面代码与协议文档不一致时以协议文档为准。新增/调整接口的顺序：`<中文模块名>INF.md` 写协议 → 本文补约束/规则 → `mock.js` 加 Mock → 页面加调用 → 回归补断言。

协议文档内部的小节标题一律用**语义名**（不使用接口编号），函数名与 `taskType` 写在代码块里。

---

## 13. 各页业务约定（接口相关规则）

> 各页业务规则集中于此；`docs/<中文模块名>INF.md` 只保留协议（§2 第 5 条）。
> §13.0 是**多页共享**的页面级前提（不属平台公共能力，故不放 §12）；`**13.x**` 各节只写该页独有规则。

### 13.0 跨页共享（仅适用于所列页面）

- **物料二维码格式**（mom-assembly-material-check / mom-key-component-change）：`物料编码|供应商|序列号:数量`；物料编码 = 按 `|` 分割后的第一段。两页的校验强度不同：装配物料检查只用第一段；关重件更换要求三段非空、数量为大于 0 的纯数字（详见 §13.3）
- **图片压缩规格**（mom-packing / mom-nameplate-photo-upload）：上传前压缩为 **JPEG、≤3000×3000px、quality 0.8** 的 Base64（两页 `CONFIG` 取值一致，勿只改一页）；生产实现需解码后上传 CDN/OSS，返回可访问 URL

### 13.1 mom-nameplate-photo-upload

- **铭牌模板规则**：仅 1 个时页面自动选中；多个时由用户选择，选中后回传 `templateId`

### 13.2 mom-assembly-material-check

- 检查结果仅展示**当前订单会话**（订单查询/检查完成后清空），页面不加载历史记录
- 连续扫码：检查结果保存成功后清空物料二维码输入框并保持聚焦
- 检查结果判定：物料编码在订单 BOM 清单中 → `pass`（绿色行）；不在 → 提示并记为 `fail`（红色行），仍保存
- 接口字段 `serachKey` 按业务提供方原文保留（疑似 `searchKey` 拼写，待 Portal 侧确认后统一）

### 13.3 mom-key-component-change

单页三视图：视图1「关重件更换（主页）」+ 视图2「关重件移除页（仅改制订单）」+ 视图3「关重件更换页（`isChange = 1` 时进入）」；全部接口入参统一为 `{ taskType: "<英文任务名>", reported: { ... } }`。

- **物料二维码校验（比 §13.0 的共享格式更严）**：三段均不得为空、数量必须是大于 0 的纯数字（不接受 `2x`/`1e3` 等），否则页面直接拦截、不调用「校验并保存扫描件」
- **提交防重**：「校验并保存扫描件」「保存新关重件」请求在途时页面忽略重复触发（扫码枪连扫、连按回车只会提交一次）
- **换单与加载失败清态**：「查询订单信息」成功后立即清空上一单的关重件数据；「查询关重件信息」失败时列表保持清空（不残留上一单卡片），避免旧订单关重件被当成新订单提交
- **采集数量上限（满量即更换）**：同一关重件物料编码的已扫描数量达到需扫描总数（该物料 `materialQty` 求和）后，本次扫描不调用「校验并保存扫描件」，页面直接进入「关重件更换页」：带该关重件物料编码查询更换清单（「查询待更换明细」），由操作员选定被替换旧件后「移除关重件」移除、「保存新关重件」保存新件，数量始终保持不超过需扫描总数
- **订单号 / VIN 共用一个输入框**：输入值 `^[0-9]+$` → 填 `wipOrderNo`；17 位非纯数字 → 填 `vin`；其余非纯数字 → 兜底填 `wipOrderNo`
- **关重件序号**：`keyComponentList` 的 `materialSeq` 是**配置序号**，`snList` 的 `materialSeq` 是**采集序号**，取值均为**字符串** `"1"`（前电机）/ `"2"`（后电机）/ `null`（页面不显示类型描述）。永磁体同步电机的两条配置 `materialID` 相同、无法用物料区分前后：仅当两条配置序号恰为 `"1"` 和 `"2"` 时，页面自动分配给该物料尚未采集的那个序号；序号不明确时弹窗由操作员选择前电机(`"1"`)/后电机(`"2"`)
- **materialID 归属**：同物料编码存在多条配置时，页面按**所选 `materialSeq` 对应的那条配置**上报 `materialID`/`uomCode`（取不到才回退首条）；自动分配无解（前后位置均已采集但数量未满）时降级为弹窗人工选择，不再直接拒绝
- **关重件序号取值**：序号只有 `"1"`（前电机）/ `"2"`（后电机）/ `""`（其它）；上报字段 `materialSeq` 中配置值为 `null`/`undefined` 时一律归一为 `""`，其它配置值（如 `"3"`）原样上报
- **前后位置弹窗规则（只对永磁体同步电机）**：`materialType = "永磁体同步电机"` 的关重件才有前后位置。**采集**：仅"序号配置不明确（两条配置序号不是恰好 `"1"`+`"2"`）或前后位置都已采集"时弹窗，配置明确且有未采集位置时自动分配；**更换**：必须弹窗，由操作员现场指定被替换的位置（已在表单区预选也要弹）；**其他关重件一律不弹窗**，直接取配置序号（单条取该条，多条取首条）
- **序号人工选择**：视图1 表单区提供「关重件序号」人工选择（前电机/后电机互斥，再次点击已选项即取消＝空）；仅当本次扫描物料配置里存在位置序号 `"1"`/`"2"` 时生效（当前只有永磁体同步电机命中），在不弹窗的场景下优先于自动分配；**更换电机时仍会弹窗现场确认**；「完成」重置会话时清空选择
- **查询待更换明细按位置过滤**：进入视图3 时把 `materialSeq`（`"1"`/`"2"`/`""`）作为入参交后台按位置过滤旧件，`""` 表示不按位置过滤
- **更换页半完成保护**：「移除关重件」成功而「保存新关重件」失败时，该旧件行标记为「重试保存」（点击即用已拿到的 `oldGenealogyID` 重试「保存新关重件」，**不重复调用「移除关重件」**）；此时改选其它旧件会被拦截，点「返回」需二次确认（旧件谱系已删，返回即放弃本次更换）
- **订单类型标注**：`wipOrderType` 1=生产订单、2=改制订单；页面所有展示订单号的位置都带该标注
- **需解绑数量 / 解绑按钮**：仅改制订单（`wipOrderType = 2`）显示该行；`needRemoveQty > removeQty` 时才显示解绑按钮（进入视图2）
- **更换分支**：「校验并保存扫描件」返回 `isChange = 1` → 本次不保存，页面进入视图3 由操作员指定被替换的旧件，移除成功后用「保存新关重件」保存；`isChange` 为其它值 → 后台已直接保存，页面重新拉取「查询关重件信息」刷新
- **按钮开关**：本页每个按钮（搜索/扫码/解绑/完成/删除/移除/更换/返回）都有独立的显示开关与权限开关，配置见页面 `BUTTON_SWITCH`（§8.11）；权限关闭时按钮置灰禁用
- **完成按钮**：二次确认后清空会话（页面无「完成」类接口，仅重置本地会话）；未采集完成时确认框提示 `已采集/需采集` 数量
- **页面统计口径**：已采集数量 = `snList.length`，需采集总数 = Σ`materialQty`；卡片右侧「已扫描/需扫描」= 该物料已采集条数 / 该物料 Σ`materialQty`

---

## 14. 工具链与环境（原 TOOLCHAIN.md，已并入本文件）

> 记录本项目开发全链路各环节使用什么工具、如何调用；修改工具/环境后同步更新本节。

### 14.1 环境事实

- OS：WSL2 Ubuntu 26.04；Node v24.19.0（nvm 管理）；npm 源 npmmirror
- git：仓库 `/home/wangzm/projects/SanyH5`，身份 wangzm <1466418631@qq.com>
- 项目约束：无 package.json、无构建链、无 CI；纯静态 H5；6 个独立子项目
- WSL IP 会变：`hostname -I | awk '{print $1}'`（Windows 侧访问 WSL 服务用）

### 14.2 环节 → 工具 映射

| 环节 | 工具 | 调用方式 |
|---|---|---|
| 设计/原型 | 浏览器（Windows 侧 Chrome/Edge） | 访问 `http://localhost:8080/SanyH5/<页面目录>/` |
| 编码 | VS Code | `code /home/wangzm/projects/SanyH5` |
| 版本管理 | git | 常规 git 命令；改完即提交 |
| 本地预览 | nginx（已运行，端口 8080，root=projects） | `http://localhost:8080/SanyH5/<页面目录>/`（旧路径 `/wsl/projects/...` 已 301 兼容） |
| JS 静态检查 | ESLint 10.9.1 | `eslint <文件>`；配置：项目根 `eslint.config.mjs`；标准：**0 error 0 warning** |
| 代码格式化 | Prettier 3.9.6 | `prettier --check <文件>` / `--write`；配置：`.prettierrc.json`；忽略：`.prettierignore`（含 `*.html`、`*.md`——**markdown 禁止 `--write`**：会重排表格、改写强调标记、折行内联 JS，破坏本文档手工排版） |
| HTML 结构体检 | tidy 5.8.0 | `tidy -q -e --show-warnings no --duplicate-ids <html文件>`；**判断依据是 stderr 为空**（干净文件也可能返回退出码 1，**不要用退出码判断**）；`--duplicate-ids` 是开关，**不能再跟 `yes`**（会报 `"yes" is not a file`） |
| 页面回归 | Playwright 1.62.1 | `NODE_PATH=$(npm root -g) node tests/<子项目>.regress.cjs`（脚本临时重写、用后删除，见 §11） |
| 冒烟 | Playwright 1.62.1 | `NODE_PATH=$(npm root -g) node -e '<内联脚本>'`（临时验证用） |
| 接口联调 | curl + jq 1.8.1 | `curl <url> \| jq` |
| 抓包 | mitmproxy 8.1.1 | `mitmproxy`（代理指向 WSL IP） |
| 图片处理/EXIF | ImageMagick 7.1.2 | `convert` / `identify -verbose` |
| 代码搜索 | ripgrep 15.1.0 | `rg <pattern>`（注意命令名是 rg） |

### 14.3 环境快速自检

```bash
git log --oneline | head -1
eslint --version && playwright --version
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/SanyH5/mom-packing/index.html
```

### 14.4 部署与验证：一次只做一个子项目（**禁止全量体检**）

每个 `mom-*` 子项目独立验证、独立 tag、独立部署（§5.1），因此**逐个子项目做，不合并、不巡检全仓**；不写跨项目执行器（§4.3），回归脚本临时重写、用后删除（§11）。

**单子项目部署前检查单**（以 `mom-packing` 为例，替换目录名即可）：

```bash
cd /home/wangzm/projects/SanyH5

# 1. 只检查本页 JS + mock.js（ESLint 标准 0 error 0 warning，见 §4.1）
eslint mom-packing/Index.js mom-packing/mock.js

# 2. 只检查本页 HTML 结构（勿批量改 HTML，见 §2 第 4 条）
tidy -q -e --show-warnings no --duplicate-ids yes mom-packing/index.html

# 3. 只跑本页回归脚本（临时的，用后删除；必测点见 §11）
NODE_PATH=$(npm root -g) node tests/packing.regress.cjs
```

三项全绿 → 该子项目打 tag（§5.1；格式 `mom-packing-vx.y.z` 或既有 `photo-upload-vx.y.z`）→ 部署该页。

- 部署与验证的粒度都等于**一个页面目录**；其他子项目不需要跟着跑、跟着发
- 一次改动若同时落在多个子项目，就按 §4.3 圈出的范围**逐个**跑各自脚本，仍不合并成全量
- 权限相关（工作区外写、全局安装等）见 §3，不要绕过

### 14.4 环境坑（调用工具时注意）

1. bash 命令在沙箱中运行：**工作区外只读**（`~/.npm`、`/usr` 等）；全局安装工具需用户在终端执行
2. 命令内 `&` 起的后台进程会随命令结束被回收；常驻服务用 DSH 后台任务
3. `/tmp` 每次命令独立，不能跨命令依赖
4. `pgrep/pkill -f` 会匹配到自身命令行，用字符类规避（如 `ser[v]e`）
5. Playwright 不可驱动 Windows 侧浏览器；一律用 WSL 内 headless shell
6. Playwright 浏览器下载必须带镜像：`PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright`
7. node 脚本 require 全局包需 `NODE_PATH=$(npm root -g)`
8. **新建文件权限为 600**：write 工具创建的文件默认 `-rw-------`，nginx（www-data）读不了会 403；新建被 nginx 服务的文件后需 `chmod 644 <文件>`
9. **tidy 退出码不可信**：无错误时也返回 1；判断依据是 stderr 是否为空（见 §14.2）；`--duplicate-ids` 后面不能跟 `yes`
10. **别对 markdown 跑 `prettier --write`**（`.prettierignore` 已排除 `*.md`，原因见 §14.2）
