# agent.md — AI 代理工作守则（本仓库）

> 面向在本仓库工作的 AI 代理。工具调用详见 `TOOLCHAIN.md`；接口契约详见 `API接口对接文档.md`。
> 本文档是代理行为的最高约定，与用户口头指示冲突时以用户最新指示为准并同步更新本文档。

---

## 1. 项目概览

SanyH5：4 个 MOM 页面，纯静态 HTML/CSS/JS（jQuery 3.4.0 走 CDN），无构建链、无 package.json、无 CI。

| 页面 | 目录 | 说明 |
|---|---|---|
| 合格证查看 | mom-cert/ | 静态大 HTML + 内联脚本 + index.js 校验引擎 |
| 装箱作业 | mom-packing/ | JS 全量渲染，4 个 window API |
| 铭牌照片上传 | mom-nameplate-photo-upload/ | JS 全量渲染，4 个 window API |
| 铭牌检查结果 | mom-nameplate-check-result/ | 纯展示页，读 `window.checkResultData` |

所有页面嵌入 Portal iframe，通过 Portal 注入的 `window.xxx` 通信，本地 `#MOCK-START`~`#MOCK-END` 兜底。

## 2. 硬约束（违反即事故）

1. **mom-cert/index.html 第三方只读，禁止修改**——该页一切改动只能落在 `mom-cert/index.js`（index.js 先于内联脚本加载，可叠加修复）
2. **部署 3 文件约束**：每页生产部署只能有 index.html / index.js / index.css；**开发期允许额外 mock.js**（生产不部署该文件，Portal 只取 3 文件）
3. **项目根无 package.json、无 node_modules**；工具一律全局安装
4. **不得格式化/批量修改任何 *.html**（.prettierignore 已排除）
5. 文档类文件放根目录（如本文件、TOOLCHAIN.md、API接口对接文档.md），不塞进页面目录
6. 不删除/重命名任何现有文件，除非用户明确要求

## 3. 协作规则（权限相关）

1. 可能超出权限的操作（sudo、apt、写工作区之外等）：**先正常尝试一遍**
2. 因权限失败：**立即告知用户**，给出可复制的命令 + 用途说明，由用户在终端执行；用户执行完告知后验证结果
3. **禁止绕过权限限制**（沙箱升级、danger-full-access、路径规避、换工具硬闯）

## 4. 标准工作流（每项改动必须走完）

1. **改前**：`git status` 确认工作区干净，`git log --oneline` 确认基线
2. **改后静态检查**：`eslint <改动文件>`——基线 0 error / 48 warning，只降不升
3. **冒烟验证**：Playwright 内联脚本访问对应页面（`NODE_PATH=$(npm root -g) node -e '...'`），JS 错误数须为 0；页面通过 nginx 8080 提供（`http://localhost:8080/SanyH5/<页面目录>/`）
4. **提交**：`git add -A && git commit`，一次提交一件事，信息格式见 §5
5. **汇报**：说明改了什么、验证结果（eslint 数字 + 冒烟结果）、提交号

## 5. 提交规范

- 格式：`<type>: <中文描述>`
- type：`fix` 修 bug / `refactor` 重构 / `docs` 文档 / `chore` 配置工具 / `feat` 新功能
- 示例：`fix: mom-cert 输入归一化，消除裸 JSON.parse 崩点`

### 5.1 发布 Tag 规范

- 格式：**`<项目名>-v<主>.<次>.<补丁>`**（如 `sanyh5-v0.1.0`），带 `-a` 附注说明
- 时机：每次**可交付/可部署/里程碑**节点（日常提交不打 tag）
- 项目名小写、与仓库名一致；版本号递增（SemVer）
- 现有：`sanyh5-v0.1.0`（功能完整）/ `sanyh5-v0.2.0`（部署形态定型）/ `sanyh5-v0.3.0`（样板页定型）

## 6. 文档地图

| 文档 | 内容 | 维护责任 |
|---|---|---|
| TOOLCHAIN.md | 环境事实、环节-工具映射、环境坑、自检命令 | 工具/环境变化时更新 |
| API接口对接文档.md | Portal window API 契约（两模块合并版） | 接口变化时更新（先改文档后改代码） |
| agent.md | 本文档 | 规则变化时更新 |

## 7. 当前整改状态

- mom-nameplate-photo-upload：重构完成（HTML 骨架 + template 克隆 + 命名空间），已知 bug 全部修复 ✅
- mom-cert：归一化/XSS/`__DEV__` 运行时判断 —— 未开始
- mom-packing：上传串单/重复提交/超时/doScan + 骨架重构 —— 未开始
- mom-nameplate-check-result：骨架重构 —— 未开始
- 一致性证书 tab 显示矛盾：**待业务确认**

## 8. 编码准则（平台与工具相关）

