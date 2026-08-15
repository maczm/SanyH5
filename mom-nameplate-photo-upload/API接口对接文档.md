# API 接口对接文档 — 照片上传 (mom-photo-upload)

---

## 运行环境

`index.html` 运行在 Portal 的 iframe 内。Portal 在加载 iframe 之前向 `window` 注入以下属性和函数：

| window 属性 | 类型 | 说明 |
|---|---|---|
| `getStationList` | function | 获取工位列表 |
| `getPhotoConfig` | function | 获取照片类型配置 |
| `uploadPhoto` | function | 上传单张照片 |
| `submitPhotoRecord` | function | 提交整笔照片记录 |
| `Operator` | string | 当前操作员姓名/工号 |

另外 Portal 父窗口需提供扫码能力：

| 能力 | 说明 |
|---|---|
| `window.parent.OpenCamera(callback)` | 调用摄像头扫码，回调返回 `{ data: "扫码结果字符串" }` |

---

## 回调约定

所有 API 函数均采用回调模式：

```js
callback({ code: number, msg: string, data?: any })
```

| 字段 | 说明 |
|---|---|
| `code` | `0` = 成功，非 `0` = 失败 |
| `msg` | 提示信息 |
| `data` | 业务数据（成功时返回） |

---

## API 1：获取工位列表

```js
window.getStationList(callback)
```

- **入参**：无
- **回调 `data`**：

```json
[
  { "stationCode": "S001", "stationName": "1号工位-外观检测" },
  { "stationCode": "S002", "stationName": "2号工位-尺寸测量" }
]
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `stationCode` | string | 工位编码 |
| `stationName` | string | 工位名称（用于 combobox 下拉显示和搜索匹配） |

---

## API 2：获取照片类型配置 + 订单信息

```js
window.getPhotoConfig({ stationCode, orderNo }, callback)
```

- **入参**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `stationCode` | string | 工位编码 |
| `orderNo` | string | 订单号 |

- **回调 `data`**：

```json
{
  "photoTypes": [
    { "typeCode": "appearance_front", "typeName": "正面外观", "minCount": 2, "maxCount": 5 },
    { "typeCode": "appearance_back",  "typeName": "背面外观", "minCount": 2, "maxCount": 5 },
    { "typeCode": "label",           "typeName": "标签照片", "minCount": 1, "maxCount": 3 }
  ],
  "orderInfo": {
    "machineCode": "MC-2024-A001",
    "vin": "LSVAU2A00N2100001",
    "templates": [
      { "templateId": "TPL001", "templateName": "普通铭牌", "templateImageUrl": "https://cdn.example.com/templates/a.jpg" },
      { "templateId": "TPL002", "templateName": "上装铭牌", "templateImageUrl": "https://cdn.example.com/templates/b.jpg" }
    ]
  }
}
```

**photoTypes 数组每项**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `typeCode` | string | 照片类型编码，上传时回传 |
| `typeName` | string | 照片类型显示名称 |
| `minCount` | number | 该类型最少拍摄数量（达到后可提交） |
| `maxCount` | number | 该类型最多拍摄数量（达到后不可再拍） |

**orderInfo**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `machineCode` | string | 主机编码，与 VIN 同行展示在订单信息卡片中 |
| `vin` | string | 车辆识别码，与主机编码同行展示（可为空字符串） |
| `templates` | array | 铭牌模板列表，可为空数组 `[]` |

**templates 数组每项**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `templateId` | string | 模板 ID（不展示在界面上，选中后提交回传） |
| `templateName` | string | 模板名称（如"普通铭牌"、"上装铭牌"） |
| `templateImageUrl` | string | 模板参考图片 URL |

> 仅 1 个模板时自动选中；多个模板时弹出选择弹窗由用户选择。选中后提交时回传 `templateId`。

---

## API 3：照片上传

```js
window.uploadPhoto({ base64, photoType, stationCode, orderNo }, callback)
```

- **入参**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `base64` | string | 压缩后的 JPEG base64 字符串（含 `data:image/jpeg;base64,` 前缀） |
| `photoType` | string | 照片类型编码（对应 API 2 返回的 typeCode） |
| `stationCode` | string | 工位编码 |
| `orderNo` | string | 订单号 |

- **回调 `data`**：

```json
{
  "url": "https://cdn.example.com/photos/xxx.jpg"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `url` | string | 照片的 CDN/OSS 访问 URL |

---

## API 4：提交照片记录

```js
window.submitPhotoRecord({
  stationCode, orderNo, operator, machineCode, vin,
  templateId, templateImageUrl, photos
}, callback)
```

- **入参**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `stationCode` | string | 工位编码 |
| `orderNo` | string | 订单号 |
| `operator` | string | 操作员姓名（来自 `window.Operator`） |
| `machineCode` | string | 主机编码（来自 API 2 返回的 orderInfo.machineCode） |
| `vin` | string | 车辆识别码（来自 API 2 返回的 orderInfo.vin，可为空字符串） |
| `templateId` | string | 用户选中的铭牌模板 ID（无模板时为空字符串） |
| `templateImageUrl` | string | 用户选中的铭牌模板图片 URL（无模板时为空字符串） |
| `photos` | array | 照片列表，按类型分组 |

`photos` 数组中每项：

```json
{ "photoType": "appearance_front", "urlList": ["https://cdn.example.com/1.jpg", "https://cdn.example.com/2.jpg"] }
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `photoType` | string | 照片类型编码 |
| `urlList` | string[] | 该类型所有照片 URL，按拍摄顺序排列 |

- **回调**：仅使用 `code` 和 `msg`，无 `data`。

---

## 切换到生产模式

**方式一（推荐）**：删除 `Index.js` 中 `#MOCK-START` 到 `#MOCK-END` 标记之间的全部代码。Portal 注入的同名函数会自动生效，其他业务代码无需修改。

**方式二**：直接部署，Portal 注入函数会覆盖 mock（`typeof window.xxx != "function"` 检测为 false，跳过 mock 定义）。Mock 代码不会执行但会占用体积，建议用方式一清理。

删除 mock 代码时，可一并删除以下仅被 mock 使用的变量：
- `mockStations`
- `mockPhotoConfigs`
- `fuzzyMatch`（如果有）

业务代码中调用的 API 函数名（`getStationList`、`getPhotoConfig`、`uploadPhoto`、`submitPhotoRecord`）保持不变，Portal 注入时使用同名函数即可无缝对接。
