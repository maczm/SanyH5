# SanyH5 API 接口对接文档（合并版）

> 由 `mom-packing/API接口对接文档.md` 与 `mom-nameplate-photo-upload/API接口对接文档.md` 合并而来（原文件已归档至 git 历史）。
> 本文件是 Portal 侧对接的唯一依据；页面代码与本文不一致时以本文为准并同步修正代码。

---

## 一、总览

### 1.1 运行环境

所有 H5 页面嵌入 Apriso MES Portal 的 iframe 中运行。Portal 在**加载 iframe 之前**向 `window` 注入全局函数，页面通过 `typeof window.xxx != 'function'` 检测：已注入则使用真实函数，未注入则启用本地 Mock（`#MOCK-START` ~ `#MOCK-END` 区块），便于本地开发调试。

### 1.2 公共约定（全部 API 一致）

- 回调格式：`callback({ code: number, msg: string, data?: any })`
- `code: 0` = 成功；非 `0` = 失败；`msg` 失败时为错误描述（页面直接展示给用户）

### 1.3 Portal 注入属性总表

| 页面 | window 属性 | 类型 | 说明 |
|---|---|---|---|
| 两个页面共用 | `Operator` | string | 当前操作员姓名/工号（Header 展示 + 提交回传） |
| mom-packing | `searchByPackingList` | function | 装箱单号搜索 |
| mom-packing | `searchByMaterialCode` | function | 物料编码搜索 |
| mom-packing | `uploadPackingImage` | function | 图片上传 |
| mom-packing | `submitPacking` | function | 装箱提交 |
| mom-nameplate-photo-upload | `getStationList` | function | 获取工位列表 |
| mom-nameplate-photo-upload | `getPhotoConfig` | function | 获取照片类型配置 + 订单信息 |
| mom-nameplate-photo-upload | `uploadPhoto` | function | 上传单张照片 |
| mom-nameplate-photo-upload | `submitPhotoRecord` | function | 照片记录提交/保存（`data.saveType` 区分：`submit`=提交检测 / `save`=草稿保存） |

### 1.4 扫码能力（两个页面共用）

Portal 父窗口需提供：

| 能力 | 说明 |
|---|---|
| `window.parent.OpenCamera(callback)` | 调用摄像头扫码，回调返回 `{ data: "扫码结果字符串" }`（兼容 `{ value: "..." }` 或纯字符串） |

> 注意：访问 `window.parent` 存在跨域风险，页面侧需 try/catch 兜底；桌面端无此能力时提示手动输入。

### 1.5 图片上传通用要求（两个页面一致）

前端已用 Canvas 压缩：**JPEG、≤3000×3000px、quality 0.8**。生产实现需将 Base64 解码后上传至 CDN/OSS，返回可访问 URL。

### 1.6 切换到生产模式

**方式一（推荐）**：删除各页 JS 中 `#MOCK-START` ~ `#MOCK-END` 标记之间（含标记行）的全部代码，以及仅 Mock 使用的变量/函数（见各模块"Mock 清理清单"）。Portal 注入的同名函数自动生效，业务代码零改动。

**方式二**：直接部署。Portal 注入后 `typeof` 检测为 false，Mock 不执行；仅占用文件体积，建议用方式一清理。

---

## 二、模块一：mom-packing（装箱作业）

### API-P1：装箱单号搜索

```
window.searchByPackingList({ packingListNo }, callback)
```

**入参**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `packingListNo` | string | 是 | 用户手动输入或扫码的装箱单号 |

**出参** `callback({ code, msg, data })`，`data` 为待装箱对象数组，元素 11 个字段：

| 字段 | 类型 | 说明 | 页面展现 |
|---|---|---|---|
| `ID` | string | 装箱对象唯一标识 | 不显示，用于 API-P3/API-P4 |
| `batchCode` | string | 批次编码 | 卡片字段 |
| `batchDescription` | string | 批次描述 | 卡片字段 |
| `packingListNo` | string | 装箱单号 | 卡片字段 + 回填输入框 |
| `boxNo` | string | 箱号 | 卡片字段 |
| `containerNum` | number | 箱数 | 卡片字段（用于照片数量计算） |
| `materialCode` | string | 物料编码 | 卡片字段 + 回填输入框 |
| `materialName` | string | 物料名称 | 卡片字段 |
| `totalQty` | number | 总数 | 卡片三列并排字段 |
| `pendingQty` | number | 待装箱数 | 卡片三列并排字段 + 装箱数量默认值 |
| `packedQty` | number | 已装箱数 | 卡片三列并排字段 |

