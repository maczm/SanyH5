# 装箱作业 - Window API 接口对接文档

## 概述

装箱作业 H5 页面嵌入在 Apriso MES Portal 中以 iframe 方式运行，所有前后端通信通过 Portal 注入到 `window` 上的全局函数完成。Index.js 中从 `#MOCK-START` 到 `#MOCK-END` 之间的代码为 Mock 实现，仅用于本地开发调试。

**核心机制**：每个 API 都用 `if (typeof window.xxx !== 'function')` 包裹 Mock 定义——Portal 注入后 JS 自动跳过 Mock，无需改一行代码。

---

## 公共约定

- 所有回调格式：`callback({ code: number, msg: string, data?: any })`
- `code: 0` 成功，非 0 失败
- `msg` 失败时为错误描述

---

## Portal 需注入的 5 个 window 属性

| 序号 | window 属性 | 类型 | 说明 |
|------|-------------|------|------|
| 1 | `searchByPackingList` | function | 装箱单号搜索 |
| 2 | `searchByMaterialCode` | function | 物料编码搜索 |
| 3 | `uploadPackingImage` | function | 图片上传 |
| 4 | `submitPacking` | function | 装箱提交 |
| 5 | `Operator` | string | 当前操作员姓名 |

---

## 生产切换步骤

### 方式一（推荐）：删除 Mock 区块

1. 打开 `Index.js`
2. 搜索 `#MOCK-START` 和 `#MOCK-END`
3. 删除这两个标记之间以及标记本身的所有代码
4. 同时删除 `mockItems` 数组和 `fuzzyMatch` 函数（它们仅被 Mock 使用）
5. Portal 注入的函数自动生效

### 方式二：Portal 注入后直接部署

Portal 注入同名函数后，JS 中的 `if (typeof ... !== 'function')` 判断为 false，Mock 代码不会执行。Mock 代码不影响功能，但会增加文件体积，建议用方式一清理。

---

## API 1：装箱单号搜索

### Mock 代码位置

Index.js 中搜索 `Mock API 1`：

```js
// -- Mock API 1：装箱单号搜索 --
if (typeof window.searchByPackingList !== 'function') {
    window.searchByPackingList = function(params, callback) {
        setTimeout(function() {
            var results = mockItems.filter(function(item) {
                return fuzzyMatch(item.packingListNo, params.packingListNo);
            });
            ...
        }, CONFIG.MOCK_DELAY);
    };
}
```

### 生产实现

```
window.searchByPackingList = function(params, callback)
```

### 入参

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `params.packingListNo` | string | 是 | 用户手动输入或扫码的装箱单号 |

### 出参 callback({ code, msg, data })

| 字段 | 类型 | 说明 |
|------|------|------|
| `code` | number | 0=成功, 非0=失败 |
| `msg` | string | 失败时为错误描述 |
| `data` | object[] | 待装箱对象数组 |

### data 元素字段（11 个）

| 字段 | 类型 | 说明 | 页面展现 |
|------|------|------|----------|
| `ID` | string | 装箱对象唯一标识 | **不显示**，用于 API3/API4 |
| `batchCode` | string | 批次编码 | 卡片字段（展示用，不参与搜索） |
| `batchDescription` | string | 批次描述 | 卡片字段 |
| `packingListNo` | string | 装箱单号 | 卡片字段 + 回填输入框 |
| `boxNo` | string | 箱号 | 卡片字段 |
| `containerNum` | number | 箱数 | 卡片字段（用于照片数量计算） |
| `materialCode` | string | 物料编码 | 卡片字段 + 回填输入框 |
| `materialName` | string | 物料名称 | 卡片字段 |
| `totalQty` | number | 总数 | 卡片三列并排字段 |
| `pendingQty` | number | 待装箱数 | 卡片三列并排字段 + 装箱数量默认值 |
| `packedQty` | number | 已装箱数 | 卡片三列并排字段 |

### 调用链

```
用户输入/扫码装箱单号 → doSearchPackingList() → window.searchByPackingList({ packingListNo }, callback)
  → 成功: state.step = 1，展示搜索结果卡片，显示 step 2 搜索框
  → 失败: Toast 错误提示
```

