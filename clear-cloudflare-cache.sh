#!/bin/bash
# Cloudflare 缓存清除脚本
# 使用方法：
# 1. 设置环境变量：
#    export CF_ZONE_ID="your_zone_id"
#    export CF_API_TOKEN="your_api_token"
# 2. 运行：bash clear-cloudflare-cache.sh

# 检查环境变量
if [ -z "$CF_ZONE_ID" ] || [ -z "$CF_API_TOKEN" ]; then
    echo "错误：请先设置环境变量"
    echo ""
    echo "使用方法："
    echo "1. 获取 Zone ID："
    echo "   登录 Cloudflare Dashboard → 选择域名 → 右下角 'API' 部分找到 Zone ID"
    echo ""
    echo "2. 创建 API Token："
    echo "   Cloudflare Dashboard → My Profile → API Tokens → Create Token"
    echo "   模板选择 'Edit zone DNS' 或自定义权限（需要 Cache Purge 权限）"
    echo ""
    echo "3. 设置环境变量："
    echo "   export CF_ZONE_ID=\"your_zone_id\""
    echo "   export CF_API_TOKEN=\"your_api_token\""
    echo ""
    echo "4. 运行脚本："
    echo "   bash clear-cloudflare-cache.sh"
    exit 1
fi

echo "正在清除 Cloudflare 缓存..."

# 调用 Cloudflare API 清除所有缓存
response=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache" \
     -H "Authorization: Bearer ${CF_API_TOKEN}" \
     -H "Content-Type: application/json" \
     --data '{"purge_everything":true}')

# 检查结果
if echo "$response" | grep -q '"success":true'; then
    echo "✓ 缓存清除成功！"
    echo "请等待 30-60 秒让清除操作生效"
else
    echo "✗ 缓存清除失败"
    echo "响应：$response"
fi
