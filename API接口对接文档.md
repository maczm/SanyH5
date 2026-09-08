# SanyH5 API 接口对接文档

> 本文档是 Portal 侧实现 `window` 注入函数的唯一依据；页面代码与本文不一致时以本文为准。

---

## 一、公共约定

### 1.1 运行方式

H5 页面嵌入 Portal iframe，**Portal 在加载 iframe 之前**向 `window` 注入全局函数。页面通过 `typeof window.xxx != 'function'` 检测：已注入则使用真实函数；未注入则启用本地 Mock（各页独立 `mock.js`，**仅本地开发，生产不部署**）。

### 1.2 回调格式（全部 API 一致）

```js
callback({ code: number, msg: string, data?: any })
```

- `code: 0` = 成功；非 `0` = 失败
- `msg`：失败时为错误描述，页面直接展示给用户
- 所有 API 均为 callback 风格，无 Promise/返回值约定

### 1.3 Portal 注入属性总表

| 页面 | window 属性 | 类型 | 说明 |
|---|---|---|---|
| 两个页面共用 | `Operator` | string | 当前操作员姓名/工号，Header 展示 + 提交回传 |
| mom-packing | `searchByPackingList` | function | 装箱单号搜索（API-P1） |
| mom-packing | `searchByMaterialCode` | function | 物料编码搜索（API-P2） |
| mom-packing | `uploadPackingImage` | function | 图片上传（API-P3） |
| mom-packing | `submitPacking` | function | 装箱提交（API-P4） |
| mom-nameplate-photo-upload | `getStationList` | function | 获取工位列表（API-N1） |
| mom-nameplate-photo-upload | `getPhotoConfig` | function | 照片类型配置 + 订单信息（API-N2） |
| mom-nameplate-photo-upload | `uploadPhoto` | function | 上传单张照片（API-N3） |
| mom-nameplate-photo-upload | `submitPhotoRecord` | function | 照片记录提交/保存（API-N4，`saveType` 区分） |
| mom-assembly-material-check | `assemblyMaterialCheck_getWorkStationList` | function | 获取工位列表（API-AM1） |
| mom-assembly-material-check | `assemblyMaterialCheck_getWipOrderNoInfo` | function | 查询订单/主机/BOM 信息（API-AM2） |
| mom-assembly-material-check | `assemblyMaterialCheck_getMaterialInfo` | function | 查询物料信息（API-AM3） |
| mom-assembly-material-check | `assemblyMaterialCheck_saveCheckResult` | function | 保存单条检查结果（API-AM4） |

### 1.4 公共能力

**扫码**（两个页面共用）：Portal 父窗口提供 `window.parent.OpenCamera(callback)`，回调返回 `{ data: "扫码结果字符串" }`（兼容 `{ value: "..." }` 或纯字符串）。

**图片上传要求**（两个页面一致）：前端压缩为 **JPEG、≤3000×3000px、quality 0.8** 的 Base64。生产实现需解码后上传 CDN/OSS，返回可访问 URL。

### 1.5 Mock（本地开发）

`mom-packing/mock.js` 与 `mom-nameplate-photo-upload/mock.js` 承载全部 Mock 数据与 API 兜底，**生产不部署该文件**（Portal 只取每页 index.html / index.js / index.css），无需任何清理动作。

---

## 二、mom-packing（装箱作业）

### API-P1：装箱单号搜索

```js
window.searchByPackingList({ packingListNo }, callback)
```

**入参**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `packingListNo` | string | 是 | 装箱单号（手动输入或扫码） |

**出参** `data`：待装箱对象数组，元素字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `ID` | string | 装箱对象唯一标识（后续 API 回传） |
| `batchCode` | string | 批次编码 |
| `batchDescription` | string | 批次描述 |
| `packingListNo` | string | 装箱单号 |
| `boxNo` | string | 箱号 |
| `containerNum` | number | 箱数 |
| `materialCode` | string | 物料编码 |
| `materialName` | string | 物料名称 |
| `totalQty` | number | 总数 |
| `pendingQty` | number | 待装箱数 |
| `packedQty` | number | 已装箱数 |

### API-P2：物料编码搜索

