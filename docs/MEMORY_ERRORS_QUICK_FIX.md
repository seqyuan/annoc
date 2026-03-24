# 内存错误快速修复指南

## 两种常见错误

### 1. PREFLIGHT 错误（文件上传失败）
```
RangeError: Array buffer allocation failed
```
**原因**：文件太大，超过浏览器内存限制（2-4GB）

**解决方案**：
```r
# 在 R 中精简 Seurat 对象
seurat_slim <- DietSeurat(
  seurat_obj,
  counts = FALSE,
  data = TRUE,
  scale.data = FALSE
)
saveRDS(seurat_slim, "slim.rds")
```

### 2. EXPLORE 错误（运行时崩溃）
```
RuntimeError: Aborted()
```
**原因**：WASM 内存不足

**解决方案**：
- ✅ 已修复：降低线程数
- ✅ 已修复：自动清理内存
- 用户操作：关闭其他标签页，使用 Chrome

## 文件大小建议

| 文件大小 | 状态 | 建议 |
|---------|------|------|
| < 500 MB | ✅ 安全 | 直接使用 |
| 500 MB - 1 GB | ⚠️ 注意 | 关闭其他标签 |
| 1 - 2 GB | ⚠️ 风险 | 精简数据 |
| > 2 GB | ❌ 失败 | **必须精简** |

## 最佳实践

1. **优先使用 H5AD 格式**（比 RDS 节省 40-50% 内存）
2. **使用 DietSeurat** 移除不必要的数据
3. **大数据集降采样**（>50万细胞 → 10-20万）
4. **使用 Chrome/Edge 浏览器**

详细文档：`docs/EXPLORE_MEMORY_ISSUE.md`
