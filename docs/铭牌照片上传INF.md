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
| `photos` | array | **已保存照片**（同保存报文结构，`[{ photoType, urlList }]`）。重新进入页面时用于回显；无已保存记录时可为 `[]` 或缺省 |

**photos 每项**（回显用）

| 字段 | 类型 | 说明 |
|---|---|---|
| `photoType` | string | 照片类型编码，需与 `photoTypes[].typeCode` 对应 |
| `urlList` | string[] | 该类型已保存照片 URL，按拍摄顺序显示 |

> 回显规则：照片按类型回填到对应卡片，与本次拍摄的照片**同等对待**（可删除、可继续拍摄、可再保存）；
> 回填过程**静默进行、不弹任何提示**（操作员直接看到已保存的缩略图）；
> 无法与当前 `photoTypes` 对应的历史记录（类型已下线等）会被忽略且不报错；`urlList` 中的空串会被跳过；
> 回填后底部按钮按下述规则自然可用（至少 1 张照片即可保存）。**已选铭牌模板不回填**，多模板仍需重新选择。

**photoTypes 每项**

| 字段 | 类型 | 说明 |
|---|---|---|
| `typeCode` | string | 照片类型编码（上传时回传） |
| `typeName` | string | 照片类型显示名称 |
| `minCount` | number | 最少拍摄数量；`0` 表示**该类型可不拍** |
| `maxCount` | number | 最多拍摄数量（达到后隐藏拍照入口并提示「已达上限」） |

**卡片徽章文案**（按 `minCount`/`maxCount` 与已拍张数 X 渲染）

| 场景 | 条件 | 徽章文案 |
|---|---|---|
| 还未达标 | `minCount > 0` 且 `X < minCount` | `还需 N 张（已拍 X/minCount）`，N = `minCount − X` |
| 刚好达标 | `X === minCount` | `已完成（已拍 X/minCount）` |
| 超过最少数 | `X > minCount` | `已完成（已拍 X 张）`（不写 `X/minCount`，避免出现 `3/1` 这种读起来像出错的写法） |
| 可不拍·未拍 | `minCount === 0` 且 `X === 0` | `可不拍（最多 maxCount 张）`（中性灰，**不显示完成态**） |
| 可不拍·已拍 | `minCount === 0` 且 `X > 0` | `已拍 X 张（最多 maxCount 张）` |

> `minCount = 0` 的类型一张没拍时**不判定为「已完成」**（旧逻辑会把 0 ≥ 0 当达标、显示绿色完成态，容易误导）；
> 上限张数**不提前告知**，仅达上限时通过卡片提示与隐藏拍照入口表达。

**orderInfo**

| 字段 | 类型 | 说明 |
|---|---|---|
| `machineCode` | string | 主机编码 |
| `vin` | string | 车辆识别码（可为空字符串） |
| `selectedTemplateId` | string | **上次保存的模板 ID**（可选）。用于重新进入页面时回显选中态 |
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

**选中态优先级**（每次查询按顺序判定）：

| 优先级 | 条件 | 页面行为 |
|---|---|---|
| 1 | `orderInfo.selectedTemplateId` 能在本次 `templates` 中匹配到 | 自动选中该模板（名称与图片取本次候选值），**不弹窗** |
| 2 | `templates.length === 1` | 自动选中唯一候选，不弹窗 |
| 3 | 其他（多个候选且无可用的回显） | 弹窗强制选择 |
| — | `templates.length === 0` | 提示「未查到铭牌模板」，不卡控保存 |

