# mom-key-component-change（关重件更换）API 协议

> 本文件只放接口协议（函数签名 + 入参/出参字段）；**平台约束与公共约定见 `../AGENT.md` §8、§12**。

## 查询订单信息

```js
window.KeyComponentChange_GetWipOrderNoInfo(
  { taskType: "GetWipOrderNoInfo", reported: { wipOrderNo, vin } }, callback)
```

**入参** `reported`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `wipOrderNo` | string | 与 `vin` 二选一 | 订单号 |
| `vin` | string | 与 `wipOrderNo` 二选一 | VIN |

**出参** `data`

| 字段 | 类型 | 说明 |
|---|---|---|
| `wipOrderNo` | string | 订单号 |
| `wipOrderType` | number | 订单类型：1=生产订单，2=改制订单 |
| `productID` | number | 订单物料 ID |
| `productNo` | string | 订单物料编码 |
| `productDesc` | string | 订单物料描述 |
| `serialNo` | string | 订单序列号 |

## 查询关重件信息

```js
window.KeyComponentChange_GetKeyComponentInfo(
  { taskType: "GetKeyComponentInfo", reported: { wipOrderNo, wipOrderType } }, callback)
```

**入参** `reported`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `wipOrderNo` | string | 是 | 订单号（查询订单信息 返回） |
| `wipOrderType` | number | 是 | 订单类型（查询订单信息 返回） |

**出参** `data`

| 字段 | 类型 | 说明 |
|---|---|---|
| `removeQty` | number | 已解绑数量 |
| `needRemoveQty` | number | 需解绑总数 |
| `keyComponentList` | array | 关重件配置清单 |
| `snList` | array | 已采集序列号清单（与 `keyComponentList` 同级，不嵌套在关重件条目内） |

**keyComponentList 每项**

| 字段 | 类型 | 说明 |
|---|---|---|
| `materialID` | number | 关重件物料 ID（`snList` 按此字段归属） |
| `materialNo` | string | 关重件物料编码 |
| `materialDesc` | string | 关重件物料描述 |
| `materialQty` | number | 关重件物料数量（该物料需采集总数） |
| `uomCode` | string | 单位 |
| `materialType` | string | 关重件类型 |
| `materialSeq` | string | 关重件序号（配置值，**字符串**：`"1"`=前电机，`"2"`=后电机，null=不显示类型描述） |

**snList 每项**

| 字段 | 类型 | 说明 |
|---|---|---|
| `serialNo` | string | 关重件序列号 |
| `materialID` | number | 关重件物料 ID（归属到同 ID 的配置条目） |
| `materialSeq` | string | 关重件序号（采集值，**字符串**：`"1"`=前电机，`"2"`=后电机，null=不显示类型描述） |
| `scanTime` | string | 扫描时间 |

## 校验并保存扫描件

```js
window.KeyComponentChange_CheckAndSave(
  { taskType: "CheckAndSave", reported: { wipOrderNo, wipOrderType, productID, productNo, productDesc,
    serialNo, materialID, materialNo, materialDesc, materialSeq, materialSerialNo, materialQty,
    uomCode, partner, inputType, inputCode } }, callback)
```

**入参** `reported`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `wipOrderNo` | string | 是 | 订单号（查询订单信息 返回） |
| `wipOrderType` | number | 是 | 订单类型（查询订单信息 返回） |
| `productID` | number | 是 | 订单物料 ID（查询订单信息 返回） |
| `productNo` | string | 是 | 订单物料编码（查询订单信息 返回） |
| `productDesc` | string | 是 | 订单物料描述（查询订单信息 返回） |
| `serialNo` | string | 是 | 订单序列号（查询订单信息 返回） |
| `materialID` | number | 是 | 关重件物料 ID（查询关重件信息 配置条目） |
| `materialNo` | string | 是 | 关重件物料编码（二维码第一段） |
| `materialDesc` | string | 是 | 关重件物料描述（查询关重件信息 配置条目） |
| `materialSeq` | string | 是 | 关重件序号（**字符串**：`"1"`=前电机，`"2"`=后电机，`""`=其它；配置值为 `null`/`undefined` 时上报 `""`） |
| `materialSerialNo` | string | 是 | 关重件序列号（二维码第三段） |
| `materialQty` | number | 是 | 关重件数量（二维码第三段） |
| `uomCode` | string | 是 | 单位（查询关重件信息 配置条目） |
| `partner` | string | 是 | 供应商（二维码第二段） |
| `inputType` | number | 是 | 输入方式：`0`=手输，`1`=扫码 |
| `inputCode` | number | 是 | 输入键位：回车 `13`，鼠标左键点击 `1` |

