# AGENT.md — AI 代理工作守则（本仓库）

> 面向在本仓库工作的 AI 代理。**本文档是代理行为的最高约定**：与用户口头指示冲突时，以用户最新指示为准，并同步更新本文档。
> 结构：项目边界 §1–§3 ｜ 改动流程 §4–§6 ｜ 编码准则 §7 ｜ Portal API §8 ｜ 工具与环境 §9。

---

## 1. 项目边界

SanyH5：7 个独立子项目（MOM 页面），互不影响、独立部署、独立 tag。纯静态 HTML/CSS/JS，无构建链、无 package.json、无 CI。jQuery 以本地文件引入（根目录 `jquery.min.js`）；图片预览为共享库 Viewer.js（根目录 `viewer.min.js` / `viewer.min.css`）。

| 子项目 | 目录 | 架构 |
|---|---|---|
| 合格证查看 | mom-cert/ | 第三方静态 HTML + index.js 叠加引擎（HTML 只读） |
| 装箱作业 | mom-packing/ | 骨架 + template + `Packing` |
| 铭牌照片上传 | mom-nameplate-photo-upload/ | 骨架 + template + `NameplatePhotoUpload`（样板） |
| 铭牌检查结果 | mom-nameplate-check-result/ | 骨架 + template + `NameplateCheckResult` |
| 装配物料检查 | mom-assembly-material-check/ | 骨架 + template + `AssemblyMaterialCheck`（双视图：工位选择/物料检查） |
| 关重件更换 | mom-key-component-change/ | 骨架 + template + `KeyComponentChange`（四视图：更换/移除/更换确认/VIN更换） |
| 合格证AI图像采集 | mom-cert-ai-collect/ | 骨架 + template + `CertificateAiCollect`（双视图：采集详情/采集列表） |

页面嵌入 Portal iframe，与宿主通过 `window.xxx` 通信（§8）；本地开发由各页独立 `mock.js` 兜底（生产不部署，§7.8）。

## 2. 硬约束（违反即事故）

1. **mom-cert/index.html 第三方只读**：该页一切改动只能落在 `mom-cert/index.js`（index.js 先于内联脚本加载，可叠加修复）。唯一例外：2025-09 经用户批准将 jQuery CDN 改本地（仅 script src 一行），此后仍禁止其他修改。
2. **生产部署每页只有 3 文件**：index.html / index.js / index.css。开发期允许额外 `mock.js`（Portal 只取 3 文件，mock.js 不进生产）。`jquery.min.js` / `viewer.min.*` 为全仓共享库，随解决方案整体部署，各页以 `../jquery.min.js`、`../viewer.min.*` 引用。
3. **根目录无 package.json、无 node_modules**；工具一律全局安装。
4. **不格式化、不批量修改任何 `*.html`**（`.prettierignore` 已排除；mom-cert 尤其只读）；为满足 html-validate 规范做**定点修正**可以，但必须逐处核对、不许整页格式化或批量替换。
5. **本文件是唯一规则源**：全部约束/规则/约定只写在这里；不另建 docs/ 协议目录、不新增规则文件。
6. **不删除、不重命名任何现有文件**，除非用户明确要求（`tests/` 例外，见 §6）。

## 3. 权限规则

1. 可能超出权限的操作（sudo、apt、写工作区之外等）：**先正常尝试一遍**。
2. 因权限失败：**立即告知用户**，给出可复制的命令 + 用途说明，由用户在终端执行；执行完告知后验证结果。
3. **禁止绕过权限限制**（沙箱升级、danger-full-access、路径规避、换工具硬闯）。

## 4. 回归范围：按改动圈定（禁止全量体检）

**每次改动先用 git 查清动了哪个子项目，只验证这些子项目**。本仓库不存在「全量体检」——不做全页面巡检、不写跨项目执行器；部署同样一个子项目一个子项目地做（§9.3）。

