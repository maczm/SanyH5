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
| mom-key-component-change | `KeyComponentChange_GetWipOrderNoInfo` | function | 查询订单信息（API-KC1） |
| mom-key-component-change | `KeyComponentChange_GetKeyComponentInfo` | function | 查询关重件配置与已采集序列号（API-KC2） |
| mom-key-component-change | `KeyComponentChange_CheckAndSave` | function | 校验并保存扫描关重件（API-KC3） |
| mom-key-component-change | `KeyComponentChange_Remove` | function | 移除关重件（API-KC4） |
| mom-key-component-change | `KeyComponentChange_GetRemoveKeyComponentInfo` | function | 移除页待移除明细（API-KC5） |
| mom-key-component-change | `KeyComponentChange_GetChangeKeyComponentInfo` | function | 更换页待更换明细（API-KC6） |
| mom-key-component-change | `KeyComponentChange_Save` | function | 带 `oldGenealogyID` 保存新关重件（API-KC7） |

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
window.assemblyMaterialCheck_getWipOrderNoInfo({ serachKey, workStation }, callback)
```

**入参**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `serachKey` | string | 是 | 订单号或 VIN（手动输入或扫码） |
| `workStation` | string | 是 | 当前检查工位编码（工位选择页带入） |

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

---

## 五、mom-key-component-change（关重件更换）

> 单页三视图：视图1「关重件更换（主页）」+ 视图2「关重件移除页（仅改制订单）」+ 视图3「关重件更换页（`isChange = 1` 时进入）」。
> 代码以 html/js/css 三段粘贴进 Portal 表单页，回车提交由 Portal 内置 `Portal_OnDocumentKeyDown` 拦截（页面定义空实现即可，见 agent.md §8.9）。
> **本页全部接口入参统一为 `{ taskType: "<英文任务名>", reported: { ... } }`**（下文表格只列 `reported` 内字段）。

### 业务约定

- **物料二维码格式**：`物料编码|供应商|序列号:数量`；三段均不得为空，数量必须是大于 0 的数字，否则页面直接拦截、不调用 API-KC3
- **采集数量上限（满量即更换）**：同一关重件物料编码的已扫描数量达到需扫描总数（该物料 `materialQty` 求和）后，本次扫描不调用 API-KC3，页面直接进入「关重件更换页」：带该关重件物料编码查询更换清单（API-KC6），由操作员选定被替换旧件后 API-KC4 移除、API-KC7 保存新件，数量始终保持不超过需扫描总数
- **订单号 / VIN 共用一个输入框**：输入值 `^[0-9]+$` → 填 `wipOrderNo`；17 位非纯数字 → 填 `vin`；其余非纯数字 → 兜底填 `wipOrderNo`
- **关重件序号**：`keyComponentList` 的 `materialSeq` 是**配置序号**，`snList` 的 `materialSeq` 是**采集序号**，取值均为**字符串** `"1"`（前电机）/ `"2"`（后电机）/ `null`（页面不显示类型描述）。永磁体同步电机的两条配置 `materialID` 相同、无法用物料区分前后：仅当两条配置序号恰为 `"1"` 和 `"2"` 时，页面自动分配给该物料尚未采集的那个序号；序号不明确时弹窗由操作员选择前电机(`"1"`)/后电机(`"2"`)
- **订单类型标注**：`wipOrderType` 1=生产订单、2=改制订单；页面所有展示订单号的位置都带该标注
- **需解绑数量 / 解绑按钮**：仅改制订单（`wipOrderType = 2`）显示该行；`needRemoveQty > removeQty` 时才显示解绑按钮（进入视图2）
- **更换分支**：API-KC3 返回 `isChange = 1` → 本次不保存，页面进入视图3 由操作员指定被替换的旧件，移除成功后用 API-KC7 保存；`isChange` 为其它值 → 后台已直接保存，页面重新拉取 API-KC2 刷新
- **按钮开关**：本页每个按钮（搜索/扫码/解绑/完成/删除/移除/更换/返回）都有独立的显示开关与权限开关，配置见页面 `BUTTON_SWITCH`（agent.md §8.11）；权限关闭时按钮置灰禁用

### API-KC1：查询订单信息

```js
window.KeyComponentChange_GetWipOrderNoInfo(
  { taskType: "GetWipOrderNoInfo", reported: { wipOrderNo, vin } }, callback)