**调用链**：用户输入/扫码 → 搜索 → 成功 `state.step=1` 展示结果卡片并解锁步骤 2；失败 Toast 错误提示。

### API-P2：物料编码搜索

```
window.searchByMaterialCode({ packingListNo, materialCode }, callback)
```

**入参**：

| 字段 | 类型 | 必填 | 来自 |
|---|---|---|---|
| `packingListNo` | string | 是 | API-P1 回填 |
| `materialCode` | string | 是 | 用户手动输入或扫码 |

**出参**：同 API-P1（同一结构的待装箱对象数组）。

**调用链**：搜索 → 成功 `state.step=2` 展示结果卡片；失败 Toast 错误提示。

### API-P3：图片上传

```
window.uploadPackingImage({ id, base64 }, callback)
```

**入参**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | 是 | 装箱对象 ID（来自搜索结果） |
| `base64` | string | 是 | 压缩后的 JPEG base64（含 `data:image/jpeg;base64,` 前缀） |

**出参**：`data.url`（string）= 图片访问 URL，用于缩略图展示 + API-P4 提交。

**调用链**：拍照/选图 → Canvas 压缩 → 上传中 → 成功 push 进照片列表并渲染缩略图；失败 Toast 提示且不加入列表。

### API-P4：装箱提交

```
window.submitPacking({ ID, batchCode, batchDescription, packingListNo, boxNo, containerNum,
                       materialCode, materialName, totalQty, pendingQty, packedQty,
                       packingQty, photos, operator }, callback)
```

**入参**（14 字段）：

| 字段 | 类型 | 必填 | 来自 |
|---|---|---|---|
| `ID` | string | 是 | 装箱对象 ID（用户点击的卡片） |
| `batchCode` / `batchDescription` / `packingListNo` / `boxNo` / `containerNum` / `materialCode` / `materialName` / `totalQty` / `pendingQty` / `packedQty` | string/number | 是 | 卡片数据 |
| `packingQty` | number | 是 | 用户输入的本次装箱数量（支持浮点数） |
| `photos` | string[] | 是 | 照片 URL 数组（API-P3 逐张上传后收集） |
| `operator` | string | 是 | `window.Operator` |

**出参**：仅 `code`、`msg`，无 `data`。

**调用链**：确认装箱 → 数量校验（非空、正数、≤待装箱数）→ 照片校验（至少 `ceil(packingQty × containerNum / totalQty)` 张）→ 提交 → 成功 Toast（含详情）并保留装箱单号回到物料搜索；失败 Toast 并恢复按钮。

### 附加：操作员（mom-packing）

Portal 注入 `window.Operator = "张三"`，页面显示在 Header 副标题位置。

### Mock 清理清单（mom-packing）

切换到生产时删除 `Index.js` 中：

| 删除内容 | 标记 | 说明 |
|---|---|---|
| `fuzzyMatch` 函数 | 文件顶部 | 仅 Mock 使用 |
| `mockItems` 数组 | `#MOCK-START` 后 | 4 条本地假数据 |
| Mock API 1~4 定义 | `-- Mock API N` 注释 | 对应 4 个 window 函数 |
| Mock 操作员 | `-- Mock 操作员` | `window.Operator` 默认值 |

精确范围：`#MOCK-START` 到 `#MOCK-END`（含标记行）+ `fuzzyMatch` 函数定义。

---

## 三、模块二：mom-nameplate-photo-upload（照片上传）

### API-N1：获取工位列表

```
window.getStationList(callback)
```

**入参**：无。

**出参** `data`：