| 级别 | 改动类型 | 验证范围 |
|---|---|---|
| 小 | 文案/样式微调、注释 | eslint 该文件 + 冒烟（0 JS 错误） |
| 中 | 单页逻辑/结构改动 | 该页回归脚本全绿 + eslint 0/0 |
| 大 | 重构/新功能/多页改动 | 波及的**全部**子项目 |
| 横切 | 公共文件（eslint.config、共享库、跨页同步组件） | 仅受该文件波及的子项目 |

```bash
# 改了哪些文件 → 映射到子项目目录名（跑之前先看这一行输出）
git status --porcelain | cut -c4- | grep -E '^mom-[^/]+/' | cut -d/ -f1 | sort -u
# 已提交未发布时
git diff --name-only origin/master...HEAD | grep -E '^mom-[^/]+/' | cut -d/ -f1 | sort -u
```

- 判定依据是**实际改动的文件**，不是提交信息或"感觉可能影响"；拿不准先 `git diff --stat`。
- 输出为空（只有文档/配置改动）即无需回归；不因「提交前」「要部署」升级为全量。
- 结构变更（骨架/模板/class 变化）**必须同步更新该页回归脚本**再重跑；新增页面按 §7.3 临时补脚本。

## 5. 改动步骤与完成标准

1. **改前基线**：`git status` 工作区干净（可回滚）+ `git log --oneline` 确认位置
2. **影响面**：改公共函数/组件前先 `rg` 找全部引用，列清单
3. **编码**：按 §7 编码准则
4. **验证**：按 §4 圈定范围、按级别执行（eslint → 回归脚本 → 冒烟）
5. **自查**：`git diff` 复查改动
6. **提交**：一次提交一件事，格式与验证摘要见 §6
7. **失败回滚**：验证不通过立即修复；修不快则 `git reset`/`checkout` 回基线，不留半成品

**完成标准（逐项自检）**：

- [ ] 验证全绿：eslint 0 error 0 warning；受影响子项目回归全绿、0 JS 错误；结构变更已同步脚本
- [ ] 符合 §7 中与本次改动相关的条目（命名、注释、Mock、骨架交互、回车拦截、零 id、按钮开关）
- [ ] 提交符合 §6（含实际跑了哪些脚本的验证摘要）；工作区干净且 `tests/` 已清理

## 6. 提交、Tag 与验证脚本

**提交**：`<type>: <中文描述>`，type ∈ `fix` / `refactor` / `docs` / `chore` / `feat`。body 附验证摘要：`验证：eslint 0/0，tests/<脚本> REGRESSION OK`；纯文档改动写 `文档改动，未跑回归`。

**Tag**：格式 `<子项目名>-v<主>.<次>.<补丁>`（子项目名 = 页面目录名，如 `mom-packing-v0.1.0`），`-a` 附注，SemVer 递增。前置条件是该子项目验证全绿，不要求其他子项目；时机为可交付/可部署/里程碑节点，日常提交不打 tag。tag 与部署都按单页独立进行。

**回归脚本 `tests/`（不纳入 git，用后即弃）**：

- 命名 `tests/<子项目目录名>.regress.cjs`；只写本次涉及子项目的脚本（§4），不预存全部页面脚本，不写跨项目执行器
- 必测点从该页 `index.js` 分支逻辑推导，不在此维护清单（会随代码漂移）
- 验证完成后 `rm -rf tests/`：不留在工作区、不提交（禁止 `git add -f`）
- 运行 `NODE_PATH=$(npm root -g) node tests/mom-packing.regress.cjs`（前置 nginx 8080，§9.1）
- 写法：Playwright 无头 + `waitIdle()` 状态等待（不用固定 sleep）；历史模板可参考 `5b8da6d`，仅参考、不入库

## 7. 编码准则

### 7.1 平台语法高亮兼容

平台高亮器不解析正则字面量中的裸特殊字符（`<` `>` `&` `"` `'`）：会把 `<` 当 HTML 标签开始、引号当字符串边界，导致**从该行起后续全部代码高亮错乱**（仅高亮问题，运行不受影响）。
规避：优先用 `split/join` 链式替换；确需正则时用 `new RegExp("...", "g")` 字符串构造，**禁止在正则字面量中出现上述字符**。
排查线索：高亮从某行起全部错乱 → 向上找最近的正则字面量。注释内容同样受此约束。