```js
window.searchByMaterialCode({ packingListNo, materialCode }, callback)
```

**入参**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `packingListNo` | string | 是 | 装箱单号（API-P1 已搜索） |
| `materialCode` | string | 是 | 物料编码（手动输入或扫码） |

**出参**：同 API-P1（同一结构的待装箱对象数组）。

### API-P3：图片上传

```js
window.uploadPackingImage({ id, base64 }, callback)
```

**入参**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | 是 | 装箱对象 ID（来自 API-P1/P2 结果） |
| `base64` | string | 是 | 压缩后的 JPEG base64（含 `data:image/jpeg;base64,` 前缀） |

**出参** `data.url`（string）：图片 CDN/OSS 访问 URL（用于缩略图展示 + API-P4 提交）。

### API-P4：装箱提交

```js
window.submitPacking({
  ID, batchCode, batchDescription, packingListNo, boxNo, containerNum,
  materialCode, materialName, totalQty, pendingQty, packedQty,
  packingQty, photos, operator
}, callback)
```

**入参**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `ID` | string | 是 | 装箱对象 ID |
| `batchCode` ~ `packedQty`（10 字段） | string/number | 是 | 与 API-P1/P2 返回一致的卡片数据 |
| `packingQty` | number | 是 | 本次装箱数量（支持浮点数） |
| `photos` | string[] | 是 | 照片 URL 数组（API-P3 逐张上传后收集） |
| `operator` | string | 是 | `window.Operator` |

**出参**：仅 `code`、`msg`，无 `data`。

---

## 三、mom-nameplate-photo-upload（照片上传）

### API-N1：获取工位列表

```js
window.getStationList(callback)
```

**入参**：无。

**出参** `data`：工位数组

| 字段 | 类型 | 说明 |
|---|---|---|
| `stationCode` | string | 工位编码 |
| `stationName` | string | 工位名称 |

### API-N2：获取照片类型配置 + 订单信息

```js
window.getPhotoConfig({ stationCode, orderNo }, callback)
```

**入参**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `stationCode` | string | 是 | 工位编码 |
| `orderNo` | string | 是 | 订单号 |

**出参** `data`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `photoTypes` | array | 该工位照片类型配置 |
| `orderInfo` | object | 订单信息（主机编码/VIN/铭牌模板） |

**photoTypes 每项**

| 字段 | 类型 | 说明 |
|---|---|---|
| `typeCode` | string | 照片类型编码（上传时回传） |
| `typeName` | string | 照片类型显示名称 |
| `minCount` | number | 最少拍摄数量（达到后方可提交） |
| `maxCount` | number | 最多拍摄数量（达到后不可再拍） |

**orderInfo**

| 字段 | 类型 | 说明 |
|---|---|---|
| `machineCode` | string | 主机编码 |
| `vin` | string | 车辆识别码（可为空字符串） |
| `templates` | array | 铭牌模板列表（可为空数组 `[]`） |

**templates 每项**

| 字段 | 类型 | 说明 |
|---|---|---|
| `templateId` | string | 模板 ID（选中后提交回传） |
| `templateName` | string | 模板名称 |
| `templateImageUrl` | string | 模板参考图片 URL |

> 模板规则：仅 1 个时页面自动选中；多个时由用户选择，选中后回传 `templateId`。

### API-N3：照片上传

```js
window.uploadPhoto({ base64, photoType, stationCode, orderNo }, callback)
```

**入参**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `base64` | string | 是 | 压缩后的 JPEG base64（含前缀） |
| `photoType` | string | 是 | 照片类型编码（API-N2 的 typeCode） |
| `stationCode` | string | 是 | 工位编码 |
| `orderNo` | string | 是 | 订单号 |

**出参** `data.url`（string）：照片 CDN/OSS 访问 URL。

### API-N4：照片记录提交/保存

```js
window.submitPhotoRecord({
  stationCode, orderNo, operator, machineCode, vin,
  templateId, templateImageUrl, saveType, photos
}, callback)
```

