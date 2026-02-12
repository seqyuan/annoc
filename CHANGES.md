# 本地仓库与 GitHub 远程仓库的差异分析

## 版本信息
- **远程版本**: v0.1.2
- **本地版本**: v0.2.0

## 关键差异汇总

### 1. 🔧 **核心修复：COEP/CORP 头部配置**

**文件**: `public/serviceworker.js`

**远程版本 (v0.1.2)**:
```javascript
newHeaders.set("Cross-Origin-Embedder-Policy", "require-corp");
newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
// 缺少 Cross-Origin-Resource-Policy 设置
```

**本地版本 (v0.2.0)**:
```javascript
newHeaders.set("Cross-Origin-Embedder-Policy", "require-corp");
newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
newHeaders.set("Cross-Origin-Resource-Policy", "same-origin");  // ✅ 新增
```

**影响**:
- ✅ **修复了 JavaScript chunk 文件被阻止加载的问题**
- ✅ **解决了 "Unexpected token '<'" 错误**
- ✅ **确保 SharedArrayBuffer 在所有浏览器中正常工作**

---

### 2. 🗑️ **简化：移除 ProjectHub 功能**

**文件**: `src/components/LoadExplore/index.js`

**远程版本 (v0.1.2)**:
- 支持 ProjectHub、H5AD、RDS、ZippedArtifactdb 等多种格式
- 包含从服务器加载预配置数据集的功能
- 默认 Tab 是 "ProjectHub"

**本地版本 (v0.2.0)**:
- **仅保留 H5AD 和 RDS 两种格式**
- **移除了 ProjectHub 相关的所有代码**
  - 删除 `projecthubSel`, `projecthubEntries`, `projecthubLoading`, `projecthubError` 状态
  - 删除 `handleProjectHubSelect` 函数
  - 删除 ProjectHub Tab UI
- **移除了 ZippedArtifactdb 支持**
  - 删除 `ZippedADBCard` 组件导入
  - 删除 `JSZip` 和 `searchZippedArtifactdb` 导入
- **默认 Tab 改为 "H5AD"**

**影响**:
- ✅ **简化了用户界面，更专注于 H5AD 和 RDS 格式**
- ✅ **减少了依赖和代码复杂度**
- ⚠️ **用户无法再从服务器加载预配置数据集**

---

### 3. 🎯 **增强：智能默认注释选择**

**文件**: `src/components/ExploreMode/index.js`

**远程版本 (v0.1.2)**:
```javascript
// 简单的默认选择逻辑
if (categorical_annos.indexOf(default_cluster) !== -1) {
  def_anno = default_cluster;
} else if (categorical_annos.indexOf("cluster") !== -1) {
  def_anno = "cluster";
} else if (categorical_annos.indexOf("clusters") !== -1) {
  def_anno = "clusters";
}
```

**本地版本 (v0.2.0)**:
```javascript
// 优先级选择逻辑（更智能）
// Priority 1: celltype or contains celltype
// Priority 2: subtype
// Priority 3: seurat_clusters
// Priority 4: leiden related
// Priority 5: default_cluster, cluster, or clusters
```

**影响**:
- ✅ **自动优先选择生物学上更有意义的注释（celltype > subtype > seurat_clusters > leiden > clusters）**
- ✅ **提升用户体验，减少手动调整**

---

### 4. 🎨 **增强：智能降维方法选择**

**文件**: `src/components/ExploreMode/index.js`

**远程版本 (v0.1.2)**:
```javascript
setSelectedRedDim(Object.keys(resp)[0]); // 简单选择第一个
```

**本地版本 (v0.2.0)**:
```javascript
// 优先级选择：UMAP > t-SNE > 其他
const umapKey = keys.find(k => k.toLowerCase().includes('umap'));
if (umapKey) {
  defaultKey = umapKey;
} else {
  const tsneKey = keys.find(k => {
    const lower = k.toLowerCase();
    return lower.includes('tsne') || lower.includes('t-sne');
  });
  if (tsneKey) {
    defaultKey = tsneKey;
  }
}
```

**影响**:
- ✅ **自动优先选择 UMAP（现代单细胞分析的标准）**
- ✅ **UMAP 不可用时自动选择 t-SNE**
- ✅ **提升可视化体验**