```js
// 生产协议
window.searchByPackingList({ packingListNo: "PL202405001" }, function(res) {
    // res.code === 0  → res.data = [{ ID, batchCode, ... }, ...]
    // res.code !== 0  → res.msg 展示给用户
});
```

---

## API 2：物料编码搜索

### Mock 代码位置

Index.js 中搜索 `Mock API 2`：

```js
// -- Mock API 2：物料编码搜索 --
if (typeof window.searchByMaterialCode !== 'function') {
    window.searchByMaterialCode = function(params, callback) {
        setTimeout(function() {
            var results = mockItems.filter(function(item) {
                return fuzzyMatch(item.packingListNo, params.packingListNo) &&
                       fuzzyMatch(item.materialCode, params.materialCode);
            });
            ...
        }, CONFIG.MOCK_DELAY);
    };
}
```

### 生产实现

```
window.searchByMaterialCode = function(params, callback)
```

### 入参（携带上一步的 packingListNo）

| 字段 | 类型 | 必填 | 来自 |
|------|------|------|------|
| `params.packingListNo` | string | 是 | API1 回填的装箱单号 |
| `params.materialCode` | string | 是 | 用户手动输入或扫码的物料编码 |

### 出参

同 API1，`data` 为同一结构的待装箱对象数组。

### 调用链

```
用户输入/扫码物料编码 → doSearchMaterial() → window.searchByMaterialCode({ packingListNo, materialCode }, callback)
  → 成功: state.step = 2，展示搜索结果卡片
  → 失败: Toast 错误提示
```

```js
// 生产协议
window.searchByMaterialCode({
    packingListNo: "PL202405001",
    materialCode: "MC-A001"
}, function(res) {
    // res.code === 0  → res.data = [{ ID, batchCode, ... }, ...]
    // res.code !== 0  → res.msg 展示给用户
});
```

---

## API 3：图片上传

### Mock 代码位置

Index.js 中搜索 `Mock API 3`：

```js
// -- Mock API 4：图片上传 --
if (typeof window.uploadPackingImage !== 'function') {
    window.uploadPackingImage = function(params, callback) {
        setTimeout(function() {
            // Mock: 直接返回 base64 作为 URL
            callback({ code: 0, msg: 'success', data: { url: params.base64 } });
        }, 300);
    };
}
```

### 生产实现

```
window.uploadPackingImage = function(params, callback)
```

生产需要将 Base64 解码后上传到 CDN/OSS，返回可访问的 URL。

### 入参

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `params.id` | string | 是 | 装箱对象 ID（来自搜索结果卡片） |
| `params.base64` | string | 是 | Base64 图片（前端已用 Canvas 压缩为 JPEG, ≤3000×3000px, quality 0.8） |

### 出参 callback({ code, msg, data })

| 字段 | 类型 | 说明 |
|------|------|------|
| `code` | number | 0=成功 |
| `msg` | string | 失败时为错误描述 |
| `data.url` | string | 图片访问 URL（将用于缩略图展示 + API5 提交） |

### 调用链

```
用户拍照/选图 → compressImage(file) → Canvas 压缩为 Base64
  → handleFileSelect() → showLoading('上传中...')
  → window.uploadPackingImage({ id: item.ID, base64 }, callback)
  → 成功: state.photos.push({ url: res.data.url })，渲染缩略图
  → 失败: Toast "上传失败"，不会加入照片列表
```

```js
// 生产协议
window.uploadPackingImage({
    id: "PK001",
    base64: "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
}, function(res) {
    // res.code === 0  → res.data.url = "https://cdn.xxx.com/packing/abc.jpg"
    // res.code !== 0  → res.msg 展示给用户
});
```

---

## API 4：装箱提交

### Mock 代码位置

Index.js 中搜索 `Mock API 4`：

```js
// -- Mock API 5：装箱提交 --
if (typeof window.submitPacking !== 'function') {
    window.submitPacking = function(data, callback) {
        setTimeout(function() {
            if (Math.random() < 0.1) {
                callback({ code: 1, msg: '系统繁忙，请稍后重试' });
            } else {
                callback({ code: 0, msg: '装箱成功' });
            }
        }, 800);
    };
}
```

