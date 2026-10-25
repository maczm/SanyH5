# mom-cert-ai-collect（合格证AI图像采集）API 协议

> 本文件只放接口协议（函数签名 + 入参/出参字段）；平台约束与公共约定见 `../AGENT.md` §8、§12。
> 本页当前由本地 `mock.js` 驱动，以下函数名为页面调用契约；Portal 接入时按实际注入的同名函数替换。

## 查询采集任务

```js
window.getCertificateAiCollectTask({ searchKey }, callback)
```

**入参**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `searchKey` | string | 是 | 查询关键字，可为订单号、主机编码、VIN、月顺序号；按包含匹配 |

**出参** `data`

| 字段 | 类型 | 说明 |
|---|---|---|
| `orderInfo` | object | 订单信息 |
| `subcategories` | array | 子类别采集配置（平铺，由页面按主类别分组） |

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
| `mainCategoryCode` | string | 主类别编码，相同编码归为一组 |
| `mainCategoryName` | string | 主类别名称 |
| `mainCategorySort` | number | 主类别排序值，升序 |
| `subcategoryCode` | string | 子类别编码（同一主类别内唯一） |
| `subcategoryName` | string | 子类别显示名称 |
| `required` | boolean | 是否必采；`true` 时至少 1 张 |
| `minCount` | number | 有图时的最少张数；`required=false` 且 0 张时允许 |
| `maxCount` | number | 最多张数；`0` 表示该项无需采集 |
| `sort` | number | 子类别在主类别内的排序值，升序 |
| `requirementDescription` | string | 采集要求文案，可为空字符串 |

**计数语义**

| 场景 | 页面行为 |
|---|---|
| `maxCount === 0` | 无需采集：不显示拍照入口，不参与识别与校验 |
| `required === true` | 至少 1 张；有图时仍需满足 `minCount` |
| `required === false` 且 0 张 | 选采允许 0 张 |
| 有图 | 张数需落在 `minCount ~ maxCount` 区间 |

> `required=false` 且 `minCount=1` 表示“选采，一旦上传则至少 1 张”，不是必采。

## 子类别图片识别

```js
window.recognizeCertificateAiCollectSubcategory({
  orderNo,
  mainCategoryCode,
  subcategoryCode,
  images
}, callback)
```

**入参**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `orderNo` | string | 是 | 订单号 |
| `mainCategoryCode` | string | 是 | 主类别编码 |
| `subcategoryCode` | string | 是 | 子类别编码 |
| `images` | string[] | 是 | 当前子类别的照片，前端压缩后的 JPEG Base64（含前缀），按拍摄顺序 |

**出参** `data`

| 字段 | 类型 | 说明 |
|---|---|---|
| `result` | string | `pass`（通过）或 `fail`（不通过） |
| `aiResult` | string | AI 结论文案，页面直接展示 |

`code` 为 `0` 表示识别流程完成（结果可能为 `pass` 或 `fail`）；非 `0` 表示调用失败，页面按失败态展示 `msg`。

## 页面注入属性

| 属性 | 类型 | 说明 |
|---|---|---|
| `window.CertificateAiCollectOrderNo` | string | 可选，Portal 预置订单号；存在时页面初始化自动查询 |
| `window.parent.OpenCamera(callback)` | function | 扫码；回调返回 `{ data }`、`{ value }` 或纯字符串（公共约定见 `AGENT.md` §12.4） |
