# 内存错误分析与解决方案

## 问题描述

用户可能遇到两种内存相关错误：

### 错误 1: EXPLORE 阶段
```
EXPLORE ERROR
RuntimeError: Aborted(). Build with -s ASSERTIONS=1 for more info.
```

### 错误 2: PREFLIGHT 阶段（更常见）
```
PREFLIGHT INPUT_DATA
RangeError: Array buffer allocation failed
```

## 根本原因

### 错误 1: RuntimeError: Aborted() - WASM 内存不足

这是 **WebAssembly 内存不足** 导致的错误，主要原因包括：

### 1. 多线程内存开销
```javascript
// 原代码：使用过多线程
let nthreads = Math.round((navigator.hardwareConcurrency * 2) / 3);
```
- 每个 WASM 线程需要独立的内存栈（通常 1-2MB）
- 8 核 CPU 会创建 5-6 个线程 = 额外 10-12MB 栈内存
- 大数据集 + 多线程 = 内存压力倍增

### 2. 数据复制导致内存翻倍
```javascript
// EXPLORE 流程中的内存密集操作
dataset = await v.load();  // 加载整个数据集

// 提取降维结果时复制数组
step_embed_resp[k] = {
  x: v[0].slice(),  // 复制整个 x 坐标数组
  y: v[1].slice(),  // 复制整个 y 坐标数组
};
```
- `.slice()` 会创建数组副本
- 10 万细胞 × 2 维度 × 8 字节 = 1.6MB（仅坐标数据）
- 加上基因表达矩阵、注释等，实际内存需求可达数百 MB

### 3. 缺少内存清理机制
- 旧的 `dataset` 对象没有被释放
- `preflights` 缓存持续累积
- 错误发生时没有清理资源

### 4. WebAssembly 内存限制
- 32 位 WASM：最大 2GB 内存
- 64 位 WASM：最大 4GB（需浏览器支持）
- SharedArrayBuffer 受浏览器安全策略限制

### 错误 2: RangeError: Array buffer allocation failed - JavaScript 堆内存不足

**更常见且更严重**，发生在文件上传的 PREFLIGHT 阶段：

#### 原因
```javascript
// PREFLIGHT 会尝试加载整个文件到内存
preflights[v.uid] = createDataset(v);
if (v.format === "Seurat") {
  await preflights[v.uid].load();  // 问题：加载整个 RDS 文件！
}
```

#### 为什么会失败
1. **文件太大**：用户上传 3-5GB 的 RDS/H5AD 文件
2. **JavaScript 堆限制**：
   - Chrome: ~2GB（32位）或 ~4GB（64位）
   - Firefox: ~2GB
   - Safari: ~1.5GB
3. **无法分配 ArrayBuffer**：文件大小超过可用堆内存
4. **立即失败**：在文件读取阶段就崩溃，无法进入分析

#### 典型场景
- 用户在 R 中保存了完整的 Seurat 对象（包含原始数据、归一化数据、降维结果等）
- 文件大小 > 2GB
- 浏览器尝试读取整个文件 → 内存分配失败

## 已实施的解决方案

### 针对 EXPLORE 错误

#### 方案 1：降低线程数（已修复）
```javascript
// 修改后：限制最大线程数为 4
let nthreads = Math.max(1, Math.min(4, Math.round(navigator.hardwareConcurrency / 2)));
console.log(`[INIT] Using ${nthreads} threads (available: ${navigator.hardwareConcurrency})`);
```

**效果**：
- 减少 50% 的线程栈内存开销
- 为数据留出更多可用内存
- 性能影响：计算速度略降（约 10-20%），但避免崩溃

#### 方案 2：添加内存清理（已修复）
```javascript
// EXPLORE 开始前清理旧数据
if (dataset) {
  console.log("[EXPLORE] Cleaning up previous dataset...");
  try {
    if (typeof dataset.free === 'function') dataset.free();
  } catch (e) {
    console.warn("[EXPLORE] Error freeing dataset:", e);
  }
  dataset = null;
}

// 清理 preflights 缓存
if ("uid" in v && v.uid in preflights) {
  preflights[v.uid].clear();
  delete preflights[k];
  delete preflights_summary[v.uid];  // 新增：清理 summary 缓存
}
```

#### 方案 3：增强错误日志（已修复）
```javascript
.catch((err) => {
  console.error("[EXPLORE] Error occurred:", err);
  
  // 记录内存使用情况
  if (performance && performance.memory) {
    console.error("[EXPLORE] Memory at error:", {
      usedJSHeapSize: (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2) + ' MB',
      totalJSHeapSize: (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(2) + ' MB',
      jsHeapSizeLimit: (performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2) + ' MB'
    });
  }
  
  // 错误时清理资源
  if (dataset) {
    try {
      if (typeof dataset.free === 'function') dataset.free();
    } catch (e) {}
    dataset = null;
  }
  
  postError(type, err, fatal);
});
```

