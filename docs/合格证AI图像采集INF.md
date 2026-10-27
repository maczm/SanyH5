# mom-cert-ai-collect（合格证AI图像采集）完整接口文档

> 本文档是页面的唯一接口说明：数据模型、6 个接口的完整请求/响应、错误处理、端到端时序、Demo 和 Mock 控制全部在这一个文件里，不再拆成多份。
>
> **页面 Demo**：`http://127.0.0.1:8080/SanyH5/mom-cert-ai-collect/`
>
> 页面本地由 `mom-cert-ai-collect/mock.js` 驱动；生产环境不部署 mock.js，由 Portal 在 iframe 加载前向 `window` 注入同名函数。

## 1. 接口总览

| 顺序 | 接口 | 何时调用 | 说明 |
|---|---|---|---|
| 1 | `getCertificateAiCollectTask` | 查询订单、页面初始化 | 返回订单信息 + 采集项配置 + active=1 的采集记录 |
| 2 | `uploadCertificateAiCollectImage` | 选图后立即调用 | 图片 base64 上传；入参图片名称/ID/base64，出参图片 ID/URL/OSS |
| 3 | `saveCertificateAiCollectDraft` | 点击「保存并继续」 | 先保存草稿，只保存有图片的未采集子项 |
| 4 | `startCertificateAiCollectRecognition` | 草稿保存成功且图片满足张数 | 发起异步识别；可直接返回最终结果，也可只返回受理 |
| 5 | `getCertificateAiCollectStatus` | 识别接口只返回受理时 | 定时查询识别状态，作为**兜底**；默认 10 秒一次 |
| 6 | `deactivateCertificateAiCollectItem` | 点击「更新数据」 | 后台把当前采集子项 active 置 0，历史记录保留 |

调用关系：

```text
查询任务
  └─ 选图上传（base64 → 图片ID/URL/OSS）
       └─ 保存草稿
            └─ 发起识别
                 ├─ 接口直接返回最终状态/结果  → 立即更新页面
                 └─ 只返回 recognitionId/pending → 定时查询状态兜底
                      └─ 更新数据（active=0，重新采集）
```

## 2. 完整数据模型

查询接口返回的 `data` 由 `orderInfo` 和 `subcategories` 组成。`subcategories` 是**平铺数组**，页面按 `mainCategoryCode` 分组成采集项。

下面是一条**完整示例**，包含一个识别完成的子项、一个 AI 不通过的子项、一个接口异常的子项：