**出参** `data`

| 字段 | 类型 | 说明 |
|---|---|---|
| `isChange` | string | `"1"` = 走更换流程（页面跳视图3，本次不保存）；其它值 = 后台已保存 |

## 移除关重件

```js
window.KeyComponentChange_Remove(
  { taskType: "Remove", reported: { wipOrderNo, wipOrderType, serialNo, materialSerialNo } }, callback)
```

**入参** `reported`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `wipOrderNo` | string | 是 | 订单号 |
| `wipOrderType` | number | 是 | 订单类型 |
| `serialNo` | string | 是 | 订单序列号（查询订单信息 / 查询关重件信息 所在订单） |
| `materialSerialNo` | string | 是 | 被移除的关重件序列号 |

**出参** `data`

| 字段 | 类型 | 说明 |
|---|---|---|
| `oldGenealogyID` | string | 被删除数据的 ID（保存新关重件 回传） |

## 查询待移除明细 / 查询待更换明细

```js
window.KeyComponentChange_GetRemoveKeyComponentInfo(
  { taskType: "GetRemoveKeyComponentInfo", reported: { wipOrderNo, wipOrderType } }, callback)
window.KeyComponentChange_GetChangeKeyComponentInfo(
  { taskType: "GetChangeKeyComponentInfo", reported: { wipOrderNo, wipOrderType, materialNo, materialSeq } }, callback)
```

**入参** `reported`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `wipOrderNo` | string | 是 | 订单号（查询订单信息 返回） |
| `wipOrderType` | number | 是 | 订单类型（查询订单信息 返回：1=生产订单，2=改制订单） |
| `materialNo` | string | 仅 查询待更换明细 | 关重件物料编码（查询待更换明细 按该物料过滤更换清单） |
| `materialSeq` | string | 否 | 关重件序号（查询待更换明细 按位置过滤旧件）：`"1"`=只回前电机旧件 / `"2"`=只回后电机旧件 / `""`=不按位置过滤；由位置弹窗人工选择或页面自动分配的结果带入 |

**出参** `data`：明细数组（两条查询结构一致）

| 字段 | 类型 | 说明 |
|---|---|---|
| `wipOrderNo` | string | 生产/改制订单号 |
| `wipOrderType` | number | 订单类型 |
| `serialNo` | string | 订单序列号 |
| `materialSerialNo` | string | 关重件旧序列号 |
| `materialNo` | string | 物料编码 |
| `scanTime` | string | 录入时间 |

## 保存新关重件（带被替换旧件 ID）

```js
window.KeyComponentChange_Save(
  { taskType: "Save", reported: { ...同「校验并保存扫描件」全部字段, oldGenealogyID } }, callback)
```

**入参** `reported`：「校验并保存扫描件」全部字段 + 下表字段。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `oldGenealogyID` | string | 是 | 被替换旧件的 ID（移除关重件 返回） |

**出参**：仅 `code`、`msg`，`data` 为 `null`。

## 查询 VIN 信息

```js
window.KeyComponentChange_GetVinInfo(
  { taskType: "GetVinInfo", reported: { wipOrderNo } }, callback)
```

**入参** `reported`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `wipOrderNo` | string | 是 | 订单号（VIN更换页 订单号输入框） |

**出参** `data`

| 字段 | 类型 | 说明 |
|---|---|---|
| `oldVin` | string | 订单当前 VIN（旧VIN，页面「旧VIN」显示值） |
| `oldFactoryCode` | string | 订单当前出厂编码（旧出厂编码，回填页面「出厂编码」输入框供修改） |

## 保存 VIN

```js
window.KeyComponentChange_SaveVin(
  { taskType: "SaveVin", reported: { wipOrderNo, oldVin, newVin, oldFactoryCode, factoryCode } }, callback)
```

**入参** `reported`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `wipOrderNo` | string | 是 | 订单号 |
| `oldVin` | string | 是 | 旧VIN（查询 VIN 信息 返回） |
| `newVin` | string | 是 | 新VIN（VIN更换页 新VIN输入框） |
| `oldFactoryCode` | string | 是 | 旧出厂编码（查询 VIN 信息 返回） |
| `factoryCode` | string | 是 | 出厂编码（VIN更换页 出厂编码输入框，本次录入的新值） |

**出参**：仅 `code`、`msg`，`data` 为 `null`。

## 页面配置（Portal 注入属性）

```js
window.KeyComponentChangeHideHeader
```

| 属性 | 类型 | 说明 |
|---|---|---|
| `KeyComponentChangeHideHeader` | boolean | `true` = 隐藏页面表头（标题栏）；`false` / 未注入 = 显示表头 |