> `selectedTemplateId` 指向的模板已下线（不在本次候选中）时按「未回显」处理，落回优先级 2/3，不会用旧模板的名称与图片。

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
| `toKeyPart` | boolean | 是 | 是否由关重件绑定（KeyPart）页面进入（即按钮文案「保存并返回」场景） |
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
window.fromKeyPart            // 入口标识：值为 "KeyPart" 表示由关重件绑定页面进入
window.KeyPartStationCode     // 由关重件绑定页面带入的工位编码（可选，用于预填并自动查询）
window.KeyPartOrderNo         // 由关重件绑定页面带入的订单号（可选，用于预填并自动查询）
```

| 属性 | 类型 | 说明 |
|---|---|---|
| `fromKeyPart` | string | 等于 `"KeyPart"` 时：底部按钮文案为「保存并返回」（否则为「保存」）；保存成功后页面调用下方的返回方法交回关重件绑定页面 |
| `KeyPartStationCode` | string | 与 `fromKeyPart` 配套带入；存在时页面预填工位并在工位列表返回后自动匹配 |
| `KeyPartOrderNo` | string | 与 `fromKeyPart` 配套带入；与工位同时存在时页面自动发起一次照片配置查询 |

> 两属性缺省/为空时页面不预填，按正常手工查询流程使用；本地开发由 `mock.js` 提供兜底值。

## API-N5：返回关重件绑定页面（页面调用，Portal 实现）

```js
window.KeyPart_ReturnFromPhotoUpload()
window.KeyPart_ReturnFromPhotoUpload   // 必须是函数；页面用 typeof 检测
```

**调用时机**：`window.fromKeyPart === "KeyPart"` 且保存接口（API-N4）返回 `code: 0` 之后，页面延迟 600ms（先让「保存成功」提示渲染出来）调用一次，**无入参、不接收返回值/回调**。

**页面侧行为**：

| 情况 | 行为 |
|---|---|
| 已注入该函数 | 保存成功后调用一次，由 Portal 执行返回导航（关页 / 回上一页等自行决定） |
| 未注入（本地开发） | 静默跳过，不报错；`mock.js` 提供空实现便于本地联调（生产不部署） |

> 页面不自行做任何导航（不调用 `history.back()`、不操作 `window.parent`）；返回方式完全由 Portal 在该函数内决定。

## 宿主高度要求与紧凑视口行为

页面高度不自绘、不用 `vh` 撑高：`html/body` 与根容器均 `height:100%`（与 mom-nameplate-check-result 同一写法），高度完全由宿主的 iframe/表单容器决定。

**宿主高度要求（弹窗承载时）**：

| 档位 | 弹窗内容区高度 | 效果 |
|---|---|---|
| 推荐 | ≥630px | 订单信息展开/收起两种状态都可用（收起态为默认，展开态照片卡片区仍有充足高度） |
| 最低 | ≥512px | 两种状态下底部保存按钮均完整可见（展开看模板图时照片区偏紧） |
| 不可用 | <512px | 订单信息一展开，底部按钮即被挤出可视区 |

> 高度请用 `dvh` 或 JS 计算（扣除框架标题栏与底部安全区）；**不要**让页面用 `100vh` 撑高——在表单宿主里 `vh` 指整个视口，会把底部按钮顶出弹窗被裁掉。

**页面布局与折叠行为**：

| 行为 | 说明 |
|---|---|
| 顶部留白 | 查询条件卡片距页面顶部 4px（仅少量留白，宿主无需额外预留顶部空隙） |
| 宽度一致 | 查询条件卡、订单信息卡、照片类型卡左右边距一致（均为 6px） |
| 两区默认收起 | 查询成功后**查询条件区与订单信息区都默认收起**，把纵向空间留给拍照；点各自卡片头展开 |
| 收起态摘要 | 订单信息卡片头显示「主机编码 · VIN · 模板名」+ 32px 模板缩略图（缩略图**点击只放大预览，不展开/折叠**卡片） |
| 展开态 | 显示模板名、模板图片（整行中图，`max-height: 96px`，点击放大预览）与「更换」按钮；订单信息容器**限高 30vh 并自身滚动**，不挤占底部按钮 |
| 用户手动操作优先 | 一旦操作员手动折叠/展开过订单信息，自动收起/展开逻辑不再覆盖其意图（重新查询时重置） |
| 未查到铭牌模板 | 该提示优先级最高：仍强制展开显示「未查到铭牌模板」 |
| 滚动分工 | 底部按钮区固定；照片卡片区独立滚动；订单信息区自身滚动。**不做整页滚动**——实测整页滚动会把底部按钮顶出弹窗可视区 |

**高度链兜底**：页面默认纯 CSS，仅当检测到根容器顶部偏移 > 0（宿主没有高度链、`height:100%` 解析不到）时，才用 `fitPageHeight()`（`窗口高 - 根容器顶部偏移`，最小 240px）显式设高，避免整页滚动条把底部按钮推出可视区；高度链正常（偏移 = 0）时该函数为 no-op。

**查询会话保护**：每次查询前递增会话号并关闭、清空上一次的模板选择弹窗；过期的查询回调（换单/换工位后晚到的旧结果）会被丢弃，不会覆盖新单的配置与模板列表。

> 宿主若无法保证 ≥512px，请告知——此时紧凑视口需接受「查看模板需滚动」的退化体验，或由业务侧调整弹窗高度。