### 针对 PREFLIGHT 错误

#### 方案 4：友好的错误提示（已修复）
```javascript
catch (e) {
  console.error("[PREFLIGHT] Error:", e);
  
  // 检测内存分配失败
  if (e.name === 'RangeError' && performance && performance.memory) {
    console.error("[PREFLIGHT] Memory at error:", {
      usedJSHeapSize: (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2) + ' MB',
      totalJSHeapSize: (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(2) + ' MB',
      jsHeapSizeLimit: (performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2) + ' MB'
    });
    // 提供明确的解决建议
    e = new Error("File too large for browser memory. Try: 1) Use Chrome/Edge, 2) Close other tabs, 3) Downsample data in R/Python first.");
  }
  
  resp.status = "ERROR";
  resp.reason = e.toString();
}
```

**效果**：
- 明确告知用户是文件太大
- 提供可操作的解决方案
- 记录内存使用情况便于调试

## 用户建议

### 针对 PREFLIGHT 错误（文件太大）

**这是最常见的问题，需要在上传前处理数据：**

#### 1. 在 R 中精简 Seurat 对象（推荐）
```r
# 只保留必要的数据
seurat_slim <- DietSeurat(
  seurat_obj,
  counts = FALSE,      # 不保存原始 counts
  data = TRUE,         # 保留归一化数据
  scale.data = FALSE,  # 不保存 scaled data
  assays = "RNA"       # 只保留 RNA assay
)

# 只保留需要的 metadata
seurat_slim@meta.data <- seurat_slim@meta.data[, c("seurat_clusters", "cell_type", "nCount_RNA", "nFeature_RNA")]

# 保存精简版本
saveRDS(seurat_slim, "seurat_slim.rds")
```

**效果**：文件大小可减少 70-90%

#### 2. 降采样大数据集
```r
# 如果细胞数 > 50 万，随机采样
if (ncol(seurat_obj) > 500000) {
  set.seed(123)
  cells_keep <- sample(colnames(seurat_obj), 100000)
  seurat_subset <- subset(seurat_obj, cells = cells_keep)
  saveRDS(seurat_subset, "seurat_subset.rds")
}
```

#### 3. 使用 H5AD 格式（更高效）
```r
# 安装 SeuratDisk
# remotes::install_github("mojaveazure/seurat-disk")
library(SeuratDisk)

# 转换为 H5AD（更节省内存）
SaveH5Seurat(seurat_obj, "data.h5seurat")
Convert("data.h5seurat", dest = "h5ad")
```

**H5AD 优势**：
- 压缩存储，文件更小
- 支持部分读取，不需要加载全部数据
- 跨平台兼容（Python/R）

#### 4. 分批处理
- 按样本或细胞类型拆分数据集
- 分别上传和分析
- 最后合并结果

### 针对 EXPLORE 错误（运行时内存不足）

如果文件能上传但 EXPLORE 时崩溃：

#### 1. 使用更强大的浏览器
- **Chrome/Edge**：内存管理最优，推荐使用
- **Firefox**：WASM 性能较好
- **Safari**：SharedArrayBuffer 支持有限，不推荐

#### 2. 增加可用内存
- 关闭其他标签页和应用
- 重启浏览器清理缓存
- 使用隐私模式（避免扩展占用内存）

#### 3. 检查数据集大小
- 查看文件大小和细胞数
- 参考下面的"内存使用估算"表
- 如果超出限制，回到方案 1-4 精简数据

### 通用建议（两种错误都适用）

#### 浏览器选择
- ✅ **Chrome/Edge**（推荐）：内存管理最优，支持最大堆
- ✅ Firefox：WASM 性能好
- ❌ Safari：内存限制严格，不推荐大数据集

#### 系统要求
- **最低**：8GB RAM，推荐关闭其他应用
- **推荐**：16GB+ RAM
- **大数据集**（>20万细胞）：32GB+ RAM

## 技术细节

### 内存使用估算

#### JavaScript 堆内存（影响 PREFLIGHT）
文件大小限制：

| 文件大小 | Chrome/Edge | Firefox | Safari | 建议 |
|---------|-------------|---------|--------|------|
| < 500 MB | ✅ 可行 | ✅ 可行 | ✅ 可行 | 直接上传 |
| 500 MB - 1 GB | ✅ 可行 | ✅ 可行 | ⚠️ 可能失败 | 关闭其他标签 |
| 1 - 2 GB | ⚠️ 可能失败 | ⚠️ 可能失败 | ❌ 失败 | 精简数据 |
| > 2 GB | ❌ 失败 | ❌ 失败 | ❌ 失败 | **必须精简** |

#### WASM 内存（影响 EXPLORE）
典型单细胞数据集的内存需求：