```

**入参** `reported`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `wipOrderNo` | string | 与 `vin` 二选一 | 订单号（输入值为纯数字时填写） |
| `vin` | string | 与 `wipOrderNo` 二选一 | VIN（输入值为 17 位非纯数字时填写） |

**出参** `data`

| 字段 | 类型 | 说明 |
|---|---|---|
| `wipOrderNo` | string | 订单号 |
| `wipOrderType` | number | 订单类型：1=生产订单，2=改制订单 |
| `productID` | number | 订单物料 ID |
| `productNo` | string | 订单物料编码 |
| `productDesc` | string | 订单物料描述 |
| `serialNo` | string | 订单序列号 |

### API-KC2：查询关重件信息

```js
window.KeyComponentChange_GetKeyComponentInfo(
  { taskType: "GetKeyComponentInfo", reported: { wipOrderNo, wipOrderType } }, callback)
```

**入参** `reported`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `wipOrderNo` | string | 是 | 订单号（API-KC1 返回） |
| `wipOrderType` | number | 是 | 订单类型（API-KC1 返回） |

**出参** `data`

| 字段 | 类型 | 说明 |
|---|---|---|
| `removeQty` | number | 已解绑数量 |
| `needRemoveQty` | number | 需解绑总数 |
| `keyComponentList` | array | 关重件配置清单 |
| `snList` | array | 已采集序列号清单（**与 `keyComponentList` 同级，不嵌套在关重件条目内**） |

**keyComponentList 每项**

| 字段 | 类型 | 说明 |
|---|---|---|
| `materialID` | number | 关重件物料 ID（`snList` 按此字段归属） |
| `materialNo` | string | 关重件物料编码（页面按此字段合并卡片） |
| `materialDesc` | string | 关重件物料描述 |
| `materialQty` | number | 关重件物料数量（该物料需采集总数） |
| `uomCode` | string | 单位 |
| `materialType` | string | 关重件类型（`永磁体同步电机` 走前后电机规则） |
| `materialSeq` | string | 关重件序号（配置值，**字符串**：`"1"`=前电机，`"2"`=后电机，null=不显示类型描述） |

**snList 每项**

| 字段 | 类型 | 说明 |
|---|---|---|
| `serialNo` | string | 关重件序列号 |
| `materialID` | number | 关重件物料 ID（归属到同 ID 的配置条目） |
| `materialSeq` | string | 关重件序号（采集值，**字符串**：`"1"`=前电机，`"2"`=后电机，null=不显示类型描述） |
| `scanTime` | string | 扫描时间 |

> 页面统计：已采集数量 = `snList.length`，需采集总数 = Σ`materialQty`；卡片右侧「已扫描/需扫描」= 该物料已采集条数 / 该物料 Σ`materialQty`。

### API-KC3：校验并保存扫描关重件

```js
window.KeyComponentChange_CheckAndSave(
  { taskType: "CheckAndSave", reported: { wipOrderNo, wipOrderType, productID, productNo, productDesc,
    serialNo, materialID, materialNo, materialDesc, materialSeq, materialSerialNo, materialQty,
    uomCode, partner, inputType, inputCode } }, callback)