```json
{
  "orderInfo": {
    "orderNo": "12223213",
    "hostCode": "kev12223213",
    "vin": "LSVAA4182E2123456",
    "monthSequence": "2601-1234"
  },
  "subcategories": [
    {
      "mainCategoryCode": "Main-001",
      "mainCategoryName": "整车合格证",
      "mainCategorySort": 1,
      "subcategoryCode": "Main-Sub-001",
      "subcategoryName": "合格证正面",
      "required": true,
      "minCount": 1,
      "maxCount": 1,
      "sort": 1,
      "requirementDescription": "请拍正视图，无反光",
      "status": "success",
      "result": "pass",
      "failureType": "",
      "aiResult": "照片清晰，校验通过",
      "recognitionTime": "2026-10-27 12:19:21",
      "requestId": "f-4k2m-1-a1b2c3",
      "recognitionId": "f-4k2n-2-d4e5f6",
      "businessId": "f-4k2n-2-d4e5f6",
      "images": [
        {
          "fuid": "f-4k2m-1-img1",
          "url": "https://cdn.example.com/cert/12223213/front.jpg",
          "oss": "oss://cert-bucket/12223213/front.jpg",
          "fileName": "front.jpg",
          "size": 182734,
          "contentType": "image/jpeg",
          "width": 1600,
          "height": 1200,
          "sort": 0
        }
      ]
    },
    {
      "mainCategoryCode": "Main-001",
      "mainCategoryName": "整车合格证",
      "mainCategorySort": 1,
      "subcategoryCode": "Main-Sub-002",
      "subcategoryName": "合格证背面",
      "required": true,
      "minCount": 2,
      "maxCount": 3,
      "sort": 2,
      "requirementDescription": "需上传 2-3 张细节图",
      "status": "fail",
      "result": "fail",
      "failureType": "aiRejected",
      "aiResult": "图片模糊，无法识别",
      "recognitionTime": "2026-10-27 12:20:03",
      "requestId": "f-4k2m-1-b2c3d4",
      "recognitionId": "f-4k2o-3-g7h8i9",
      "businessId": "f-4k2o-3-g7h8i9",
      "images": [
        {
          "fuid": "f-4k2m-1-img2",
          "url": "https://cdn.example.com/cert/12223213/back-1.jpg",
          "oss": "oss://cert-bucket/12223213/back-1.jpg",
          "fileName": "back-1.jpg",
          "size": 164532,
          "contentType": "image/jpeg",
          "width": 1600,
          "height": 1200,
          "sort": 0
        },
        {
          "fuid": "f-4k2m-1-img3",
          "url": "https://cdn.example.com/cert/12223213/back-2.jpg",
          "oss": "oss://cert-bucket/12223213/back-2.jpg",
          "fileName": "back-2.jpg",
          "size": 171209,
          "contentType": "image/jpeg",
          "width": 1600,
          "height": 1200,
          "sort": 1
        }
      ]
    },
    {
      "mainCategoryCode": "Main-003",
      "mainCategoryName": "附属铭牌",
      "mainCategorySort": 3,
      "subcategoryCode": "Main-Sub-004",
      "subcategoryName": "铭牌正面",
      "required": true,
      "minCount": 1,
      "maxCount": 1,
      "sort": 1,
      "requirementDescription": "保持字迹清晰",
      "status": "fail",
      "result": null,
      "failureType": "apiError",
      "aiResult": "识别服务暂不可用，请重试",
      "recognitionTime": "2026-10-27 12:21:10",
      "requestId": "f-4k2m-1-c3d4e5",
      "recognitionId": "f-4k2p-4-j1k2l3",
      "businessId": "f-4k2p-4-j1k2l3",
      "images": [
        {
          "fuid": "f-4k2m-1-img4",
          "url": "https://cdn.example.com/cert/12223213/plate.jpg",
          "oss": "oss://cert-bucket/12223213/plate.jpg",
          "fileName": "plate.jpg",
          "size": 155901,
          "contentType": "image/jpeg",
          "width": 1600,
          "height": 1200,
          "sort": 0
        }
      ]
    }
  ]
}
```

> 图片对象不再包含 `dataUrl`：上传接口返回的 `url` 用于页面显示，`oss` 用于 AI 识别。本地 Mock 的 `url` 为 data URL，`oss` 为模拟地址；生产环境返回真实 CDN URL 和 OSS 地址。

### 2.1 字段字典

