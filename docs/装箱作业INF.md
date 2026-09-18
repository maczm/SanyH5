# mom-packing（装箱作业）API 协议

> 本文件只放接口协议（函数签名 + 入参/出参字段）；**约束与公共约定见 `../AGENT.md` §12、§13**。

## API-P1：装箱单号搜索

```js
window.searchByPackingList({ packingListNo }, callback)
```

**入参**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `packingListNo` | string | 是 | 装箱单号 |

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

## API-P2：物料编码搜索

```js
window.searchByMaterialCode({ packingListNo, materialCode }, callback)
```

**入参**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `packingListNo` | string | 是 | 装箱单号 |
| `materialCode` | string | 是 | 物料编码 |

**出参**：同 API-P1（同一结构的待装箱对象数组）。

## API-P3：图片上传

```js
window.uploadPackingImage({ id, base64 }, callback)
```

**入参**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | 是 | 装箱对象 ID（来自 API-P1/P2 结果） |
| `base64` | string | 是 | 压缩后的 JPEG base64（含 `data:image/jpeg;base64,` 前缀） |

**出参** `data.url`（string）：图片 CDN/OSS 访问 URL。

## API-P4：装箱提交

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
