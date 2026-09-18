# mom-nameplate-photo-upload（铭牌照片上传）API 协议

> 本文件只放接口协议（函数签名 + 入参/出参字段）；**约束与公共约定见 `../AGENT.md` §12、§13**。

## API-N1：获取工位列表

```js
window.getStationList(callback)
```

**入参**：无。

**出参** `data`：工位数组

| 字段 | 类型 | 说明 |
|---|---|---|
| `stationCode` | string | 工位编码 |
| `stationName` | string | 工位名称 |

## API-N2：获取照片类型配置 + 订单信息

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
| `minCount` | number | 最少拍摄数量 |
| `maxCount` | number | 最多拍摄数量 |

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

## API-N3：照片上传

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

## API-N4：照片记录提交/保存

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

**saveType 取值语义**

| 值 | 业务含义 | 后台处理 |
|---|---|---|
| `"submit"` | 提交AI检测 | 触发铭牌 AI 检测流程 |
| `"save"` | 保存工位照片信息 | 仅持久化记录，不触发检测 |