| 字段 | 类型 | 说明 |
|---|---|---|
| `orderInfo.orderNo` | string | 订单号 |
| `orderInfo.hostCode` | string | 主机编码 |
| `orderInfo.vin` | string | 车辆识别码 |
| `orderInfo.monthSequence` | string | 月顺序号 |
| `subcategories[].mainCategoryCode` | string | 采集项编码；相同编码归为一组 |
| `subcategories[].mainCategoryName` | string | 采集项名称 |
| `subcategories[].mainCategorySort` | number | 采集项排序，升序 |
| `subcategories[].subcategoryCode` | string | 采集子项编码；同一采集项内唯一 |
| `subcategories[].subcategoryName` | string | 采集子项名称 |
| `subcategories[].required` | boolean | 是否必采；`true` 时至少 1 张 |
| `subcategories[].minCount` | number | 有图时的最少张数 |
| `subcategories[].maxCount` | number | 最多张数；`0` 表示无需采集 |
| `subcategories[].sort` | number | 子项在采集项内的排序，升序 |
| `subcategories[].requirementDescription` | string | 采集要求文案 |
| `subcategories[].status` | string | 子项状态：`uncollected` / `pending` / `success` / `fail` |
| `subcategories[].result` | string \| null | 子项结果：`pass` / `fail` / `null` |
| `subcategories[].failureType` | string | 失败类型：`aiRejected` / `apiError` / `timeout` / 空 |
| `subcategories[].aiResult` | string | 最新识别结论文案 |
| `subcategories[].recognitionTime` | string | 最新识别时间 |
| `subcategories[].requestId` | string | 采集子项请求 ID；同一子项的多次保存复用 |
| `subcategories[].recognitionId` | string | 最新一次识别记录 ID |
| `subcategories[].businessId` | string | 最新一次识别请求业务 ID |
| `subcategories[].images` | array | 图片对象数组 |
| `images[].fuid` | string | 图片唯一 ID，前端生成 |
| `images[].url` | string | 图片展示 URL；页面 `<img src>` 使用 |
| `images[].oss` | string | 图片 OSS 地址；AI 识别入参使用 |
| `images[].fileName` | string | 文件名 |
| `images[].size` | number | 文件字节数 |
| `images[].contentType` | string | MIME 类型 |
| `images[].width` | number | 图片宽度 |
| `images[].height` | number | 图片高度 |
| `images[].sort` | number | 图片顺序 |

### 2.2 状态与结果语义

| status | 页面文案 | 颜色 | result | 说明 |
|---|---|---|---|---|
| `uncollected` | 未采集完成 | 蓝 | `null` | 尚未采集，或草稿已保存但未满足张数 |
| `pending` | 识别中 | 橙黄 | `null` | 已发起识别，等待结果 |
| `success` | 识别完成 | 绿 | `pass` | AI 通过 |
| `fail` + `failureType=aiRejected` | 识别失败 | 红 | `fail` | AI 返回不通过 |
| `fail` + `failureType=apiError` | 识别失败 | 红 | `null` | 接口异常，没有 AI 结论 |
| `fail` + `failureType=timeout` | 识别失败 | 红 | `null` | 识别超时，没有 AI 结论 |

采集项（主项）由页面聚合：

- 状态：任一应采集子项 `fail` → 识别失败；否则任一 `pending` → 识别中；否则全部 `success` → 识别完成；否则未采集完成。
- 结果：任一应采集子项 `result=fail` → 不通过；全部应采集子项 `result=pass` → 通过；否则 `-`。
- 订单号背景：任一采集项 `fail` → 红色；否则全部应采集项 `result=pass` → 绿色；否则蓝色。
- “应采集子项”= 必采子项 + 有图片或已发起识别的选填子项；`maxCount=0` 的无须采集项不参与聚合。

### 2.3 ID 规则

| ID | 生成方 | 作用域 | 规则 |
|---|---|---|---|
| `requestId` | 前端 fuid | 每个采集子项 | 任务加载时生成；同一子项多次保存/识别复用；更新数据后重新生成 |
| `businessId` | 前端 fuid | 每次请求 | 每次保存、识别、更新数据都新生成，互不相同 |
| `recognitionId` | 后端 | 每次识别 | 建议等于该次识别的 businessId，写入识别历史表 |
| `images[].fuid` | 前端 fuid | 每张图片 | 图片上传/保存/识别的唯一标识 |

## 3. 接口 1：查询采集任务

```js
window.getCertificateAiCollectTask({ searchKey }, callback)
```

### 请求

```json
{
  "searchKey": "12223213"
}
```

`searchKey` 可为订单号、VIN、月顺序号，页面按包含匹配。

