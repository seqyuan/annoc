# ProjectHub 实现说明

## 概述

ProjectHub 是一个简化的数据集加载功能，允许用户从服务器预配置的数据集列表中选择并加载数据。

## 实现方式

### 方案A：直接下载模式（当前实现）

**工作流程**：
1. 前端从 `/projecthub/index.json` 读取数据集列表
2. 用户选择数据集后，直接下载 H5AD 文件到浏览器
3. 使用与本地上传相同的逻辑处理文件（bakana.H5adResult）
4. 完全在浏览器中进行分析和可视化

**优点**：
- ✅ 实现简单，代码改动最小
- ✅ 完全复用现有的 H5AD 读取逻辑
- ✅ 不需要后端 API
- ✅ 与本地上传体验一致

**缺点**：
- ⚠️ 需要下载完整文件到浏览器内存
- ⚠️ 不适合超大文件（> 1GB）

## 文件改动

### 1. `src/components/LoadExplore/index.js`
- 简化 `handleProjectHubSelect` 函数
- 直接下载 H5AD 文件并转换为 File 对象
- 移除假的服务器 API 调用

### 2. `src/setupProxy.js`
- 删除 `/api/projecthub/run` 端点
- 只保留 COOP/COEP 头设置

### 3. `public/projecthub/index.json`
- 简化配置，只保留必要字段：
  - `id`: 数据集唯一标识
  - `label`: 显示名称
  - `url`: H5AD 文件 URL

## 配置数据集

### 添加新数据集

1. 将 H5AD 文件放到 `public/projecthub/` 目录
2. 在 `public/projecthub/index.json` 中添加配置：

```json
{
  "id": "my_dataset",
  "label": "My Dataset (description)",
  "url": "/projecthub/my_dataset.h5ad"
}
```

### 使用符号链接（开发环境）

如果文件很大，可以使用符号链接：

```bash
cd public/projecthub
ln -s /path/to/your/data.h5ad my_dataset.h5ad
```

**注意**：符号链接在生产部署时需要替换为实际文件或使用其他存储方案。

## 使用方法

1. 启动开发服务器：
```bash
npm start
```

2. 打开浏览器，进入 Load Dataset 页面
3. 选择 ProjectHub 标签
4. 从下拉列表中选择数据集
5. 等待下载完成后自动进入 Explore 模式

## 未来优化方向（方案B）

如果需要支持超大文件（> 1GB），可以实现按需加载模式：

1. 添加后端 API 提取数据
2. 只传输可视化所需的数据（坐标、注释、表达量）
3. 改造 worker 支持远程数据源

这需要更多的开发工作，建议在确认有大文件需求时再实施。

## 故障排查

### 问题：数据集列表为空
- 检查 `public/projecthub/index.json` 是否存在
- 检查 JSON 格式是否正确

### 问题：下载失败
- 检查 H5AD 文件是否存在于 `public/projecthub/` 目录
- 检查文件权限
- 如果使用符号链接，检查目标文件是否存在

### 问题：加载失败
- 检查 H5AD 文件格式是否正确
- 检查浏览器控制台错误信息
- 确认文件包含必要的降维坐标和注释信息
