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
| `orderList` | array | 订单集合；**订单号与 VIN 搜索都先按 VIN 归组，返回该 VIN 下的所有订单（生产 + 改制，改制在前）**；前端按集合逐单查询关重件信息 |

**orderList 每项**

| 字段 | 类型 | 说明 |
|---|---|---|
| `wipOrderNo` | string | 订单号 |
| `wipOrderType` | number | 订单类型：1=生产订单，2=改制订单 |
| `productID` | number | 订单物料 ID（采集报文用） |
| `productNo` | string | 订单物料编码（采集报文用） |
| `productDesc` | string | 订单物料描述（采集报文用） |
| `vin` | string | 订单 VIN（订单序列号即 VIN；VIN 查询按该字段匹配） |

> 不再返回单条顶层字段；前端对旧结构兼容（无 `orderList` 时包成单元素数组）。

**请求/响应示例**

```jsonc
// 订单号搜索（先查 VIN，再返回该 VIN 下所有订单）
{ "taskType": "GetWipOrderNoInfo", "reported": { "wipOrderNo": "184000000015", "vin": "" } }

{ "code": 0, "msg": "ok", "data": { "orderList": [
  { "wipOrderNo": "184000000015", "wipOrderType": 2, "productID": 9005,
    "productNo": "MAT-HOST-005", "productDesc": "8x4 牵引车底盘（改制）", "vin": "LSVU2A0N260800003" },
  { "wipOrderNo": "184000000014", "wipOrderType": 1, "productID": 9004,
    "productNo": "MAT-HOST-004", "productDesc": "8x4 牵引车底盘", "vin": "LSVU2A0N260800003" }
] } }

// VIN 搜索
{ "taskType": "GetWipOrderNoInfo", "reported": { "wipOrderNo": "", "vin": "LSVU2A0N260800003" } }

// 响应（有改制单：改制在前、生产在后）
{ "code": 0, "msg": "ok", "data": { "orderList": [
  { "wipOrderNo": "184000000015", "wipOrderType": 2, "productID": 9005,
    "productNo": "MAT-HOST-005", "productDesc": "8x4 牵引车底盘（改制）", "vin": "LSVU2A0N260800003" },
  { "wipOrderNo": "184000000014", "wipOrderType": 1, "productID": 9004,
    "productNo": "MAT-HOST-004", "productDesc": "8x4 牵引车底盘", "vin": "LSVU2A0N260800003" }
] } }

// 查不到
{ "code": 1, "msg": "未查询到订单信息" }
```

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

> 单订单查询：前端对订单集合内每张单各调一次，归属由「哪次请求」决定。

**出参** `data`

| 字段 | 类型 | 说明 |
|---|---|---|
| `removeSnList` | array | 该单所有**待解绑**旧件；生产单返回 `[]`；**改制单返回同 VIN 对应生产订单中、与改制单物料类型匹配的已采 SN**；待解绑数量 = `length`（不返回 `removeQty`/`needRemoveQty`） |
| `keyComponentList` | array | 关重件配置清单 |
| `snList` | array | 已采集序列号清单（与 `keyComponentList` 同级） |

**removeSnList 每项**

| 字段 | 类型 | 说明 |
|---|---|---|
| `wipOrderNo` | string | 旧件所属订单号（改制单场景为对应**生产订单**） |
| `wipOrderType` | number | 旧件所属订单类型（生产订单为 1） |
| `vin` | string | 旧件所属订单 VIN（`移除关重件` 入参） |
| `serialNo` | string | 旧件序列号（`移除关重件` 入参） |
| `materialID` | number | 旧件物料 ID（可选；页面优先按 ID 匹配 `keyComponentList`，无 ID 时按 `materialNo`） |
| `materialNo` | string | 旧件物料编码（与 `materialID` 二选一即可定位配置） |
| `materialSeq` | string | 旧件序号（**字符串**：`"1"`=前电机，`"2"`=后电机，null=无位置；解绑页展示「位置」） |
| `scanTime` | string | 录入时间 |

> 改制单解绑的是**同 VIN 对应生产订单**上、与改制单物料类型匹配的 SN；由后端解析生产订单并返回，页面按行内订单执行移除。**物料描述/类型等主数据只从 `keyComponentList` 取**（按 `materialID` 或 `materialNo` 匹配），`removeSnList` 只带标识字段。
>
> 更换旧件由页面从已加载的 `snList` 本地派生（不调接口）：归属生产单只取生产单该物料的记录；归属改制单取改制 + 同 VIN 生产单该物料的记录；按录入时间倒序展示。

**keyComponentList 每项**