```json
[
  { "stationCode": "S001", "stationName": "1号工位-外观检测" },
  { "stationCode": "S002", "stationName": "2号工位-尺寸测量" }
]
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `stationCode` | string | 工位编码 |
| `stationName` | string | 工位名称（combobox 下拉显示 + 搜索匹配） |

### API-N2：获取照片类型配置 + 订单信息

```
window.getPhotoConfig({ stationCode, orderNo }, callback)
```

**入参**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `stationCode` | string | 工位编码 |
| `orderNo` | string | 订单号 |

**出参** `data`：

```json
{
  "photoTypes": [
    { "typeCode": "appearance_front", "typeName": "正面外观", "minCount": 2, "maxCount": 5 }
  ],
  "orderInfo": {
    "machineCode": "MC-2024-A001",
    "vin": "LSVAU2A00N2100001",
    "templates": [
      { "templateId": "TPL001", "templateName": "普通铭牌", "templateImageUrl": "https://cdn.example.com/templates/a.jpg" }
    ]
  }
}
```

**photoTypes 每项**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `typeCode` | string | 照片类型编码，上传时回传 |
| `typeName` | string | 照片类型显示名称 |
| `minCount` | number | 最少拍摄数量（达到后可提交） |
| `maxCount` | number | 最多拍摄数量（达到后不可再拍） |

**orderInfo**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `machineCode` | string | 主机编码，与 VIN 同行展示 |
| `vin` | string | 车辆识别码（可为空字符串） |
| `templates` | array | 铭牌模板列表，可为空数组 `[]` |

**templates 每项**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `templateId` | string | 模板 ID（不展示，选中后提交回传） |
| `templateName` | string | 模板名称 |
| `templateImageUrl` | string | 模板参考图片 URL |

> 仅 1 个模板时自动选中；多个模板时弹窗由用户选择。选中后提交回传 `templateId`。

### API-N3：照片上传

```
window.uploadPhoto({ base64, photoType, stationCode, orderNo }, callback)
```

**入参**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `base64` | string | 压缩后的 JPEG base64（含前缀） |
| `photoType` | string | 照片类型编码（对应 API-N2 的 typeCode） |
| `stationCode` | string | 工位编码 |
| `orderNo` | string | 订单号 |

**出参** `data.url`（string）= 照片 CDN/OSS 访问 URL。

### API-N4：照片记录提交/保存（共用，saveType 区分）

```
window.submitPhotoRecord({ stationCode, orderNo, operator, machineCode, vin,
                           templateId, templateImageUrl, saveType, photos }, callback)
```

**入参**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `stationCode` | string | 工位编码 |
| `orderNo` | string | 订单号 |
| `operator` | string | 操作员姓名（`window.Operator`） |
| `machineCode` | string | 主机编码（API-N2 返回） |
| `vin` | string | 车辆识别码（可为空字符串） |
| `templateId` | string | 选中的铭牌模板 ID（无模板时为空字符串） |
| `templateImageUrl` | string | 选中的模板图片 URL（无模板时为空字符串） |
| `saveType` | string | **操作类型 flag**：`"submit"`=提交检测 / `"save"`=草稿保存 |
| `photos` | array | 照片列表，按类型分组 |

**photos 每项**：

```json
{ "photoType": "appearance_front", "urlList": ["https://cdn.example.com/1.jpg", "https://cdn.example.com/2.jpg"] }
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `photoType` | string | 照片类型编码 |
| `urlList` | string[] | 该类型所有照片 URL，按拍摄顺序 |

**出参**：仅 `code`、`msg`，无 `data`。

**saveType 两种取值的差异**：**前端交互基本一致**（同样的模板/照片齐全校验 → 成功后重置表单），仅两处不同：

| 项 | `saveType: "submit"`（提交AI检测） | `saveType: "save"`（保存工位照片信息） |
|---|---|---|
| 二次确认 | 有（"车辆所有工位铭牌是否全部上传"） | **无**（校验通过直接提交） |
| 后台逻辑 | 触发 AI 铭牌检测流程 | 仅持久化工位照片信息，不触发检测 |

### Mock 清理清单（mom-nameplate-photo-upload）

切换到生产时删除 `index.js` 中 `#MOCK-START` ~ `#MOCK-END` 区块，以及仅 Mock 使用的变量：`mockStations`、`mockPhotoConfigs`。业务代码调用的 API 函数名保持不变，Portal 注入同名函数即可无缝对接。
