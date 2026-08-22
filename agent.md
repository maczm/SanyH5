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

## 6. 文档地图

| 文档 | 内容 | 维护责任 |
|---|---|---|
| TOOLCHAIN.md | 环境事实、环节-工具映射、环境坑、自检命令 | 工具/环境变化时更新 |
| API接口对接文档.md | Portal window API 契约（两模块合并版） | 接口变化时更新（先改文档后改代码） |
| agent.md | 本文档 | 规则变化时更新 |

## 7. 当前整改状态

- mom-nameplate-photo-upload：重构完成（骨架回填 + 命名空间 + 模板字符串），已知 bug 全部修复 ✅
- mom-cert：归一化/XSS/`__DEV__` 运行时判断 —— 未开始
- mom-packing：上传串单/重复提交/超时/doScan —— 未开始
- 阶段 2 重构：mom-packing / mom-nameplate-check-result —— 未开始
- 一致性证书 tab 显示矛盾：**待业务确认**

## 8. 编码准则（平台与工具相关）

### 8.1 生产平台语法高亮兼容（平台约束）

- 生产平台的高亮器对**正则字面量中的裸特殊字符**（`<` `>` `&` `"` `'`）识别有缺陷：会把 `<` 当 HTML 标签开始、把引号当字符串边界，导致**从该行起后续全部代码高亮错乱**（运行不受影响，仅高亮问题）
- 规避：优先用 `split/join` 链式替换实现字符替换；确需正则时用 `new RegExp("...", "g")` 字符串构造，**禁止在正则字面量中出现上述字符**
- 排查线索：代码高亮从某行起全部错乱 → 向上找最近的正则字面量，检查其中是否含裸特殊字符

### 8.2 工具使用约定

- 修改跨文件重复的公共代码后，必须用 `rg` 全局搜索同模式代码，逐一确认所有副本已同步（漏改一处 = 隐患）
- 页面改动后必须走 TOOLCHAIN.md 标准流程验证：`eslint` → Playwright 回归（nginx 8080 路径）