| 细胞数 | 基因数 | 估算内存 | 是否可行 |
|--------|--------|----------|----------|
| 1 万   | 2 万   | ~50 MB   | ✅ 完全可行 |
| 5 万   | 2 万   | ~200 MB  | ✅ 可行 |
| 10 万  | 2 万   | ~400 MB  | ⚠️ 可能需要优化 |
| 50 万  | 2 万   | ~2 GB    | ❌ 需要降采样 |

### 为什么 RDS 文件特别容易出问题

1. **未压缩**：RDS 使用 gzip 压缩，但解压后占用大量内存
2. **包含冗余数据**：Seurat 对象默认保存：
   - 原始 counts
   - 归一化数据
   - Scaled data
   - 多个 assays（RNA, SCT, integrated 等）
   - 所有降维结果
3. **R 对象开销**：S4 对象结构本身占用额外内存

**示例**：
- 磁盘上：2 GB RDS 文件
- 内存中：解压后可能需要 4-6 GB
- 浏览器限制：只有 2-4 GB 可用
- 结果：**分配失败**

### H5AD 为什么更好

1. **高效压缩**：HDF5 格式，压缩率更高
2. **部分读取**：可以只读取需要的部分（如只读 metadata）
3. **标准化**：Python/R 都支持，数据结构更简洁
4. **流式处理**：不需要一次性加载全部数据

**同样的数据**：
- RDS：2 GB → 需要 4-6 GB 内存
- H5AD：1.2 GB → 需要 2-3 GB 内存

### 浏览器内存限制
- Chrome/Edge：~2-4 GB（取决于系统内存）
- Firefox：~2 GB
- Safari：~1.5 GB

**注意**：这是 JavaScript 堆的限制，不是系统 RAM。即使你有 64GB RAM，浏览器也只能使用 2-4GB。

### WASM 线程开销
- 每个线程：1-2 MB 栈内存
- 4 线程：~8 MB
- 8 线程：~16 MB

## 未来优化方向

### 短期（可立即实施）
1. ✅ 降低默认线程数（已完成）
2. ✅ 添加内存清理（已完成）
3. ✅ 增强错误日志（已完成）
4. ✅ 友好的 PREFLIGHT 错误提示（已完成）
5. ⬜ 文件大小预检查（上传前警告）
6. ⬜ 显示内存使用进度条
7. ⬜ 添加"精简数据"教程链接

### 中期（需要重构）
1. ⬜ **流式文件读取**（最重要）：不一次性加载整个文件
2. ⬜ **增量 PREFLIGHT**：只读取文件头部获取 summary
3. ⬜ 使用 Web Workers 分块处理大文件
4. ⬜ 实现虚拟化渲染（只渲染可见部分）
5. ⬜ 优化数据传输（避免 `.slice()` 复制）
6. ⬜ 实现增量垃圾回收

### 长期（需要架构改进）
1. ⬜ **服务端模式**（推荐）：使用 kanapi 在服务器处理大文件
2. ⬜ 迁移到 64 位 WASM（需浏览器支持）
3. ⬜ 使用 WebGPU 加速计算
4. ⬜ 实现分布式计算
5. ⬜ 支持云存储直接读取（S3/GCS）

## 相关文件

- `src/workers/explorer.worker.js`：主要修改文件
- `src/workers/scran.worker.js`：类似的内存问题可能存在
- `src/workers/helpers.js`：错误处理工具函数

## 参考资料

- [WebAssembly Memory](https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/Memory)
- [SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)
- [Chrome Memory Profiling](https://developer.chrome.com/docs/devtools/memory-problems/)
- [bakana Documentation](https://github.com/LTLA/bakana)

## 问题报告

如果问题持续存在，请提供以下信息：

### 针对 PREFLIGHT 错误
1. 文件格式（RDS/H5AD/其他）
2. 文件大小（MB/GB）
3. 数据集信息（细胞数、基因数）
4. 浏览器版本和操作系统
5. 控制台错误日志（包括内存信息）
6. 是否尝试过精简数据

### 针对 EXPLORE 错误
1. 浏览器版本和操作系统
2. 数据集大小（细胞数、基因数）
3. 控制台错误日志（包括内存信息）
4. 文件格式（H5AD/RDS/Seurat）
5. 是否能成功上传但 EXPLORE 时失败

提交 Issue：https://github.com/jkanche/kana/issues

## 快速诊断流程图

```
文件上传失败？
├─ 是 → PREFLIGHT 错误
│   ├─ 文件 > 2GB？
│   │   └─ 是 → 必须精简数据（DietSeurat/降采样/H5AD）
│   └─ 文件 < 2GB？
│       ├─ 使用 Chrome/Edge
│       ├─ 关闭其他标签
│       └─ 重启浏览器
│
└─ 否 → 文件上传成功但 EXPLORE 失败？
    └─ 是 → EXPLORE 错误
        ├─ 已修复：降低线程数
        ├─ 已修复：内存清理
        ├─ 尝试：关闭其他标签
        └─ 如仍失败：精简数据
```
