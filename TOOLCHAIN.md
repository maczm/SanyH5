# SanyH5 工具链速查（TOOLCHAIN.md）

> 本文件是开发会话的环境手册：工具在哪、怎么调、有什么坑、标准工作流。
> 每次改动工具/环境后请同步更新本文件。

---

## 0. 项目硬约束（改代码前必读）

| 约束 | 说明 |
|---|---|
| **mom-cert/index.html 只读** | 第三方模板，**禁止修改**；该页一切改动只落在 `mom-cert/index.js`（index.js 先于内联脚本加载，可"叠加"修复） |
| **部署 3 文件约束** | 每页只能 index.html / index.js / index.css；不能新增公共文件、不能引入构建链 |
| **无 package.json** | 项目根不允许 package.json / node_modules；工具全部全局安装（nvm 目录，无需 sudo） |
| **Mock 区块** | 各页 `#MOCK-START` ~ `#MOCK-END` 为本地开发用，生产由 Portal 注入 `window.xxx` 同名函数自动跳过；`mom-cert/index.js` 是硬编码 `__DEV__` 开关（待改运行时判断） |
| 页面结构 | mom-cert = 静态大 HTML（4676 行）+ 内联脚本；其余三页 = 空壳 HTML + JS 全量渲染 |

## 1. 环境事实

- **OS**：WSL2 Ubuntu 26.04（沙箱化 bash 环境，见 §3）
- **Node**：v24.19.0（nvm 管理，`~/.nvm/versions/node/v24.19.0`），npm 12
- **npm 源**：registry.npmmirror.com（配在 `~/.npmrc`）
- **git**：仓库 `/home/wangzm/projects/SanyH5`，全局身份 `wangzm <1466418631@qq.com>`，基线提交 `68b05e3`
- **WSL IP 会变**：`hostname -I | awk '{print $1}'`（Windows 侧访问 WSL 服务用它）
- 项目当前无 CI、无构建、无测试文件（测试用 Playwright 内联脚本临时跑）

## 2. 工具清单与调用方式

| 工具 | 版本 | 调用方式 | 用途 |
|---|---|---|---|
| git | 2.53 | `git` | 版本管理；改完代码提交，每次提交可回滚 |
| Node/npm | v24.19.0 / 12 | `node` / `npm` | 运行测试脚本（NODE_PATH 见下） |
| **ESLint** | 9.39.5 | `eslint <文件或目录>` | JS 静态检查。配置：项目根 `eslint.config.mjs`。基线：**0 error / 48 warning**（全部 eqeqeq），改动后只降不升 |
| Prettier | 3.9.6 | `prettier --check <文件>` / `--write` | 格式化。**不要**对 *.html 用（.gitignore 有排除，mom-cert HTML 只读） |
| **Playwright** | 1.62.1 | 见 §4 冒烟脚本 | E2E/冒烟测试。浏览器引擎在 `~/.cache/ms-playwright`（chromium + headless shell + ffmpeg） |
| python3 | 3.14 | `python3 -m http.server 3817` | 本地静态预览（零坑，无 cleanUrls 重定向问题） |
| tidy | HTML Tidy | `tidy -q -e --show-warnings no --duplicate-ids yes <file>` | HTML 结构体检（未闭合标签/重复 id），4 页面基线 0 error |
| jq | 1.8.1 | `jq` | JSON 校验/提取，接口联调 |
| ImageMagick | 7.1.2 | `convert` / `magick` / `identify` | 图片处理、EXIF 查看（`identify -verbose` 看 orientation） |
| mitmproxy | 8.1.1 | `mitmproxy` | 抓包（替代 Charles/Fiddler，纯 WSL） |
| ripgrep | 15.1.0 | `rg`（**注意命令名是 rg**） | 极速搜索 |

## 3. 沙箱环境坑（每次会话必踩，先看这里）

bash 命令运行在 bwrap 沙箱中，有以下行为：