### 成功响应

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "orderInfo": {
      "orderNo": "12223213",
      "hostCode": "kev12223213",
      "vin": "LSVAA4182E2123456",
      "monthSequence": "2601-1234"
    },
    "subcategories": [
      {
        "mainCategoryCode": "Main-001",
        "mainCategoryName": "整车合格证",
        "mainCategorySort": 1,
        "subcategoryCode": "Main-Sub-001",
        "subcategoryName": "合格证正面",
        "required": true,
        "minCount": 1,
        "maxCount": 1,
        "sort": 1,
        "requirementDescription": "请拍正视图，无反光",
        "status": "uncollected",
        "result": null,
        "failureType": "",
        "aiResult": "",
        "recognitionTime": "",
        "requestId": "",
        "recognitionId": "",
        "businessId": "",
        "images": []
      }
    ]
  }
}
```

- 后端只返回 `active=1` 的记录；`active=0` 的历史数据不要返回。
- 没有记录时，`status=uncollected`、`result=null`、`images=[]`、`requestId` 可为空，页面会自行生成。
- `subcategories` 必须包含当前订单的完整配置，不能只返回已采集项。

### 失败响应

```json
{
  "code": 1,
  "errorType": "business",
  "msg": "未查询到订单，请核对单号/VIN/月顺序号"
}
```

## 4. 接口 2：图片上传（base64）

```js
window.uploadCertificateAiCollectImage({ fuid, fileName, base64 }, callback)
```

选图压缩后立即调用，上传成功才把图片加入采集列表。

### 请求

```json
{
  "fuid": "f-4k2m-1-img1",
  "fileName": "front.jpg",
  "base64": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD..."
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `fuid` | string | 是 | 图片 ID，前端 fuid 生成 |
| `fileName` | string | 是 | 图片名称/文件名 |
| `base64` | string | 是 | 图片 base64，支持 data URL 或纯 base64 |

### 成功响应

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "fuid": "f-4k2m-1-img1",
    "url": "https://cdn.example.com/cert/12223213/front.jpg",
    "oss": "oss://cert-bucket/12223213/front.jpg"
  }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `fuid` | string | 图片 ID，回传请求中的图片 ID |
| `url` | string | 图片展示 URL；页面 `<img src>` 使用 |
| `oss` | string | 图片 OSS 地址；AI 识别入参使用 |

### 失败响应

```json
{
  "code": -2,
  "errorType": "network",
  "msg": "网络异常，图片上传失败"
}
```

```json
{
  "code": 1,
  "errorType": "business",
  "msg": "图片上传失败，请重试"
}
```

### 页面处理

- 上传中禁用拍照/保存，并暂停自动刷新。
- 上传成功后才把图片加入采集列表；失败不加入，提示重试。
- 页面显示使用 `url`，AI 识别使用 `oss`；两个字段都必须返回。
- 保存草稿/发起识别只传图片对象（`fuid`/`fileName`/`url`/`oss`），不再传 base64。
- 本地 Mock 的 `url` 直接回传图片 data URL 用于预览，`oss` 为模拟地址；生产环境返回真实 CDN URL 和 OSS 地址。

## 5. 接口 3：保存草稿

```js
window.saveCertificateAiCollectDraft(payload, callback)
```

点击「保存并继续」时先调用。**无图片的子项不传**；不满足张数的子项也要传，作为草稿保存。

### 请求

```json
{
  "orderNo": "12223213",
  "operator": "张三",
  "mainCategoryCode": "Main-001",
  "businessId": "f-4k2m-5-m1n2o3",
  "subcategories": [
    {
      "mainCategoryCode": "Main-001",
      "subcategoryCode": "Main-Sub-001",
      "requestId": "f-4k2m-1-a1b2c3",
      "images": [
        {
          "fuid": "f-4k2m-1-img1",
          "url": "https://cdn.example.com/cert/12223213/front.jpg",
          "oss": "oss://cert-bucket/12223213/front.jpg",
          "fileName": "front.jpg",
          "size": 182734,
          "contentType": "image/jpeg",
          "width": 1600,
          "height": 1200,
          "sort": 0
        }
      ],
      "status": "uncollected"
    }
  ]
}
```

