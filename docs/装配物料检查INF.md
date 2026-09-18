# mom-assembly-material-check（装配物料检查）API 协议

> 本文件只放接口协议（函数签名 + 入参/出参字段）；**约束与公共约定见 `../AGENT.md` §12、§13**。

## API-AM1：获取工位列表

```js
window.assemblyMaterialCheck_getWorkStationList(callback)
```

**入参**：无。

**出参** `data`：工位数组，元素字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `workStation` | string | 工位编码 |
| `workStationDesc` | string | 工位名称 |

## API-AM2：查询订单信息

```js
window.assemblyMaterialCheck_getWipOrderNoInfo({ serachKey, workStation }, callback)
```

**入参**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `serachKey` | string | 是 | 订单号或 VIN |
| `workStation` | string | 是 | 当前检查工位编码（工位选择页带入） |

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

## API-AM3：查询物料信息

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

## API-AM4：保存检查结果

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