### 8.1 生产平台语法高亮兼容（平台约束）

- 生产平台的高亮器对**正则字面量中的裸特殊字符**（`<` `>` `&` `"` `'`）识别有缺陷：会把 `<` 当 HTML 标签开始、把引号当字符串边界，导致**从该行起后续全部代码高亮错乱**（运行不受影响，仅高亮问题）
- 规避：优先用 `split/join` 链式替换实现字符替换；确需正则时用 `new RegExp("...", "g")` 字符串构造，**禁止在正则字面量中出现上述字符**
- 排查线索：代码高亮从某行起全部错乱 → 向上找最近的正则字面量，检查其中是否含裸特殊字符

### 8.2 工具使用约定

- 修改跨文件重复的公共代码后，必须用 `rg` 全局搜索同模式代码，逐一确认所有副本已同步（漏改一处 = 隐患）
- 页面改动后必须走 TOOLCHAIN.md 标准流程验证：`eslint` → Playwright 回归（nginx 8080 路径）
- 删除/重构骨架元素必须 HTML/CSS/JS 三处同步清理，`rg` 确认无残留引用

### 8.3 页面开发模式（项目标准）

页面统一采用**「HTML 骨架 + template 克隆 + JS 赋值」**架构，JS 零 HTML 拼接：

| 结构类型 | 处理方式 |
|---|---|
| 固定结构（表单/卡片头/按钮区） | HTML 直接写 |
| 多态结构（同一区域多种形态） | HTML 预埋 `.hidden` 块，JS 切换显示 |
| 循环结构（卡片/缩略图/下拉选项/详情行） | `<template>` 预埋 + `cloneTpl()` 克隆赋值 |
| 弹窗（toast/确认/模板选择/预览/loading） | 骨架常驻 HTML（hidden），JS 只显隐 + 填值 |

- 赋值一律用 `.text()/.val()/.attr()`（天然防 XSS，**不需要转义函数**）
- 列表/多态块中同功能按钮用 **class 委托**，禁止重复 id
- 后续页面（mom-packing / mom-nameplate-check-result）照此模式改造

### 8.4 技术坑（工具/平台相关）

- **`cloneTpl` 必须取 `firstElementChild`**：`$(fragment)` 上 `.data()` 存在 DocumentFragment 节点，append 进 DOM 后元素读不到 → 模板必须单根结构
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

## 9. 新页面/改造页面标准流程（样板：mom-nameplate-photo-upload）

1. **骨架先行**：先写 index.html 完整骨架——固定结构直写、多态结构 `.hidden` 块预埋、循环结构 `<template>` 预埋（单根结构）、弹窗骨架常驻 hidden
2. **命名空间**：按业务语义命名（`NameplatePhotoUpload` 式，避免泛化如 `PhotoUpload`），全称易懂
3. **JS 只赋值**：`cloneTemplate` 克隆 + `text/val/attr` 填充 + `addClass/removeClass` 类切换，**零 HTML 拼接**
4. **事件**：一次性委托绑定；弹窗回调挂 `.data()`；实例状态（预览缩放）每次打开 `off()+on()`
5. **样式归 CSS**：内联 style 仅限动态值（如进度条宽度）；初始隐藏用 `.hidden`
6. **Mock**：独立 `mock.js`（生产不部署），业务 JS 零 Mock 代码
7. **验证**：`eslint`（0/0）→ `tests/` 回归脚本 → Playwright 冒烟（nginx 8080）

## 10. Definition of Done（改动完成标准）

每项改动（修 bug / 重构 / 新功能）完成前逐项自检：

- [ ] ESLint **0 error 0 warning**
- [ ] `tests/` 回归脚本全绿（有覆盖该页的脚本时）+ 0 JS 错误
- [ ] 命名符合 §8.6（全称、易懂、业务语义）
- [ ] 骨架符合 §8.3/§9（HTML 骨架 + template + JS 赋值，零拼接）
- [ ] 折叠/弹窗交互符合 §8.5（与样板页一致）
- [ ] 接口变更同步 API接口对接文档.md（先改文档后改代码）
- [ ] 提交符合 §5 规范，工作区干净

## 11. 页面回归必测清单（tests/ 脚本覆盖）

| 页面 | 脚本 | 覆盖点 |
|---|---|---|
| mom-nameplate-photo-upload | `tests/nameplate-photo-upload.regress.cjs` | 加载/下拉筛选/查询/真实上传/删除/预览/模板多态/保存(无确认+saveType)/提交(确认+saveType)/折叠/空态/清空 |

运行：`cd /home/wangzm/projects/SanyH5 && NODE_PATH=$(npm root -g) node tests/<脚本>`（前置：nginx 8080）

改造 mom-packing / check-result 时，参照此脚本编写对应回归脚本并加入本表。
