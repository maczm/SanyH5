# mom-nameplate-photo-upload（铭牌照片上传）API 协议

> 本文件只放接口协议（函数签名 + 入参/出参字段）；**平台约束与公共约定见 `../AGENT.md` §8、§12**。

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
| `templateId` | string | 模板 ID（选中后保存回传） |
| `templateName` | string | 模板名称 |
| `templateImageUrl` | string | 模板参考图片 URL |

**templates 数量对应的页面行为**

| `templates.length` | 页面行为 |
|---|---|
| `0` | 订单信息区提示「未查到铭牌模板」，**不卡控保存**（`templateId` 回传空字符串） |
| `1` | 自动选中该模板，不弹窗 |
| `>1` | 查询后**自动弹出选择弹窗**：点「取消」不关闭并提示，未选择时保存按钮置灰拦截（点击提示「请先选择铭牌模板」）；重新查询会清空上一次选择并重新弹窗 |

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

## API-N4：照片记录保存

```js
window.submitPhotoRecord({
  stationCode, orderNo, operator, machineCode, vin,
  templateId, templateImageUrl, saveType, toKeyPart, photos
}, callback)
```

**入参**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `stationCode` | string | 是 | 工位编码 |
| `orderNo` | string | 是 | 订单号 |
| `operator` | string | 是 | `window.Operator` |
| `machineCode` | string | 是 | 主机编码（API-N2 返回，可为空字符串） |
| `vin` | string | 是 | 车辆识别码（可为空字符串） |
| `templateId` | string | 是 | 选中的模板 ID（无模板/未选时为空字符串） |
| `templateImageUrl` | string | 是 | 选中的模板图片 URL（无模板/未选时为空字符串） |
| `saveType` | string | 是 | 固定为 `"save"`（页面只做保存，不再提交 AI 检测） |
| `toKeyPart` | boolean | 是 | 是否由关重件页面进入（即按钮文案「保存并返回」场景） |
| `photos` | array | 是 | 照片列表，按类型分组 |

**photos 每项**

| 字段 | 类型 | 说明 |
|---|---|---|
| `photoType` | string | 照片类型编码 |
| `urlList` | string[] | 该类型所有照片 URL，按拍摄顺序 |

**出参**：仅 `code`、`msg`，无 `data`。

**saveType 取值语义**

| 值 | 业务含义 | 后台处理 | 页面侧校验 |
|---|---|---|---|
| `"save"` | 保存工位照片信息 | 仅持久化记录，不触发检测 | 至少 1 张照片即可（允许未达 `minCount`，草稿保存） |

> 页面不再提交 AI 检测：原 `"submit"`（触发铭牌 AI 检测流程）入口与分支已删除。

## 页面配置与入口（Portal 注入属性）

```js
window.fromKeyPart            // 入口标识：值为 "KeyPart" 表示由关重件页面进入
window.KeyPartStationCode     // 由关重件页面带入的工位编码（可选，用于预填并自动查询）
window.KeyPartOrderNo         // 由关重件页面带入的订单号（可选，用于预填并自动查询）
```

| 属性 | 类型 | 说明 |
|---|---|---|
| `fromKeyPart` | string | 等于 `"KeyPart"` 时：底部按钮文案为「保存并返回」（否则为「保存」）；保存成功后页面调用下方的返回方法交回关重件页面 |
| `KeyPartStationCode` | string | 与 `fromKeyPart` 配套带入；存在时页面预填工位并在工位列表返回后自动匹配 |
| `KeyPartOrderNo` | string | 与 `fromKeyPart` 配套带入；与工位同时存在时页面自动发起一次照片配置查询 |

> 两属性缺省/为空时页面不预填，按正常手工查询流程使用；本地开发由 `mock.js` 提供兜底值。

## API-N5：返回关重件页面（页面调用，Portal 实现）

```js
window.KeyComponentChange_ReturnFromPhotoUpload()
window.KeyComponentChange_ReturnFromPhotoUpload   // 必须是函数；页面用 typeof 检测
```

**调用时机**：`window.fromKeyPart === "KeyPart"` 且保存接口（API-N4）返回 `code: 0` 之后，页面延迟 600ms（先让「保存成功」提示渲染出来）调用一次，**无入参、不接收返回值/回调**。

**页面侧行为**：

| 情况 | 行为 |
|---|---|
| 已注入该函数 | 保存成功后调用一次，由 Portal 执行返回导航（关页 / 回上一页等自行决定） |
| 未注入（本地开发） | 静默跳过，不报错；`mock.js` 提供空实现便于本地联调（生产不部署） |

> 页面不自行做任何导航（不调用 `history.back()`、不操作 `window.parent`）；返回方式完全由 Portal 在该函数内决定。