### 7.2 复用与共享常量

- 修改跨文件重复的公共代码后，必须 `rg` 全局搜索同模式，逐一确认所有副本已同步
- 删除/重构骨架元素必须 HTML/CSS/JS 三处同步清理，`rg` 确认无残留
- **共享参数名照抄，不做"纠错"**：如 `serachKey` 按业务提供方原文保留（疑似 `searchKey` 拼写错误，未经 Portal 侧确认不许改名）
- **跨页共享常量必须同时改**：图片压缩参数（`MAX_IMAGE_WIDTH` / `MAX_IMAGE_HEIGHT` / `JPEG_QUALITY`，数值以页面代码为准）在 mom-packing、mom-nameplate-photo-upload、mom-cert-ai-collect 三页 `CONFIG` 中各有一份

### 7.3 页面结构（骨架 + template + 赋值）

JS 零 HTML 拼接：

| 结构类型 | 处理方式 |
|---|---|
| 固定结构（表单/卡片头/按钮区） | HTML 直接写 |
| 多态结构（同一区域多种形态） | HTML 预埋 `.hidden` 块，JS 切换显示 |
| 循环结构（卡片/缩略图/下拉选项/详情行） | `<template>` 预埋（单根）+ `cloneTemplate()` 克隆赋值 |
| 弹窗（toast/确认/模板选择/预览/loading） | 骨架常驻 HTML（hidden），JS 只显隐 + 填值 |

- 赋值一律用 `.text()/.val()/.attr()`（天然防 XSS，**不需要转义函数**）
- 列表/多态块中同功能按钮用 **class 委托**；一个 class 只标识一个元素
- 新页面顺序：完整骨架先行（含模板、弹窗、`.hidden` 块）→ 按业务语义定命名空间（`NameplatePhotoUpload` 式，避免泛化）→ 只赋值不拼 HTML → 一次性委托绑定 → 样式归 CSS（内联仅限动态值）→ 独立 `mock.js`（§7.8）→ 临时回归脚本（§6）

### 7.4 技术坑

- **`cloneTemplate` 必须取 `firstElementChild`**：`$(fragment)` 上 `.data()` 存在 DocumentFragment 节点，append 进 DOM 后元素读不到 → 模板必须单根结构
- **`.hidden`（`display:none !important`）与 jQuery `show()/hide()/toggle()` 冲突**：统一用 `addClass/removeClass/toggleClass("hidden")`
- **骨架常驻后的事件策略**：动态克隆元素一律委托绑定；弹窗回调数据挂 `.data()`；预览缩放等实例状态每次打开先 `off()` 再 `on()`
- **禁止用失焦（blur / focusout）触发业务动作**：移动端与表单宿主下时机不可靠，且与按钮点击抢事件；业务动作只由 **回车 / 按钮 / 扫码** 触发
- 回车统一入口：委托在页面根容器上按输入框 class 分派，并跳过输入法组字中的回车（`isComposing` 或 `keyCode === 229`）
- **扫码框键盘控制**：平时保持可编辑（扫码枪可直接键入、连续扫码）；**程序化聚焦时先临时 `readonly` 再聚焦**（不弹软键盘），聚焦后解锁；手动点击照常弹键盘
- 页面初次渲染（初始显隐状态）必须在 `initPage` 中显式执行一次
- **`<img>` 占位不用 `src=""`**（html-validate 判非法）：用 1px 透明 GIF 的 data URI 占位，JS 运行时再赋真实 `src`
- **表单宿主可能在根容器上方留不可见占位**（实测 6px，父层 `padding`/`border` 均为 0）：用 `compensateHostTopGap()` 抵消——先复位 `margin-top`，再测「根容器顶部偏移 − 父层顶部偏移」，仅当父层无 `padding`/`border` 且差值在 40px 以内时施加等量负 margin；**必须紧接在 `fitPageHeight()` 之前执行**（顺序反了高度按旧偏移算），`resize` 时同样先抵消后算高。本地直开 / iframe 嵌入时父层为 `body`、差值为 0，自然 no-op