### 成功响应

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "saved": 1
  }
}
```

### 并发冲突响应

```json
{
  "code": 40901,
  "errorType": "conflict",
  "msg": "采集项已被其他用户录入",
  "data": {
    "operator": "张三",
    "time": "2026-10-27 10:00:00"
  }
}
```

页面提示：`张三在2026-10-27 10:00:00已完成录入，请不要重复录入。`

### 其他失败响应

```json
{
  "code": -2,
  "errorType": "network",
  "msg": "网络异常，请检查网络"
}
```

```json
{
  "code": 1,
  "errorType": "business",
  "msg": "保存草稿失败，请重试"
}
```

### 保存规则

- 保存前图片必须已通过图片上传接口拿到 `url`/`oss`；保存/识别只传图片对象，不传 base64。
- 只保存本次有图片的未采集子项；无图片子项不保存。
- 已识别中/识别完成/识别失败的子项不重复保存。
- 保存成功后，图片满足 `minCount~maxCount` 的子项才发起识别；不满足的仅保存草稿并提示「采集未完成」。
- 同一订单 + 同一采集子项只允许一条 `active=1`，由后端事务/唯一约束保证。

## 6. 接口 4：发起异步识别

```js
window.startCertificateAiCollectRecognition(payload, callback)
```

保存草稿成功后调用。识别是异步的，但接口可能直接返回最终结果，也可能只返回受理结果。

### 请求

```json
{
  "orderNo": "12223213",
  "mainCategoryCode": "Main-001",
  "subcategoryCode": "Main-Sub-001",
  "requestId": "f-4k2m-1-a1b2c3",
  "businessId": "f-4k2m-6-p4q5r6",
  "images": [
    {
      "fuid": "f-4k2m-1-img1",
      "url": "https://cdn.example.com/cert/12223213/front.jpg",
      "oss": "oss://cert-bucket/12223213/front.jpg",
      "fileName": "front.jpg",
      "size": 182734,
      "contentType": "image/jpeg",
      "width": 1600,
      "height": 1200,
      "sort": 0
    }
  ],
  "operator": "张三"
}
```

### 响应 A：直接返回最终结果（页面立即更新）

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "recognitionId": "f-4k2m-6-p4q5r6",
    "requestId": "f-4k2m-1-a1b2c3",
    "businessId": "f-4k2m-6-p4q5r6",
    "status": "success",
    "result": "pass",
    "failureType": "",
    "aiResult": "照片清晰，校验通过",
    "recognitionTime": "2026-10-27 12:19:21",
    "subcategory": {
      "mainCategoryCode": "Main-001",
      "subcategoryCode": "Main-Sub-001",
      "requestId": "f-4k2m-1-a1b2c3",
      "businessId": "f-4k2m-6-p4q5r6",
      "status": "success",
      "result": "pass",
      "failureType": "",
      "aiResult": "照片清晰，校验通过",
      "recognitionTime": "2026-10-27 12:19:21"
    }
  }
}
```

### 响应 B：只返回受理（页面进入识别中，靠状态查询兜底）

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "recognitionId": "f-4k2m-6-p4q5r6",
    "requestId": "f-4k2m-1-a1b2c3",
    "businessId": "f-4k2m-6-p4q5r6",
    "status": "pending"
  }
}
```

### 失败响应

```json
{
  "code": -2,
  "errorType": "network",
  "msg": "网络异常，识别提交失败"
}
```

```json
{
  "code": 1,
  "errorType": "business",
  "msg": "识别服务暂不可用，请重试"
}
```

### 页面处理规则

- AI 识别使用图片对象的 `oss`；页面展示使用 `url`。
- 如果返回 `status/result/failureType/aiResult/recognitionTime`，页面**立即使用返回数据更新**，不等待定时刷新。
- 页面校验返回的 `requestId`、`businessId`、采集项/子项编码，不一致时丢弃，避免旧请求覆盖新状态。
- 如果只返回 `recognitionId` 或 `status=pending`，页面保持「识别中」，由状态查询兜底。
- 识别接口超时按 130 秒处理（后台 2 分钟超时 + 缓冲）；超时后标识别失败，后续状态查询仍可纠正。
- 识别中超过 2 分钟由**后台定时任务**改为 `fail`、`failureType=timeout`、`result=null`。

## 7. 接口 5：查询识别状态（兜底）

```js
window.getCertificateAiCollectStatus({ orderNo }, callback)
```

默认 10 秒调用一次；页面顶部显示刷新倒计时，可点击立即刷新，也可通过齿轮修改间隔。

### 请求

```json
{
  "orderNo": "12223213"
}
```

### 成功响应

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "subcategories": [
      {
        "mainCategoryCode": "Main-001",
        "subcategoryCode": "Main-Sub-001",
        "requestId": "f-4k2m-1-a1b2c3",
        "status": "success",
        "result": "pass",
        "failureType": "",
        "aiResult": "照片清晰，校验通过",
        "recognitionTime": "2026-10-27 12:19:21"
      },
      {
        "mainCategoryCode": "Main-001",
        "subcategoryCode": "Main-Sub-002",
        "requestId": "f-4k2m-1-b2c3d4",
        "status": "fail",
        "result": null,
        "failureType": "apiError",
        "aiResult": "识别服务暂不可用，请重试",
        "recognitionTime": "2026-10-27 12:20:10"
      }
    ]
  }
}
```

