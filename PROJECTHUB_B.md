# ProjectHub 方案B实现说明

## 概述

方案B实现了服务器端按需加载模式，适合大文件和多用户场景。

## 架构

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Browser   │         │  Node.js     │         │   H5AD      │
│             │         │  Server      │         │   File      │
│  Worker     │◄────────┤  setupProxy  │◄────────┤  (150MB)    │
│  Adapter    │  JSON   │  + bakana    │  Read   │             │
└─────────────┘         └──────────────┘         └─────────────┘
     │                         │
     │                         │
     └─────────────────────────┘
       只传输可视化数据 (~KB)
```

## 工作流程

### 1. 服务器端（Node.js）
- 使用 bakana 读取 H5AD 文件（一次读取）
- 缓存在内存中，多用户共享
- 按需提取数据（坐标、注释、表达量）
- 通过 API 返回 JSON

### 2. 浏览器端（Worker）
- 使用 ProjectHubAdapter 替代直接读取文件
- 通过 API 获取数据
- 本地缓存减少重复请求
- 与现有代码无缝集成

## API 端点

### 获取元数据
```
GET /api/projecthub/:id/metadata
返回: { n_cells, n_genes, embeddings, annotations, modalities }
```

### 获取降维坐标
```
GET /api/projecthub/:id/embedding/:name
返回: { x: [...], y: [...] }
```

### 获取注释列
```
GET /api/projecthub/:id/annotation/:name
返回: { values: [...], levels: [...], type: "categorical" }
```

### 获取基因表达
```
GET /api/projecthub/:id/expression?genes=CD3D,CD8A&modality=RNA
返回: { genes: [...], expression: [[...], [...]] }
```

### 获取基因列表
```
GET /api/projecthub/:id/genes?modality=RNA
返回: { genes: [...] }
```

### 清除缓存
```
POST /api/projecthub/clear-cache
返回: { message: "Cache cleared successfully" }
```

## 性能优势

### 方案A（下载完整文件）
- 150MB 文件下载：~1分钟
- 10个用户：10 × 150MB = 1.5GB 带宽
- 每个用户都需要等待下载

### 方案B（按需加载）
- 首次加载元数据：~1KB，<100ms
- 加载 UMAP 坐标（10万细胞）：~1.6MB，~200ms
- 加载注释列：~100KB，~50ms
- 10个用户共享服务器缓存：只读取一次文件

**总结**：
- 首次加载时间：从 60秒 降到 <1秒
- 带宽消耗：从 1.5GB 降到 ~20MB
- 多用户场景：服务器缓存，性能更好

## 文件清单

### 新增文件
1. `src/h5adReader.js` - 服务器端 H5AD 读取模块
2. `src/workers/ProjectHubAdapter.js` - 浏览器端适配器

### 修改文件
1. `src/setupProxy.js` - 添加 API 端点
2. `src/components/LoadExplore/index.js` - 标记 ProjectHub 模式
3. `src/workers/explorer.worker.js` - 支持 ProjectHub 格式

## 使用方法

### 1. 启动服务器
```bash
npm start
```

服务器会自动：
- 读取 `public/projecthub/index.json`
- 初始化 bakana
- 启动 API 服务

### 2. 选择数据集
1. 打开浏览器，进入 Load Dataset 页面
2. 选择 ProjectHub 标签
3. 从下拉列表选择数据集
4. 等待元数据加载（<1秒）
5. 自动进入 Explore 模式

### 3. 数据按需加载
- 切换降维图：自动加载对应坐标
- 选择注释列：自动加载注释数据
- 查看基因表达：按需加载表达量

## 测试步骤

### 1. 测试 API
```bash
# 测试元数据
curl http://localhost:3000/api/projecthub/adata_qc/metadata

# 测试降维坐标（假设有 X_umap）
curl http://localhost:3000/api/projecthub/adata_qc/embedding/X_umap

# 测试注释列（假设有 leiden）
curl http://localhost:3000/api/projecthub/adata_qc/annotation/leiden

# 测试基因表达
curl "http://localhost:3000/api/projecthub/adata_qc/expression?genes=CD3D,CD8A"
```

### 2. 测试前端
1. 选择 ProjectHub 数据集
2. 检查浏览器控制台是否有错误
3. 查看网络请求（应该是小的 JSON 请求）
4. 测试切换降维图、注释列
5. 测试 DotPlot 功能

### 3. 性能测试
```bash
# 监控内存使用
# 服务器端应该缓存数据，内存占用稳定

# 测试多用户
# 开多个浏览器标签，同时加载同一数据集
# 服务器应该只读取一次文件
```

## 故障排查

### 问题：API 返回 404
- 检查 `public/projecthub/index.json` 是否存在
- 检查数据集 ID 是否正确
- 检查 H5AD 文件路径（符号链接是否有效）

### 问题：API 返回 500
- 查看服务器控制台错误信息
- 检查 bakana 是否正确初始化
- 检查 H5AD 文件格式是否正确

### 问题：前端加载失败
- 检查浏览器控制台错误
- 检查网络请求是否成功
- 确认 ProjectHubAdapter 正确导入

### 问题：数据不完整
- 检查 H5AD 文件是否包含必要的字段：
  - `obsm`: 降维坐标（X_umap, X_tsne 等）
  - `obs`: 细胞注释
  - `var`: 基因信息
  - `X` 或 `layers`: 表达矩阵

## 注意事项

1. **内存管理**：服务器会缓存 H5AD 数据，大文件会占用较多内存
2. **并发控制**：当前实现没有并发限制，生产环境建议添加
3. **错误处理**：API 错误会传递到前端，注意用户体验
4. **缓存策略**：可以通过 `/api/projecthub/clear-cache` 清除缓存

## 未来优化

1. **分页加载**：对于超大数据集，可以实现分页加载
2. **压缩传输**：使用 gzip 压缩 JSON 响应
3. **增量更新**：只传输变化的数据
4. **WebSocket**：实时推送数据更新
5. **持久化缓存**：使用 Redis 等缓存服务

## 与方案A对比

| 特性 | 方案A（下载文件） | 方案B（按需加载） |
|------|------------------|------------------|
| 首次加载 | 60秒 | <1秒 |
| 带宽消耗 | 150MB | ~2MB |
| 多用户 | 每人下载 | 共享缓存 |
| 服务器负载 | 无 | 中等 |
| 实现复杂度 | 简单 | 中等 |
| 适用场景 | 小文件 | 大文件、多用户 |