| 字段 | 类型 | 说明 |
|---|---|---|
| `materialID` | number | 关重件物料 ID（`snList` 按此字段归属） |
| `materialNo` | string | 关重件物料编码 |
| `materialDesc` | string | 关重件物料描述 |
| `materialQty` | number | 关重件物料数量（该物料需采集总数；**改制单可为负数**，如 `-1` 表示需移除，解绑后由后端回到 `0`） |
| `uomCode` | string | 单位 |
| `materialType` | string | 关重件类型 |
| `materialSeq` | string | 关重件序号（配置值，**字符串**：`"1"`=前电机，`"2"`=后电机，null=不显示类型描述） |

**snList 每项**

| 字段 | 类型 | 说明 |
|---|---|---|
| `serialNo` | string | 关重件序列号（零件级） |
| `materialID` | number | 关重件物料 ID（归到同 ID 的配置条目） |
| `materialSeq` | string | 关重件序号（采集值，**字符串**：`"1"`=前电机，`"2"`=后电机，null=不显示类型描述） |
| `scanTime` | string | 扫描时间 |

**请求/响应示例**

```jsonc
{ "taskType": "GetKeyComponentInfo", "reported": { "wipOrderNo": "184000000013", "wipOrderType": 2 } }

{ "code": 0, "msg": "ok", "data": {
  "removeSnList": [
    { "wipOrderNo": "184000000001", "wipOrderType": 1, "vin": "LSVU2A0N260800009",
      "serialNo": "SN-MOTOR-OLD-1", "materialID": 3001, "materialNo": "MAT-MOTOR-011",
      "materialSeq": "1", "scanTime": "2026-08-20 08:30:00" }
  ],
  "keyComponentList": [
    { "materialID": 3001, "materialNo": "MAT-MOTOR-011", "materialDesc": "永磁体同步电机",
      "materialQty": 1, "uomCode": "EA", "materialType": "永磁体同步电机", "materialSeq": "1" },
    { "materialID": 3003, "materialNo": "MAT-NEG-031", "materialDesc": "改制减件",
      "materialQty": -1, "uomCode": "EA", "materialType": "改制减件", "materialSeq": null }
  ],
  "snList": [
    { "serialNo": "SN-MOTOR-B1", "materialID": 3001, "materialSeq": "1", "scanTime": "2026-08-24 10:00:00" }
  ]
} }
```

## 移除关重件

```js
window.KeyComponentChange_Remove(
  { taskType: "Remove", reported: { wipOrderNo, wipOrderType, vin, serialNo } }, callback)
```

**入参** `reported`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `wipOrderNo` | string | 是 | 订单号（该行所属订单） |
| `wipOrderType` | number | 是 | 订单类型 |
| `vin` | string | 是 | 该行所属订单的 VIN |
| `serialNo` | string | 是 | 被移除的关重件序列号（零件级） |

**出参** `data`

| 字段 | 类型 | 说明 |
|---|---|---|
| `oldGenealogyID` | string | 被删除数据的 ID（保存新关重件 回传） |

**请求/响应示例**

```jsonc
// 解绑对应生产单 014 的旧件
{ "taskType": "Remove", "reported": {
    "wipOrderNo": "184000000014", "wipOrderType": 1, "vin": "LSVU2A0N260800003",
    "serialNo": "SN-MOTOR-OLD-A" } }

{ "code": 0, "msg": "ok", "data": { "oldGenealogyID": "GEN-1" } }
```

## 查询待移除明细 / 查询待更换明细（页面均不再使用）

```js
// 待移除明细已并入 查询关重件信息 的 removeSnList；待更换明细由页面用已加载的 snList 本地派生
// （生产单归属只取生产单；改制单归属取改制 + 同 VIN 生产单），页面不再调用这两个接口（保留协议向后兼容，可废弃）
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
| `vin` | string | 该行所属订单的 VIN |
| `serialNo` | string | 关重件旧序列号（零件级） |
| `materialID` | number | 物料 ID（可选；描述/类型按 ID 或 `materialNo` 从 `keyComponentList` 回查） |
| `materialNo` | string | 物料编码 |
| `scanTime` | string | 录入时间 |

**请求/响应示例**

```jsonc
// 查询待更换明细（前电机位置）
{ "taskType": "GetChangeKeyComponentInfo",
  "reported": { "wipOrderNo": "184000000012", "wipOrderType": 1,
                "materialNo": "MAT-MOTOR-001", "materialSeq": "1" } }

{ "code": 0, "msg": "ok", "data": [
  { "wipOrderNo": "184000000013", "wipOrderType": 2, "vin": "LSVU2A0N260800002",
    "serialNo": "SN-OLD-CHG-1", "materialID": 3001, "materialNo": "MAT-MOTOR-011", "scanTime": "2026-08-22 10:00:00" }
] }