```

**入参** `reported`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `wipOrderNo` | string | 是 | 订单号（API-KC1 返回） |
| `wipOrderType` | number | 是 | 订单类型（API-KC1 返回） |
| `productID` | number | 是 | 订单物料 ID（API-KC1 返回） |
| `productNo` | string | 是 | 订单物料编码（API-KC1 返回） |
| `productDesc` | string | 是 | 订单物料描述（API-KC1 返回） |
| `serialNo` | string | 是 | 订单序列号（API-KC1 返回） |
| `materialID` | number | 是 | 关重件物料 ID（API-KC2 配置条目） |
| `materialNo` | string | 是 | 关重件物料编码（二维码第一段） |
| `materialDesc` | string | 是 | 关重件物料描述（API-KC2 配置条目） |
| `materialSeq` | string | 是 | 关重件序号（**字符串**：`"1"`=前电机，`"2"`=后电机，null=不显示类型描述）；页面按字符串回传 |
| `materialSerialNo` | string | 是 | 关重件序列号（二维码第三段） |
| `materialQty` | number | 是 | 关重件数量（二维码第三段） |
| `uomCode` | string | 是 | 单位（API-KC2 配置条目） |
| `partner` | string | 是 | 供应商（二维码第二段） |
| `inputType` | string | 是 | 输入方式：`"扫码"`（摄像头扫码按钮）/ `"手输"`（键盘键入，含扫码枪键入） |
| `inputCode` | number | 是 | 输入键位：回车 `13`，鼠标左键点击 `1` |

**出参** `data`

| 字段 | 类型 | 说明 |
|---|---|---|
| `isChange` | string | `"1"` = 需走更换流程（页面跳视图3，本次不保存）；其它值 = 后台已保存 |

### API-KC4：移除关重件

```js
window.KeyComponentChange_Remove(
  { taskType: "Remove", reported: { wipOrderNo, wipOrderType, serialNo, materialSerialNo } }, callback)
```

**入参** `reported`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `wipOrderNo` | string | 是 | 订单号 |
| `wipOrderType` | number | 是 | 订单类型 |
| `serialNo` | string | 是 | 订单序列号（API-KC1/KC2 所在订单） |
| `materialSerialNo` | string | 是 | 被移除的关重件序列号 |

**出参** `data`

| 字段 | 类型 | 说明 |
|---|---|---|
| `oldGenealogyID` | string | 被删除数据的 ID（视图3 保存新件时通过 API-KC7 回传） |

### API-KC5 / API-KC6：查询待移除 / 待更换明细

```js
window.KeyComponentChange_GetRemoveKeyComponentInfo(
  { taskType: "GetRemoveKeyComponentInfo", reported: { wipOrderNo, wipOrderType } }, callback)
window.KeyComponentChange_GetChangeKeyComponentInfo(
  { taskType: "GetChangeKeyComponentInfo", reported: { wipOrderNo, wipOrderType, materialNo } }, callback)
```

**入参** `reported`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `wipOrderNo` | string | 是 | 改制订单号（API-KC1 返回） |
| `wipOrderType` | number | 是 | 订单类型（改制订单为 2） |
| `materialNo` | string | 仅 API-KC6 | 关重件物料编码（本次扫描的新件物料编码，KC6 按该物料过滤更换清单） |

**出参** `data`：**明细数组**（两条接口结构一致）

| 字段 | 类型 | 说明 |
|---|---|---|
| `wipOrderNo` | string | 生产/改制订单号（页面带订单类型标注展示） |
| `wipOrderType` | number | 订单类型 |
| `serialNo` | string | 订单序列号 |
| `materialSerialNo` | string | 关重件旧序列号 |
| `materialNo` | string | 物料编码 |
| `scanTime` | string | 录入时间 |

### API-KC7：保存新关重件（带被替换旧件 ID）

```js
window.KeyComponentChange_Save(
  { taskType: "Save", reported: { ...同 API-KC3 全部字段, oldGenealogyID } }, callback)
```

**入参** `reported`：API-KC3 全部字段 + 下表字段。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `oldGenealogyID` | string | 是 | 被替换旧件的 ID（API-KC4 返回） |

**出参**：仅 `code`、`msg`，`data` 为 `null`。
