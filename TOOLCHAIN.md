# SanyH5 工具链手册（TOOLCHAIN.md）

> 用途：记录本项目开发全链路各环节使用什么工具、如何调用。
> 修改工具/环境后请同步更新本文件。

---

## 协作规则（最重要）

1. 遇到可能超出权限的操作（`sudo`、`apt install`、写工作区之外、系统级配置等），**先正常尝试一遍**。
2. 若因权限失败：**立即告知用户**，给出可复制的命令（附用途说明），由用户在终端执行；用户执行完告知后，AI 再验证结果。
3. **不得尝试绕过权限限制**（沙箱升级、`danger-full-access`、改路径规避、换工具硬闯等），一律走"尝试 → 告知 → 用户执行"流程。

## 环境事实

- OS：WSL2 Ubuntu 26.04；Node v24.19.0（nvm 管理）；npm 源 npmmirror
- git：仓库 `/home/wangzm/projects/SanyH5`，身份 wangzm <1466418631@qq.com>
- 项目约束：无 package.json、无构建链、无 CI；纯静态 H5
- WSL IP 会变：`hostname -I | awk '{print $1}'`（Windows 侧访问 WSL 服务用）

## 环节 → 工具 映射

| 环节 | 工具 | 调用方式 |
|---|---|---|
| 设计/原型 | 浏览器（Windows 侧 Chrome/Edge） | 访问 `http://<WSL-IP>:3817/<页面目录>/` |
| 编码 | VS Code | `code /home/wangzm/projects/SanyH5` |
| 版本管理 | git | 常规 git 命令；改完即提交 |
| 本地预览 | python3（内置，零安装） | `python3 -m http.server 3817`（需常驻时用后台任务） |
| JS 静态检查 | ESLint 9.39.5 | `eslint <文件>`；配置：项目根 `eslint.config.mjs`；基线 0 error / 48 warning，只降不升 |
| 代码格式化 | Prettier 3.9.6 | `prettier --check <文件>` / `--write`（不要作用于 *.html） |
| HTML 结构体检 | tidy | `tidy -q -e --show-warnings no --duplicate-ids yes <html文件>` |
| 自动化测试/冒烟 | Playwright 1.62.1 | `NODE_PATH=$(npm root -g) node -e '<内联脚本>'`（脚本内容会话中生成） |
| 接口联调 | curl + jq 1.8.1 | `curl <url> \| jq` |
| 抓包 | mitmproxy 8.1.1 | `mitmproxy`（代理指向 WSL IP） |
| 图片处理/EXIF | ImageMagick 7.1.2 | `convert` / `identify -verbose` |
| 代码搜索 | ripgrep 15.1.0 | `rg <pattern>`（注意命令名是 rg） |

## 环境坑（调用工具时注意）

1. bash 命令在沙箱中运行：**工作区外只读**（`~/.npm`、`/usr` 等）；全局安装工具需用户在终端执行
2. 命令内 `&` 起的后台进程会随命令结束被回收；常驻服务用 DSH 后台任务
3. `/tmp` 每次命令独立，不能跨命令依赖
4. `pgrep/pkill -f` 会匹配到自身命令行，用字符类规避（如 `ser[v]e`）
5. Playwright 不可驱动 Windows 侧浏览器；一律用 WSL 内 headless shell
6. Playwright 浏览器下载必须带镜像：`PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright`
7. node 脚本 require 全局包需 `NODE_PATH=$(npm root -g)`

## 环境快速自检

```bash
git log --oneline | head -1
eslint --version && playwright --version
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3817/
```