1. **工作区外只读**：`/home/wangzm/projects/SanyH5` 之外（含 `~/.npm`、`/usr`、`~/.nvm` 全局目录）**只读**。`npm i -g` 会报 EROFS——装工具由用户在自己的终端执行，不要自己跑。
2. **后台进程生命周期**：命令里用 `&` 起的进程会随命令结束被回收（`--die-with-parent`）。要常驻服务（如 http.server），用 **DSH 后台任务**（bash 工具 `run_in_background: true`），且进程归属为 job，结束时记得 job_kill。
3. **`/tmp` 是临时 tmpfs**：每次命令独立，写 /tmp 的日志命令结束即消失，不能跨命令依赖。
4. **pgrep/pkill 自杀**：`pgrep -f "serve"` 会匹配到自己的命令行。用字符类规避：`pgrep -f "ser[v]e"`，或先 `pgrep -af` 看 PID 再精确 kill。
5. **Windows 浏览器不可从 WSL 稳定驱动**：Playwright executablePath 指向 `/mnt/c/...chrome.exe` 能找到但启动即崩。一律用 WSL 内的 headless shell（`~/.cache/ms-playwright`）。
6. **Playwright 浏览器下载**：官方 CDN 极慢（实测卡 56 分钟），必须带镜像：`PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright playwright install <browser>`。
7. **WSL 内无浏览器**：本地预览用 Windows 侧 Chrome/Edge 访问 `http://<WSL-IP>:3817`；自动化用 Playwright headless。
8. **npm 全局模块路径**：`node -e "require('playwright')"` 需要 `NODE_PATH=$(npm root -g)` 才能找到全局包。

## 4. 标准工作流（改代码 → 验证 → 提交）

### 4.1 改动前

```bash
cd /home/wangzm/projects/SanyH5
git status                     # 确认工作区干净
git log --oneline | head -3    # 确认基线
```

### 4.2 改动后静态检查

```bash
eslint mom-cert/index.js mom-packing/Index.js mom-nameplate-photo-upload/index.js mom-nameplate-check-result/index.js
# 期望：0 error；warning 数 ≤ 基线 48，只降不升
```

### 4.3 冒烟测试（Playwright，内联脚本不留文件）

```bash
# 前提：本地服务在跑（§4.5）
NODE_PATH=$(npm root -g) node -e '
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text().slice(0, 60)); });
  await page.goto("http://127.0.0.1:3817/<页面路径>/index.html", { timeout: 15000 });
  await page.waitForTimeout(1000);
  console.log("TITLE:", await page.title());
  console.log("JS错误:", errors.length, errors.join(" | "));
  await browser.close();
  console.log("SMOKE OK");
})().catch(e => { console.error("SMOKE FAIL:", e.message.split("\n")[0]); process.exit(1); });
'
```

页面路径：`mom-cert/` `mom-packing/` `mom-nameplate-photo-upload/` `mom-nameplate-check-result/`

### 4.4 提交

```bash
cd /home/wangzm/projects/SanyH5
git add -A && git commit -m "fix: 一句话说明改动"
```

### 4.5 本地服务（DSH 后台任务方式）

```bash
cd /home/wangzm/projects/SanyH5 && exec python3 -m http.server 3817
# 用 bash 工具 run_in_background: true 启动；Windows 侧访问 http://<WSL-IP>:3817
```

## 5. 环境快速自检

```bash
git log --oneline | head -1                              # 基线 68b05e3
eslint --version && playwright --version                 # 9.39.5 / 1.62.1
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3817/   # 200 = 预览服务在跑
```

## 6. 已知遗留（review 结论摘要，修复中跟踪）

- mom-cert：裸 `JSON.parse` ×14（缺字段崩）、`#check_content` XSS、`__DEV__` 硬编码、`debugger;` ×3（HTML 内不可动）、一致性证书 tab 显示矛盾（待业务确认）
- mom-packing / photo-upload：上传串单竞态、重复提交窗口、API 无超时、doScan 跨域、EXIF 旋转
- mom-nameplate-check-result：无自动刷新、未知枚举静默归类
- 横切：jQuery 3.4.0 老旧（jsdelivr CDN 无 SRI）、全局函数裸奔、跨页复制粘贴 ~310 行
