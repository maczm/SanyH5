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
2. **部署 3 文件约束**：每页只能 index.html / index.js / index.css，不得向页面目录新增文件
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
3. **冒烟验证**：Playwright 内联脚本访问对应页面（`NODE_PATH=$(npm root -g) node -e '...'`），JS 错误数须为 0；本地服务用 `python3 -m http.server 3817`（后台任务方式）
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
| 维护性分析报告.md | 2026-08 代码 review 结论 + 整改计划（阶段 1 P0 修复中） | 整改完成一项勾一项 |
| agent.md | 本文档 | 规则变化时更新 |

## 7. 当前整改状态

- 阶段 1（P0 bug）：mom-cert 归一化/XSS/`__DEV__`、上传串单/重复提交/超时/doScan —— **未开始**
- 阶段 2（可维护性重构）：骨架回填 HTML + 模板字符串 —— 未开始
- 一致性证书 tab 显示矛盾：**待业务确认**