---

### 5. 🔄 **新增：Subcluster 支持**

**文件**: `src/workers/explorer.worker.js`

**远程版本 (v0.1.2)**:
- 不支持 subcluster 结果的特殊处理

**本地版本 (v0.2.0)**:
```javascript
// 新增 subcluster 支持
if (subcluster_results[annotation]) {
  return subcluster_results[annotation].labels;
}
```

**影响**:
- ✅ **支持对特定细胞群进行二次聚类分析**
- ✅ **增强分析灵活性**

---

### 6. 🖥️ **UI 增强：可折叠 Cluster Annotation**

**文件**: `src/components/ExploreMode/index.js`

**远程版本 (v0.1.2)**:
- 固定的双面板布局

**本地版本 (v0.2.0)**:
- 新增 `clusterAnnotationCollapsed` 状态
- 支持折叠/展开 Cluster Annotation 面板
- 折叠时提供全屏可视化体验

**影响**:
- ✅ **提供更大的可视化区域**
- ✅ **改善大屏幕用户体验**

---

### 7. 📦 **新增文件**（本地独有）

本地仓库新增了以下文件：

1. **`server.js`** - 自定义 HTTP 服务器
   - 提供 COOP/COEP 头部支持
   - 替代 Service Worker 的部署方案

2. **`service-production.sh`** - 生产环境启动脚本
   - 自动化部署流程
   - 适合 Cloudflare 代理访问

3. **`clear-cache.html`** - 缓存清除工具页面
   - 帮助用户清除 Service Worker 和浏览器缓存

4. **`clear-cloudflare-cache.sh`** - Cloudflare 缓存清除脚本
   - 通过 API 清除 CDN 缓存

---

## 关于 H5AD 加载问题的根本原因

### 远程版本 (v0.1.2) 的问题

1. **缺少 `Cross-Origin-Resource-Policy: same-origin` 头部**
   - 导致 JavaScript chunk 文件被 COEP 策略阻止
   - 浏览器显示错误：`Uncaught SyntaxError: Unexpected token '<'`
   - 实际原因：请求 JS 文件时收到了 HTML (404 页面)

2. **Cloudflare 缓存了旧版本**
   - 即使更新代码，CDN 仍返回旧的缓存内容
   - 需要手动清除 Cloudflare 缓存

### 本地版本 (v0.2.0) 的修复

1. ✅ **添加了完整的 Cross-Origin 头部配置**
2. ✅ **提供了 `server.js` 确保本地测试正常**
3. ✅ **提供了缓存清除工具**

---

## 建议的部署流程

### 步骤 1：清除 Cloudflare 缓存
```bash
# 使用脚本
export CF_ZONE_ID="your_zone_id"
export CF_API_TOKEN="your_api_token"
bash clear-cloudflare-cache.sh

# 或使用 Cloudflare Dashboard
# 登录 → 选择域名 → Caching → Purge Everything
```

### 步骤 2：重新构建
```bash
npm run build
```

### 步骤 3：部署
```bash
# 使用生产脚本启动
bash service-production.sh

# 或手动启动
node server.js
```

### 步骤 4：验证
1. 清除浏览器缓存（Ctrl+Shift+Delete）
2. 访问 https://annocluster.seqyuan.cn/
3. 选择 H5AD 文件
4. 检查右侧是否显示加载信息

---

## 总结

本地版本 (v0.2.0) 相比远程版本 (v0.1.2) 的主要改进：

### ✅ 修复的问题
- **COEP/CORP 头部配置问题** → 解决 JS 加载失败
- **H5AD 文件加载不显示** → 确保 worker 正常通信

### ✨ 新增功能
- 智能默认注释选择（celltype 优先）
- 智能降维方法选择（UMAP 优先）
- Subcluster 支持
- 可折叠面板 UI

### 🗑️ 移除功能
- ProjectHub 预配置数据集
- ZippedArtifactdb 支持

### 🛠️ 新增工具
- 自定义 HTTP 服务器
- 缓存清除工具
- 部署脚本

---

**下一步**：将本地更改推送到 GitHub 远程仓库，发布 v0.2.0 版本。