### 7.5 UI 一致性

- 同类组件样式与交互必须完全一致（背景/内边距/字体/圆角逐项对齐）
- 弹窗类 UI（toast/确认/选择）骨架预埋，运行时不重建 DOM
- **纯图标按钮必须带 `aria-label`**（无可见文字时唯一的可访问名称，html-validate `text-content` 强制）
- **页面不自绘顶部标题行**：标题栏由 Portal 提供；右上角控件（返回、VIN更换等）优先做成根容器**流式首项**贴顶右对齐（控件高度即顶部占用），确需固定定位时在根容器预留 `padding-top`；两者都以不遮挡首行内容为准

### 7.6 命名

- **禁止缩写标识符**：`cb`→`callback`、`tpl`→`template`、`pt`→`photoType`、`$dd`→`$dropdown`、`s`→`state`、`sid`→`sessionId`
- 变量/函数/对象属性用完整单词或词组（`sessionId`、`selectedTemplateId`、`renderOrderInfo`）
- DOM class 用完整语义词组（`machine-code-value`），**禁止拼凑缩写**（`machvin`）；不写 id（§7.10）
- CSS 类名可沿用行业前缀（`btn-`/`icon-`），主体用完整单词
- 循环变量允许 `i/j/k`（惯例），其余一律全称

### 7.7 注释

好代码靠命名表达意图，**只保留三类注释**：方法头（用途、参数、返回值，复杂函数加关键步骤）、"为什么"类（业务规则、平台约束、绕坑原因）、绕坑/兼容性说明。
禁止逐行解释、与代码重复的废话注释、注释掉的死代码（git 历史可查）。注释内容同样受 §7.1 约束。

### 7.8 Mock / 演示数据隔离

- Mock 数据与 Mock API **必须放页面目录内 `mock.js`**（开发期部署、生产不部署）；承载本页全部 Mock 与 API 兜底，**无需任何清理动作**
- **禁止在业务 JS（index.js）内联演示数据**：`MOCK_RESULT` 式常量、`__DEV__` 分支内嵌数据、mock 逻辑
- index.html 用 `<script src="mock.js">` 引用（置于业务 JS 之前）；业务 JS 对未注入数据只做检测，无数据展示空态/兜底，零 Mock 代码
- 例外：mom-cert 因第三方 HTML 只读无法引用 mock.js（§2 第 1 条），暂维持 `__DEV__` 内联；此例外不扩散

### 7.9 Portal 表单粘贴：回车提交拦截

生产侧把代码按 html/js/css 三段**粘贴进 Portal 表单页**，页面处于 form 上下文：输入框内按回车会默认提交表单、整页刷新，必须拦截。
拦截方式：页面**直接定义空实现的全局函数** `function Portal_OnDocumentKeyDown() {}`（Portal 约定钩子，定义即生效）；不需要页面调用、不要写任何逻辑、更不要覆盖成有副作用的实现。页面自身的回车业务响应绑定在输入框 **keydown** 上，两者职责分离。

### 7.10 禁用 id（一刀切）

Portal 表单环境下 **id 属性一律不可用**：控件 id 在运行页面里取不到。

- 页面**一律不写 id、不用 id 选择器**（含 div / span / template 等所有元素）；HTML 用 class 标识，JS/CSS 用 class 选择器，事件用 class 委托
- `<template>` 用 class 标识，`cloneTemplate` 内部用 `document.querySelector("." + templateClassName)`；工具函数（如扫码）接收 class 选择器而非 id
- 唯一例外：mom-cert 第三方 HTML（只读、含大量第三方 id）的 index.js 只能按第三方 id 定位；此例外不扩散
- 排查线索：元素点击无响应、输入框读值为空、清空/回填无效 → 先检查是否用了 id