### 失败响应

```json
{
  "code": -2,
  "errorType": "network",
  "msg": "网络异常，刷新失败"
}
```

- 状态查询只返回状态/结果，**不返回图片**，避免定时刷新覆盖本地未保存图片。
- 状态查询返回 `uncollected` 时，页面不会覆盖本地已经产生的识别中/完成/失败状态。
- 页面在保存、上传、弹窗打开、存在未保存图片时暂停刷新。
- 网络失败时刷新胶囊变为「网络异常·重试」，不重复弹 Toast；点击可重试。

## 8. 接口 6：更新数据（停用当前记录）

```js
window.deactivateCertificateAiCollectItem(payload, callback)
```

识别完成/识别失败时可点击「更新数据」。后台把当前采集子项的 `active` 置 0，历史识别记录保留，不物理删除。

### 请求

```json
{
  "orderNo": "12223213",
  "mainCategoryCode": "Main-001",
  "subcategoryCode": "Main-Sub-001",
  "requestId": "f-4k2m-1-a1b2c3",
  "businessId": "f-4k2m-9-s7t8u9",
  "operator": "张三"
}
```

### 成功响应

```json
{
  "code": 0,
  "msg": "success"
}
```

### 失败响应

```json
{
  "code": -2,
  "errorType": "network",
  "msg": "网络异常，更新数据失败"
}
```

页面成功后清空该项图片、状态回 `uncollected`、结果清空，并生成新的 `requestId` 供下一次采集使用。

## 9. 端到端时序（Demo 流程）

```text
① 查询任务
   getCertificateAiCollectTask({ searchKey: "12223213" })
   → 订单信息 + 子项配置 + active=1 记录

② 上传图片
   前端压缩图片 → 生成 images[].fuid
   uploadCertificateAiCollectImage({ fuid, fileName, base64 })
   → { fuid, url, oss }；页面显示 url，AI 识别使用 oss
   每个子项生成/复用 requestId

③ 点击保存并继续
   saveCertificateAiCollectDraft({
     orderNo, operator, mainCategoryCode, businessId,
     subcategories: [有图片的未采集子项]
   })
   → 成功：code=0
   → 冲突：code=40901 + 操作员/时间 → 弹窗提示

④ 满足张数的子项发起识别
   startCertificateAiCollectRecognition({
     orderNo, mainCategoryCode, subcategoryCode,
     requestId, businessId, images, operator
   })
   → 返回 status/result：立即更新
   → 只返回 recognitionId/pending：保持识别中，定时查询兜底

⑤ 状态查询兜底
   getCertificateAiCollectStatus({ orderNo })
   → 更新状态/结果/失败类型/识别时间

⑥ 更新数据
   deactivateCertificateAiCollectItem({
     orderNo, mainCategoryCode, subcategoryCode,
     requestId, businessId, operator
   })
   → active=0，页面清空图片，重新采集
```