**Mock 有 10% 随机失败概率**，用于测试错误处理流程——生产实现应去掉随机逻辑。

### 生产实现

```
window.submitPacking = function(data, callback)
```

### 入参 data（14 个字段）

| 字段 | 类型 | 必填 | 来自 |
|------|------|------|------|
| `ID` | string | 是 | 装箱对象 ID（用户点击的卡片） |
| `batchCode` | string | 是 | 卡片数据 |
| `batchDescription` | string | 是 | 卡片数据 |
| `packingListNo` | string | 是 | 卡片数据 |
| `boxNo` | string | 是 | 卡片数据 |
| `containerNum` | number | 是 | 卡片数据（箱数） |
| `materialCode` | string | 是 | 卡片数据 |
| `materialName` | string | 是 | 卡片数据 |
| `totalQty` | number | 是 | 卡片数据（总数） |
| `pendingQty` | number | 是 | 卡片数据（待装箱数） |
| `packedQty` | number | 是 | 卡片数据（已装箱数） |
| `packingQty` | number | 是 | **用户输入的本次装箱数量（支持浮点数）** |
| `photos` | string[] | 是 | 照片 URL 数组（由 API4 逐张上传后收集） |
| `operator` | string | 是 | `window.Operator`（操作员姓名） |

### 出参

| 字段 | 类型 | 说明 |
|------|------|------|
| `code` | number | 0=成功 |
| `msg` | string | 成功/失败描述 |

### 调用链

```
用户点击"确认装箱" → handleSubmit(item)
  → 数量校验（非空、正数、≤待装箱数，支持浮点数）
  → 照片校验（至少 ceil(packingQty × containerNum / totalQty) 张，不足时拦截）
  → showLoading('提交中...')，按钮禁用显示"提交中..."
  → window.submitPacking(submitData, callback)
  → 成功: Toast "装箱成功"(含详情) → resetAfterPacking() 保留装箱单号，回到物料编码搜索
  → 失败: Toast 错误信息，恢复按钮
```

```js
// 生产协议
window.submitPacking({
    ID: "PK001",
    batchCode: "PC202405001",
    batchDescription: "2024年5月A批次-发动机总成",
    packingListNo: "PL202405001",
    boxNo: "BX-202405001-01",
    materialCode: "MC-A001",
    materialName: "发动机总成-2.0T",
    totalQty: 200,
    pendingQty: 35,
    packedQty: 165,
    packingQty: 10,
    photos: ["https://cdn.xxx.com/packing/abc.jpg"],
    operator: "张三"
}, function(res) {
    // res.code === 0  → 装箱成功，保留装箱单号，回到物料编码搜索
    // res.code !== 0  → res.msg 展示给用户，按钮恢复可点击
});
```

---

## 附加：操作员

### Mock 代码位置

Index.js 中搜索 `Mock 操作员`，约第 192-194 行：

```js
if (!window.Operator) {
    window.Operator = '开发用户';
}
```

### 生产实现

Portal 注入：

```js
window.Operator = "张三"; // 当前登录的操作员姓名或工号
```

页面显示在 Header 的副标题位置。

---

## Mock 区块完整清理清单

切换到生产时，删除 Index.js 中以下全部内容：

| 删除内容 | 行号标记 | 说明 |
|----------|----------|------|
| `fuzzyMatch` 函数 | 约 13-16 行 | 仅 Mock 使用 |
| `mockItems` 数组 | `#MOCK-START` 后 | 4 条本地假数据 |
| Mock API 1 定义 | `-- Mock API 1` | `searchByPackingList` mock |
| Mock API 2 定义 | `-- Mock API 2` | `searchByMaterialCode` mock |
| Mock API 3 定义 | `-- Mock API 3` | `uploadPackingImage` mock |
| Mock API 4 定义 | `-- Mock API 4` | `submitPacking` mock |
| Mock 操作员 | `-- Mock 操作员` | `window.Operator` 默认值 |

**精确范围**：从 `#MOCK-START` 注释行到 `#MOCK-END` 注释行（含标记行本身），外加 `fuzzyMatch` 函数定义。