**入参**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `stationCode` | string | 是 | 工位编码 |
| `orderNo` | string | 是 | 订单号 |
| `operator` | string | 是 | `window.Operator` |
| `machineCode` | string | 是 | 主机编码（API-N2 返回） |
| `vin` | string | 是 | 车辆识别码（可为空字符串） |
| `templateId` | string | 是 | 选中的模板 ID（无模板时为空字符串） |
| `templateImageUrl` | string | 是 | 选中的模板图片 URL（无模板时为空字符串） |
| `saveType` | string | 是 | 操作类型：`"submit"` / `"save"` |
| `photos` | array | 是 | 照片列表，按类型分组 |

**photos 每项**

| 字段 | 类型 | 说明 |
|---|---|---|
| `photoType` | string | 照片类型编码 |
| `urlList` | string[] | 该类型所有照片 URL，按拍摄顺序 |

**出参**：仅 `code`、`msg`，无 `data`。

**saveType 语义**

| 值 | 业务含义 | 后台处理 |
|---|---|---|
| `"submit"` | 提交AI检测 | 触发铭牌 AI 检测流程 |
| `"save"` | 保存工位照片信息 | 仅持久化记录，不触发检测 |

---

## 四、mom-assembly-material-check（装配物料检查）

> 页面为「工位选择 + 物料检查」双视图，代码以 html/js/css 三段粘贴进 Portal 表单页。
> 表单回车提交刷新由 Portal 内置 `Portal_OnDocumentKeyDown` 拦截，页面初始化时调用一次即可（见 agent.md §8.9）。

### 业务约定

- **物料二维码格式**：`物料编码|供应商|序列号:数量`；物料编码 = 按 `|` 分割后的第一段
- 检查结果仅展示**当前订单会话**（订单查询/检查完成后清空），页面不加载历史记录
- 连续扫码：检查结果保存成功后清空物料二维码输入框并保持聚焦
- 检查结果判定：物料编码在订单 BOM 清单中 → `pass`（绿色行）；不在 → 提示并记为 `fail`（红色行），仍保存

### API-AM1：获取工位列表

```js
window.assemblyMaterialCheck_getWorkStationList(callback)
```

**入参**：无。

**出参** `data`：工位数组，元素字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `workStation` | string | 工位编码 |
| `workStationDesc` | string | 工位名称 |

### API-AM2：查询订单信息

```js
window.assemblyMaterialCheck_getWipOrderNoInfo({ serachKey }, callback)
```

**入参**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `serachKey` | string | 是 | 订单号或 VIN（手动输入或扫码） |

> 字段名 `serachKey` 按业务提供方原文保留（疑似 `searchKey` 拼写，待 Portal 侧确认后统一）。

**出参** `data`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `wipOrderNo` | string | 订单号 |
| `vin` | string | VIN |
| `wipPlanStartTime` | string | 计划上线时间 |
| `monthSequence` | string | 月顺序号 |
| `hostCode` | string | 主机编码 |
| `hostDesc` | string | 主机描述 |
| `hostAlias` | string | 主机简称 |
| `bom` | array | 物料 BOM 清单 |

**bom 每项**

| 字段 | 类型 | 说明 |
|---|---|---|
| `material` | string | 物料编码 |
| `materialDesc` | string | 物料描述 |

### API-AM3：查询物料信息

```js
window.assemblyMaterialCheck_getMaterialInfo({ material }, callback)
```

**入参**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `material` | string | 是 | 物料编码（二维码第一段） |

**出参** `data`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `material` | string | 物料编码 |
| `materialDesc` | string | 物料描述（未知物料可为空字符串） |

### API-AM4：保存检查结果

```js
window.assemblyMaterialCheck_saveCheckResult({
  wipOrderNo, vin, workStation, qrCode, material, checkResult
}, callback)
```

**入参**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `wipOrderNo` | string | 是 | 订单号（API-AM2 返回） |
| `vin` | string | 是 | VIN（API-AM2 返回） |
| `workStation` | string | 是 | 工位编码（工位选择页带入） |
| `qrCode` | string | 是 | 物料二维码原文（`物料编码\|供应商\|序列号:数量`） |
| `material` | string | 是 | 物料编码（二维码第一段） |
| `checkResult` | string | 是 | `"pass"`（在 BOM 内）/ `"fail"`（不在 BOM 内） |

**出参**：仅 `code`、`msg`，`data` 为 `null`。
