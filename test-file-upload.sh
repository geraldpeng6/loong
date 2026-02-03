#!/bin/bash
# 文件上传功能测试脚本

set -e

echo "=== File Upload Feature Test ==="
echo ""

# 检查服务器是否运行
if ! curl -s http://localhost:17800/health > /dev/null 2>&1; then
    echo "❌ Server is not running on http://localhost:17800"
    echo "   Please start the server first: pnpm start"
    exit 1
fi

echo "✅ Server is running"
echo ""

# 创建测试文件
echo "Creating test files..."
echo "Hello, World!" > /tmp/test-text.txt
echo '{"test": "data"}' > /tmp/test-json.json

# 测试文本文件上传
echo ""
echo "Testing text file upload..."
RESPONSE=$(curl -s -F "file=@/tmp/test-text.txt" -F "source=web" http://localhost:17800/api/upload)
echo "Response: $RESPONSE"

if echo "$RESPONSE" | grep -q "\"success\":true"; then
    echo "✅ Text file upload successful"
    FILE_ID=$(echo "$RESPONSE" | grep -o '"fileId":"[^"]*"' | cut -d'"' -f4)
    echo "   File ID: $FILE_ID"
    
    # 测试文件下载
    echo ""
    echo "Testing file download..."
    curl -s -o /tmp/downloaded-text.txt "http://localhost:17800/api/files/$FILE_ID"
    if diff /tmp/test-text.txt /tmp/downloaded-text.txt > /dev/null; then
        echo "✅ File download successful and content matches"
    else
        echo "❌ File download failed or content mismatch"
    fi
    
    # 测试文件删除
    echo ""
    echo "Testing file deletion..."
    DELETE_RESPONSE=$(curl -s -X DELETE "http://localhost:17800/api/files/$FILE_ID")
    echo "Response: $DELETE_RESPONSE"
    if echo "$DELETE_RESPONSE" | grep -q "\"success\":true"; then
        echo "✅ File deletion successful"
    else
        echo "❌ File deletion failed"
    fi
else
    echo "❌ Text file upload failed"
fi

# 测试 JSON 文件上传
echo ""
echo "Testing JSON file upload..."
RESPONSE=$(curl -s -F "file=@/tmp/test-json.json" -F "source=api" http://localhost:17800/api/upload)
echo "Response: $RESPONSE"

if echo "$RESPONSE" | grep -q "\"success\":true"; then
    echo "✅ JSON file upload successful"
else
    echo "❌ JSON file upload failed"
fi

# 清理测试文件
rm -f /tmp/test-text.txt /tmp/test-json.json /tmp/downloaded-text.txt

echo ""
echo "=== Test Complete ==="
