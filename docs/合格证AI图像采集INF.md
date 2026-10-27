# mom-cert-ai-collect（合格证AI图像采集）API 协议

> 本文件只放接口协议（函数签名 + 入参/出参字段）；平台约束与公共约定见 `../AGENT.md` §8、§12。
> 本页当前由本地 `mock.js` 驱动；Portal 接入时按实际注入的同名函数替换。

## 查询采集任务

```js
window.getCertificateAiCollectTask({ searchKey }, callback)
```

**入参**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `searchKey` | string | 是 | 查询关键字，可为订单号、VIN、月顺序号；按包含匹配 |

**出参** `data`

| 字段 | 类型 | 说明 |
|---|---|---|
| `orderInfo` | object | 订单信息 |
| `subcategories` | array | 子类别采集配置 + 当前 active=1 的采集记录（平铺，由页面按采集项分组） |

**orderInfo**

| 字段 | 类型 | 说明 |
|---|---|---|
| `orderNo` | string | 订单号 |
| `hostCode` | string | 主机编码 |
| `vin` | string | 车辆识别码 |
| `monthSequence` | string | 月顺序号 |

**subcategories 每项**

| 字段 | 类型 | 说明 |
|---|---|---|
| `mainCategoryCode` | string | 采集项编码，相同编码归为一组 |
| `mainCategoryName` | string | 采集项名称 |
| `mainCategorySort` | number | 采集项排序值，升序 |
| `subcategoryCode` | string | 采集子项编码（同一采集项内唯一） |
| `subcategoryName` | string | 采集子项显示名称 |
| `required` | boolean | 是否必采；`true` 时至少 1 张 |
| `minCount` | number | 有图时的最少张数 |
| `maxCount` | number | 最多张数；`0` 表示无需采集 |
| `sort` | number | 采集子项在采集项内的排序值，升序 |
| `requirementDescription` | string | 采集要求文案，可为空字符串 |
| `status` | string | 子项状态：`uncollected` / `pending` / `success` / `fail` |
| `result` | string \| null | 最新识别结论：`pass` / `fail` / `null` |
| `failureType` | string | 识别失败类型：`aiRejected`（AI 不通过）/ `apiError`（接口异常）/ `timeout`（识别超时）/ 空 |
| `aiResult` | string | 最新识别结论文案 |
| `recognitionTime` | string | 最新识别时间 |
| `requestId` | string | 该采集子项的请求 ID（前端 fuid 生成；同一子项多次保存复用） |
| `images` | array | 图片对象数组 |

**images 每项**

| 字段 | 类型 | 说明 |
|---|---|---|
| `fuid` | string | 图片唯一 ID（前端生成） |
| `url` | string | 图片 URL；本地 Mock 可为空 |
| `dataUrl` | string | 图片 Base64（本地 Mock 使用；生产建议用 `url`） |
| `fileName` | string | 文件名 |
| `size` | number | 文件字节数 |
| `contentType` | string | MIME 类型 |
| `width` | number | 图片宽度 |
| `height` | number | 图片高度 |
| `sort` | number | 图片排序 |

**状态/结果语义**

- `uncollected`：未采集
- `pending`：识别中
- `success`：识别完成（AI 通过）
- `fail`：识别失败
  - `failureType=aiRejected`：AI 返回不通过，`result=fail`
  - `failureType=apiError`：接口异常，`result=null`
  - `failureType=timeout`：识别超时，`result=null`

## 保存草稿

```js
window.saveCertificateAiCollectDraft({
  orderNo, operator, mainCategoryCode, businessId, subcategories
}, callback)
```

**入参**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `orderNo` | string | 是 | 订单号 |
| `operator` | string | 是 | 当前操作员 |
| `mainCategoryCode` | string | 是 | 当前采集项编码 |
| `businessId` | string | 是 | 本次请求的业务 ID（前端 fuid 生成，每次请求不同） |
| `subcategories` | array | 是 | 需要保存的未采集子项（有图片才传） |

**subcategories 每项**

| 字段 | 类型 | 说明 |
|---|---|---|
| `mainCategoryCode` | string | 采集项编码 |
| `subcategoryCode` | string | 采集子项编码 |
| `requestId` | string | 该子项请求 ID |
| `images` | array | 图片对象数组（结构同上） |
| `status` | string | 固定 `uncollected`（草稿保存，不触发识别） |

**出参** `data`

| 字段 | 类型 | 说明 |
|---|---|---|
| `saved` | number | 保存的子项数量 |

**冲突返回**

```js
{
  code: 40901,
  errorType: "conflict",
  msg: "采集项已被其他用户录入",
  data: { operator: "张三", time: "2026-10-27 10:00:00" }
}
```

页面展示：`XX在xx时间已完成录入，请不要重复录入。`

## 发起异步识别

```js
window.startCertificateAiCollectRecognition({
  orderNo, mainCategoryCode, subcategoryCode, requestId, businessId, images, operator
}, callback)
```

**入参**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `orderNo` | string | 是 | 订单号 |
| `mainCategoryCode` | string | 是 | 采集项编码 |
| `subcategoryCode` | string | 是 | 采集子项编码 |
| `requestId` | string | 是 | 该子项请求 ID |
| `businessId` | string | 是 | 本次识别请求业务 ID（每次识别不同） |
| `images` | array | 是 | 图片对象数组 |
| `operator` | string | 是 | 当前操作员 |

**出参** `data`

| 字段 | 类型 | 说明 |
|---|---|---|
| `recognitionId` | string | 本次识别记录 ID（建议等于 businessId） |

接口只负责受理，识别结果通过状态查询接口获取。

## 查询识别状态（前台定时调用）

```js
window.getCertificateAiCollectStatus({ orderNo }, callback)
```

**出参** `data.subcategories`：每个 active=1 子项的最新状态

| 字段 | 类型 | 说明 |
|---|---|---|
| `mainCategoryCode` | string | 采集项编码 |
| `subcategoryCode` | string | 采集子项编码 |
| `requestId` | string | 子项请求 ID |
| `status` | string | `uncollected` / `pending` / `success` / `fail` |
| `result` | string \| null | `pass` / `fail` / `null` |
| `failureType` | string | `aiRejected` / `apiError` / `timeout` / 空 |
| `aiResult` | string | 最新结论文案 |
| `recognitionTime` | string | 最新识别时间 |

注意：状态查询只返回状态/结果，不返回图片，避免定时刷新覆盖本地未保存图片。

## 更新数据（停用当前记录）

```js
window.deactivateCertificateAiCollectItem({
  orderNo, mainCategoryCode, subcategoryCode, requestId, businessId, operator
}, callback)
```

后台将当前采集子项的 active 置 0，历史识别记录保留；不物理删除。

**出参**：仅 `code`、`msg`。

## 页面注入属性

| 属性 | 类型 | 说明 |
|---|---|---|
| `window.CertificateAiCollectOrderNo` | string | 可选，Portal 预置订单号 |
| `window.Operator` | string | 当前操作员 |
| `window.parent.OpenCamera(callback)` | function | 扫码，回调返回 `{ data }`、`{ value }` 或字符串 |

## 识别超时

识别中超过 2 分钟由后台定时任务更新为 `fail`，`failureType=timeout`，`result=null`；页面通过状态查询感知，不自行改状态。