### 7.11 输入框按钮与按钮开关

1. **每个输入框成对提供「搜索按钮」与「扫码按钮」**（`btn-search-*` / `btn-scan-*`）：搜索走手动输入后的查询，扫码走 `OpenCamera`；业务动作只由 回车/按钮/扫码 触发（§7.4）
2. **每个按钮独立配置「显示开关」与「权限开关」**，集中在命名空间的一个 `BUTTON_SWITCH` 常量对象里（禁止散落在各处 if 中）：
   - `visible: false` → 加 `.hidden`
   - `permitted: false` → **置灰禁用、保留占位**（布局不跳动）：需提示的配 `deniedMessage`，加 `.disabled` + `aria-disabled="true"` 而**不加原生 `disabled`**（原生 disabled 不派发 click，提示无从触发），回调首行 `ensureButtonPermitted(开关项)` 拦截并弹提示；不需提示的直接用原生 `disabled`
   - 开关按按钮语义命名（`searchOrder` / `scanOrder` / `unbind` / `complete` / `deleteSerial` / `removeRecord` / `changeRecord` / `back` / `vinChange` / `searchVinOrder` / `scanVinOrder` / `scanNewVin` / `scanFactoryCode` / `confirmVinChange` / `backVinChange`），一按钮一项、互相独立
3. 按「class → 按钮」映射表统一应用：常量 `BUTTON_SELECTOR` + 函数 `applyButtonSwitch()`（初始化与每次渲染后各一次）；**循环结构克隆的行内按钮必须在渲染后重放一次**，否则拿不到开关状态
4. **业务条件与开关叠加取交集**：如解绑按钮 = `wipOrderType === 2 && needRemoveQty > removeQty && BUTTON_SWITCH.unbind.visible`，由专门函数（如 `updateUnbindButton()`）在开关应用末尾统一计算，不允许两处各写一半
5. 对**新建/改造页面**生效；既有页面后续改造时同步，不做一次性批量改造

## 8. Portal API 公共约定

页面嵌入 Portal iframe，**Portal 在加载 iframe 之前**向 `window` 注入全局函数。页面用 `typeof window.xxx != 'function'` 检测：已注入用真实函数，未注入由本页 `mock.js` 兜底（§7.8）。各页函数名与字段以该页代码为准（本仓库不维护协议文档）。

- **回调格式**（全部 API 统一）：`callback({ code, msg, data? })`；`code: 0` 成功、非 0 失败；失败时 `msg` 为错误描述，页面直接展示给用户。全部 callback 风格，无 Promise/返回值约定
- **注入属性**：`Operator`（string，当前操作员姓名/工号，提交回传）、各页 `window.<函数名>`
- **扫码**：`window.parent.OpenCamera(callback)`，回调返回 `{ data: "扫码结果字符串" }`（兼容 `{ value: "..." }` 或纯字符串）
- **图片预览**：`new window.Viewer(图片元素, 选项)`，单图预览、不跨图翻页；库未加载时页面静默跳过预览

## 9. 工具与环境

> 工具版本以机器实际安装为准（`<工具> --version`），本文只记调用方式与判定标准、**不记版本号**；滚动升级工具后若调用方式或判定标准变了，同步改本节。

### 9.1 环境事实

- OS：WSL2 Ubuntu；Node 由 nvm 管理；npm 源 npmmirror
- 仓库 `/home/wangzm/projects/SanyH5`，git 身份 wangzm <1466418631@qq.com>，远端 `github.com/maczm/SanyH5`
- 本地预览：nginx 常驻，端口 8080，root=projects → `http://localhost:8080/SanyH5/<页面目录>/`
- WSL IP 会变：`hostname -I | awk '{print $1}'`（Windows 侧访问 WSL 服务用）

### 9.2 工具清单

