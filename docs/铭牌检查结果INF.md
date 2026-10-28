# mom-nameplate-check-result（铭牌检查结果 / AI铭牌模板结果查询）数据协议

> 本文件只放注入数据与匹配规则；平台约束与公共约定见 `../AGENT.md` §8、§12。

## 注入方式

Portal 在加载 iframe 之前向 `window` 注入以下变量，页面只读、不调用任何接口。

## 受理单号

```js
window.AccpetNo
```

| 类型 | 说明 |
|---|---|
| string | 本次 AI 识别的受理单号（变量名拼写按 Portal 注入名保留，勿改） |

| 取值 | 页面行为 |
|---|---|
| 空字符串 / 纯空白 / 缺省 | 展示空态「未发起AI识别」，不渲染检查项、不轮询 |
| 非空 | 读取 `window.checkResultData` 渲染检查结果；结果横幅受理单号优先取 `data.acceptNo`，缺省时回退该值 |

## 检查结果

```js
window.checkResultData
```

JS 对象或 JSON 字符串，信封结构 `{ code, mes, data }`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `data.acceptNo` | string | 受理单号 |
| `data.status` | string | 任务状态：`PENDING` / `PROCESSING` / `COMPLETED` / `FAILED` |
| `data.overallConclusion` | string | 整体结论：`PASS` / `FAIL` / `UNCLEAR` / `RETRY` |
| `data.completedAt` | string | 检查完成时间 |
| `data.checkResults` | array | 检查项列表 |

**`checkResults` 每项**

| 字段 | 类型 | 说明 |
|---|---|---|
| `checkCode` | string | 检查项编码（如 `CHECK_001`），图片数组按此匹配 |
| `checkName` | string | 检查项名称 |
| `conclusion` | string | 该项结论：`PASS` / `FAIL` / `SKIPPED`（可空） |
| `reason` | string | 该项原因（可为空；为空时不展示原因块） |
| `fieldDetails` | array | 字段级明细 |

**`fieldDetails` 每项**

| 字段 | 类型 | 说明 |
|---|---|---|
| `fieldNameCn` | string | 字段中文名 |
| `fieldNameEn` | string | 字段英文名 |
| `conclusion` | string | 字段结论：`MATCH` / `MISMATCH` / `PASS` / `FAIL`（可空） |
| `unit` | string | 单位（如 `kW` / `kg`，可空） |
| `reason` | string | 字段级原因（可为空；展示在该字段下方） |
| `recognizedValue` | string | 识别值（铭牌上识别出的值） |
| `correctValue` | string | 正确值（公告值 / 标准值） |

## 图片数组

```js
window.ImageUrlList; // 图片地址
window.ImageNameList; // 图片名称
window.ImageCheckList; // 图片所属检查项编码
```

三个数组**等长、按索引一一对应**（同时兼容 JSON 字符串形式）：

| 数组 | 类型 | 说明 |
|---|---|---|
| `ImageUrlList[i]` | string | 图片地址；空串表示该项无图，忽略 |
| `ImageNameList[i]` | string | 图片名称；可为空（为空时不显示名称） |
| `ImageCheckList[i]` | string | 所属检查项编码，与 `checkResults[].checkCode` 匹配（忽略大小写与首尾空白） |

匹配与展示规则：

- 同一检查项可对应多张图片，按数组顺序展示；
- `ImageCheckList[i]` 在 `checkResults` 中找不到对应检查项时忽略该图片；
- 宽屏（≥ 768px）图片展示在对应检查项右侧，窄屏展示在对应检查项下方。
