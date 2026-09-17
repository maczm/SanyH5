// ============== 全量回归并行执行器 ==============
// 用法：cd /home/wangzm/projects/SanyH5 && NODE_PATH=$(npm root -g) node tests/run-all.regress.cjs [并发数]
// 前置：nginx 8080 运行中。串行跑完全部脚本约 2 分钟，并行（默认 3）约 30~40s。
// 说明：每个脚本各自启动 headless 浏览器，并发数过大反而互相拖慢，默认 3 即可。
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const concurrency = Math.max(1, Number(process.argv[2]) || 3);
const testsDirectory = __dirname;
const projectRoot = path.resolve(testsDirectory, "..");
const runnerName = path.basename(__filename);
// 排除执行器自身，否则会递归把自己当脚本执行
const scriptNames = fs.readdirSync(testsDirectory)
  .filter((name) => name.endsWith(".regress.cjs") && name !== runnerName)
  .sort();
const startedTime = Date.now();

const formatDuration = (milliseconds) => (milliseconds / 1000).toFixed(1) + "s";

const runScript = (scriptName) =>
  new Promise((resolve) => {
    const scriptStartedAt = Date.now();
    console.log(`▶ ${scriptName} 开始`);
    const child = spawn(process.execPath, [path.join(testsDirectory, scriptName)], {
      cwd: projectRoot,
      env: process.env,
    });
    let output = "";
    const timeoutTimer = setTimeout(() => {
      output += "\n[执行器] 超过 300s 未结束，已终止该脚本\n";
      child.kill("SIGKILL");
    }, 300000);
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    child.on("close", (exitCode) => {
      clearTimeout(timeoutTimer);
      const duration = Date.now() - scriptStartedAt;
      const passed = exitCode === 0 && /REGRESSION OK/.test(output);
      console.log(`${passed ? "✅" : "❌"} ${scriptName} (${formatDuration(duration)})`);
      resolve({ scriptName, passed, duration, output });
    });
  });

(async () => {
  const results = [];
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, scriptNames.length) }, async () => {
    while (nextIndex < scriptNames.length) {
      const scriptName = scriptNames[nextIndex++];
      results.push(await runScript(scriptName));
    }
  });
  await Promise.all(workers);

  const failed = results.filter((result) => !result.passed);
  failed.forEach((result) => {
    console.log(`\n---- ${result.scriptName} 失败输出（末 20 行） ----`);
    console.log(result.output.split("\n").slice(-20).join("\n"));
  });
  const slowest = results.slice().sort((left, right) => right.duration - left.duration)[0];
  console.log("----");
  console.log(`脚本 ${results.length} 个，失败 ${failed.length} 个，并行度 ${concurrency}，总耗时 ${formatDuration(Date.now() - startedTime)}（最慢单脚本 ${slowest.scriptName} ${formatDuration(slowest.duration)}）`);
  console.log(failed.length ? "ALL REGRESSION FAIL" : "ALL REGRESSION OK");
  process.exit(failed.length ? 1 : 0);
})();