// 查询待移除明细（页面已不使用，保留协议）
{ "taskType": "GetRemoveKeyComponentInfo", "reported": { "wipOrderNo": "184000000013", "wipOrderType": 2 } }
{ "code": 0, "msg": "ok", "data": [ /* 结构同上 */ ] }
```

## 保存扫描件（正常采集 / 替换共用）

```js
window.KeyComponentChange_Save(
  { taskType: "Save", reported: { wipOrderNo, wipOrderType, vin, productID, productNo, productDesc,
    materialID, materialNo, materialDesc, materialSeq, serialNo, materialQty,
    uomCode, partner, inputType, inputCode, oldGenealogyID } }, callback)
```

**入参** `reported`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `wipOrderNo` | string | 是 | 本次扫描物料**归属订单**的订单号 |
| `wipOrderType` | number | 是 | 归属订单类型（1=生产订单，2=改制订单） |
| `vin` | string | 是 | 归属订单的 VIN |
| `productID` | number | 是 | 归属订单的订单物料 ID（查询订单信息 orderList 对应项） |
| `productNo` | string | 是 | 归属订单的订单物料编码 |
| `productDesc` | string | 是 | 归属订单的订单物料描述 |
| `materialID` | number | 是 | 关重件物料 ID（查询关重件信息 配置条目） |
| `materialNo` | string | 是 | 关重件物料编码（二维码第一段） |
| `materialDesc` | string | 是 | 关重件物料描述（查询关重件信息 配置条目） |
| `materialSeq` | string | 是 | 关重件序号（**字符串**：`"1"`=前电机，`"2"`=后电机，`""`=其它） |
| `serialNo` | string | 是 | 关重件序列号（二维码第三段冒号前部分，零件级） |
| `materialQty` | number | 是 | 关重件数量（不带 `:数量` 时按 `1`；多余 `:` 段忽略） |
| `uomCode` | string | 是 | 单位（查询关重件信息 配置条目） |
| `partner` | string | 是 | 供应商（二维码第二段） |
| `inputType` | number | 是 | 输入方式：`0`=手输，`1`=扫码 |
| `inputCode` | number | 是 | 输入键位：回车 `13`，鼠标左键点击 `1` |
| `oldGenealogyID` | string | 否 | **可空**：空 = 正常采集入库；有值 = 替换（`移除关重件` 返回的 `oldGenealogyID`） |

**出参**：仅 `code`、`msg`，`data` 为 `null`。

**请求/响应示例**

```jsonc
// 正常采集：oldGenealogyID 传空
{ "taskType": "Save", "reported": {
    "wipOrderNo": "184000000014", "wipOrderType": 1, "vin": "LSVU2A0N260800003",
    "productID": 9004, "productNo": "MAT-HOST-004", "productDesc": "8x4 牵引车底盘",
    "materialID": 4003, "materialNo": "MAT-BOX-023", "materialDesc": "变速箱总成", "materialSeq": "3",
    "serialNo": "SN-BOX-NEW-1", "materialQty": 1, "uomCode": "EA", "partner": "供应商A",
    "inputType": 0, "inputCode": 13, "oldGenealogyID": "" } }
{ "code": 0, "msg": "ok", "data": null }

// 替换：先 移除关重件 拿到 oldGenealogyID，再保存
{ "taskType": "Save", "reported": {
    "wipOrderNo": "184000000013", "wipOrderType": 2, "vin": "LSVU2A0N260800002",
    "productID": 9002, "productNo": "MAT-HOST-002", "productDesc": "8x4 搅拌车底盘",
    "materialID": 3001, "materialNo": "MAT-MOTOR-011", "materialDesc": "永磁体同步电机",
    "materialSeq": "1", "serialNo": "CHG-M3", "materialQty": 1, "uomCode": "EA",
    "partner": "供应商B", "inputType": 0, "inputCode": 13, "oldGenealogyID": "GEN-1" } }
{ "code": 0, "msg": "ok", "data": null }
```

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

**请求/响应示例**

```jsonc
{ "taskType": "GetVinInfo", "reported": { "wipOrderNo": "184000000012" } }
{ "code": 0, "msg": "ok", "data": { "oldVin": "LSVU2A0N260800001", "oldFactoryCode": "FAC-0001" } }
```

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

**请求/响应示例**

```jsonc
{ "taskType": "SaveVin", "reported": {
    "wipOrderNo": "184000000012", "oldVin": "LSVU2A0N260800001",
    "newVin": "LSVU2A0N260800099", "oldFactoryCode": "FAC-0001",
    "factoryCode": "FAC0000000000099" } }

{ "code": 0, "msg": "ok", "data": null }
```