| 用途 | 工具 | 调用方式与判定 |
|---|---|---|
| 编辑 | VS Code | `code /home/wangzm/projects/SanyH5` |
| 版本管理 | git | 常规命令；改完即提交（§6） |
| 代码搜索 | ripgrep | `rg <pattern>`（命令名是 rg） |
| JS 静态检查 | ESLint | `eslint <文件>`；配置 `eslint.config.mjs`；标准 **0 error 0 warning** |
| 格式化 | Prettier | `prettier --check` / `--write`；配置 `.prettierrc.json`，忽略 `.prettierignore`（含 `*.html`、`*.md`） |
| HTML 结构体检 | html-validate | `html-validate <html文件>`；配置根目录 `.htmlvalidate.json`；**exit 0 即通过**（有 error 返回 1）；mom-cert 第三方只读页不跑 |
| 页面回归 / 冒烟 | Playwright | `NODE_PATH=$(npm root -g) node tests/<脚本>`（脚本临时重写，§6）；冒烟用 `node -e` 内联，不留脚本 |
| 接口联调 | curl + jq | `curl <url> \| jq` |
| 抓包 | mitmproxy | `mitmproxy`（代理指向 WSL IP） |
| 图片处理 / EXIF | ImageMagick | `convert` / `identify -verbose` |

### 9.3 每页自检与部署（一次只做一个子项目）

先确认环境在位（任一项失败先修环境，不要继续跑回归）：

```bash
git log --oneline | head -1
eslint --version && playwright --version
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/SanyH5/mom-packing/index.html
```

再跑该页三项检查。以 `mom-packing` 为例，替换目录名即可：

```bash
cd /home/wangzm/projects/SanyH5

# 1. 本页 JS + mock.js（ESLint 0 error 0 warning）
eslint mom-packing/Index.js mom-packing/mock.js

# 2. 本页 HTML 结构（exit 0 即通过；勿批量改 HTML，§2 第 4 条）
html-validate mom-packing/index.html

# 3. 本页回归脚本（临时，用后删除；§6）
NODE_PATH=$(npm root -g) node tests/mom-packing.regress.cjs
```

三项全绿 → 打该页 tag（§6）→ 部署该页。其他子项目不需要跟着跑、跟着发；一次改动落在多页时按 §4 圈出的范围**逐个**跑，仍不合并成全量。

HTML 体检报 error 就**改 HTML 让它通过**，不接受规则豁免、不用 `off` 压掉、不加例外清单。

### 9.4 工具坑

**沙箱与安装**
- bash 在沙箱中运行：**工作区外只读**（`~/.npm`、`/usr` 等）；全局安装工具、装系统包需用户在终端执行（§3）
- `/tmp` 每条命令独立，不能跨命令依赖

**后台进程**
- 命令内 `&` 起的后台进程随命令结束被回收；常驻服务用 DSH 后台任务
- `pgrep/pkill -f` 会匹配到自身命令行，用字符类规避（如 `ser[v]e`）

**node 脚本**
- require 全局包需 `NODE_PATH=$(npm root -g)`

**Playwright**
- 不可驱动 Windows 侧浏览器，一律用 WSL 内 headless shell
- 浏览器下载必须带镜像：`PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright`
- `aria-disabled="true"` 的元素被拒绝点击（判为 not enabled），脚本须 `.click({ force: true })`；真实浏览器照常派发 click

**判定与产物**
- **html-validate 判定看退出码**：0 = 通过、1 = 有 error；warning 不阻断。配置只继承 `html-validate:recommended`（`.htmlvalidate.json`），**不豁免任何规则**——报错就按规则改 HTML，不许加 `off` 绕过
- 不用 `--fix` 批量改 HTML：会顺手改写无关结构（§2 第 4 条）；要改就逐处定点修改
- **新建文件权限为 600**：write 工具产物默认 `-rw-------`，nginx（www-data）读不了会 403；新建被服务的文件后 `chmod 644 <文件>`
- **别对 markdown 跑 `prettier --write`**（`.prettierignore` 已排除 `*.md`）：会重排表格、改写强调标记、折行内联 JS，破坏手工排版