### 保存并继续的页面行为

- 有图片但张数不够：保存草稿 → 提示「采集未完成」→ 跳下一项。
- 没有图片：不保存 → 提示「采集未完成」→ 跳下一项。
- 图片满足张数：保存草稿 → 发起识别 → 跳下一项；最后一个采集项保存后自动进入采集列表。
- 已识别中/识别完成/识别失败的子项：保存时跳过，不重复保存/识别；失败可点「源数据重新识别」，完成/失败可点「更新数据」。
- 整页没有可保存的新数据：提示「无可保存的新数据」并继续下一项。

## 10. 页面 Demo

**地址**：`http://127.0.0.1:8080/SanyH5/mom-cert-ai-collect/`

### 10.1 UI 演示步骤

1. 打开页面，默认订单 `12223213` 自动查询。
2. 在「合格证正面」拍 1 张，在「合格证背面」拍 2 张；选图后先 base64 上传，预览使用返回的 `url`。
3. 点「保存并继续」：
   - 草稿保存成功
   - 两个子项发起识别
   - 默认 Mock 返回最终结果，页面立即更新状态/结果
4. 如果只拍 1 张背面再保存：
   - 草稿保存
   - 提示「采集未完成」
   - 自动跳到下一项
   - 返回后图片仍在，可继续补齐
5. 识别失败时：
   - 「源数据重新识别」重新发起
   - 「更新数据」清空图片重新采集
6. 刷新胶囊：
   - 左侧显示倒计时，点击立即刷新
   - 齿轮可修改 3-600 秒刷新间隔
   - 识别失败/网络异常时显示不同文案

### 10.2 控制台接口 Demo

在 Demo 页面打开浏览器控制台，直接执行：

```js
(async function () {
  function call(fn, args) {
    return new Promise(function (resolve) {
      fn.apply(null, (args || []).concat([resolve]));
    });
  }

  // 1. 查询
  var task = await call(window.getCertificateAiCollectTask, [{ searchKey: "12223213" }]);
  console.log("1 查询 " + JSON.stringify(task));

  var order = task.data.orderInfo;
  var sub = task.data.subcategories[0];
  var requestId = sub.requestId || "req-" + Date.now();

  // 2. base64 上传图片
  var upload = await call(window.uploadCertificateAiCollectImage, [{
    fuid: "img-" + Date.now(),
    fileName: "demo.png",
    base64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
  }]);
  console.log("2 上传图片 " + JSON.stringify(upload));

  var image = {
    fuid: upload.data.fuid,
    fileName: "demo.png",
    url: upload.data.url,
    oss: upload.data.oss,
    size: 68,
    contentType: "image/png",
    width: 1,
    height: 1,
    sort: 0
  };

  // 3. 保存草稿（保存第一个子项）
  var draft = await call(window.saveCertificateAiCollectDraft, [{
    orderNo: order.orderNo,
    operator: window.Operator || "demo",
    mainCategoryCode: sub.mainCategoryCode,
    businessId: "biz-" + Date.now(),
    subcategories: [{
      mainCategoryCode: sub.mainCategoryCode,
      subcategoryCode: sub.subcategoryCode,
      requestId: requestId,
      images: [image],
      status: "uncollected"
    }]
  }]);
  console.log("3 保存草稿 " + JSON.stringify(draft));

  // 4. 发起识别（默认 Mock 直接返回最终结果）
  var recognition = await call(window.startCertificateAiCollectRecognition, [{
    orderNo: order.orderNo,
    mainCategoryCode: sub.mainCategoryCode,
    subcategoryCode: sub.subcategoryCode,
    requestId: requestId,
    businessId: "rec-" + Date.now(),
    images: [image],
    operator: window.Operator || "demo"
  }]);
  console.log("4 发起识别 " + JSON.stringify(recognition));

  // 5. 状态查询（兜底）
  var status = await call(window.getCertificateAiCollectStatus, [{ orderNo: order.orderNo }]);
  console.log("5 状态查询 " + JSON.stringify(status));

  // 6. 更新数据
  var deactivate = await call(window.deactivateCertificateAiCollectItem, [{
    orderNo: order.orderNo,
    mainCategoryCode: sub.mainCategoryCode,
    subcategoryCode: sub.subcategoryCode,
    requestId: requestId,
    businessId: "upd-" + Date.now(),
    operator: window.Operator || "demo"
  }]);
  console.log("6 更新数据 " + JSON.stringify(deactivate));
})();
```

### 10.3 Mock 控制

```js
// 通过率，默认 0.5（50%）
window.CertificateAiCollectMock.successRate = 0.3;

// 固定结果：pass / fail / error / timeout；空字符串表示随机
window.CertificateAiCollectMock.forceOutcome = "fail";

// 识别返回模式：
// result  = 接口直接返回最终状态/结果（默认）
// pending = 只返回受理，最终结果靠状态查询兜底
window.CertificateAiCollectMock.recognitionReturnMode = "pending";

// 并发冲突模拟
window.CertificateAiCollectMock.forceConflict = true;
window.CertificateAiCollectMock.conflictOperator = "李四";
window.CertificateAiCollectMock.conflictTime = "2026-10-27 11:30:00";

// 网络/业务错误模拟
window.CertificateAiCollectMock.forceUploadError = "network"; // network / business / ""
window.CertificateAiCollectMock.forceStatusError = "network"; // network / business / ""
window.CertificateAiCollectMock.forceStartError = "network";
window.CertificateAiCollectMock.forceSaveError = "network";
```

### 10.4 接口日志

所有接口统一经过页面 `apiCall`，请求/响应会以 **JSON 字符串**打印到控制台，不打印对象引用：

```text
[CertificateAiCollect][getCertificateAiCollectTask request] {"searchKey":"12223213"}
[CertificateAiCollect][getCertificateAiCollectTask response] {"code":0,"msg":"success",...}
[CertificateAiCollect][uploadCertificateAiCollectImage request] {"fuid":"...","fileName":"...","base64":"..."}
[CertificateAiCollect][uploadCertificateAiCollectImage response] {"code":0,"data":{"fuid":"...","url":"...","oss":"..."}}
```

请求、响应、超时、网络异常、接口未接入都会打印；label 格式为 `接口名 request` / `接口名 response`。

## 11. 错误约定与重试

| `errorType` | 典型场景 | 页面行为 |
|---|---|---|
| `network` | 断网、请求异常 | 保留本地数据，提示网络异常，允许重试 |
| `timeout` | 请求超时 | 提示超时，允许重试 |
| `business` | 业务校验失败 | 直接展示后端 `msg` |
| `conflict` | 并发保存冲突 | 弹窗展示 `XX在xx时间已完成录入，请不要重复录入。`，可刷新最新数据 |
| `config` | 接口未注入 | 提示接口未接入 |

网络失败不自动清空当前数据；轮询失败时刷新胶囊变为「网络异常·重试」，不重复弹 Toast。

## 12. 对接约定

- `active=1`、并发唯一约束、2 分钟识别超时全部由后台处理，前端不管理 active。
- 查询只返回 `active=1`；更新数据由后台逻辑删除（active=0），历史识别记录保留。
- `requestId` 每个采集子项一个，多次保存/识别复用；`businessId` 每次请求新生成；图片 `fuid` 每张一个。
- 前端 fuid 生成器在 `mom-cert-ai-collect/index.js` 的 `createFuid()`。
- 图片统一对象数组；选图后先用 base64 调图片上传接口，保存/识别只传 `fuid`/`fileName`/`url`/`oss`，不再传 base64。
- 页面展示使用 `url`，AI 识别使用 `oss`，两个字段都必须返回。
- 识别结果优先使用接口返回数据，定时状态查询只做兜底。
- 6 个接口函数由 Portal 注入，本地由 mock.js 提供。
- Portal 注入属性：`window.CertificateAiCollectOrderNo`、`window.Operator`、`window.parent.OpenCamera`。
