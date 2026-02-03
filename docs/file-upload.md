# 文件上传功能文档

## 概述

Loong 现在支持通用文件上传功能，可用于 WebUI 和 iMessage 等多个通道。文件上传使用独立的 HTTP API，然后通过 WebSocket 消息引用文件 ID。

## 环境变量配置

```bash
# 文件上传目录（默认：~/.loong/runtime/uploads）
export LOONG_UPLOAD_DIR=/path/to/uploads

# 最大文件大小（字节，默认：10MB）
export LOONG_UPLOAD_MAX_SIZE=$((10*1024*1024))

# 允许的文件类型（逗号分隔的 MIME 类型前缀）
export LOONG_UPLOAD_ALLOWED_TYPES="image/,audio/,video/,application/pdf,text/"

# 是否允许未知类型（默认：true）
export LOONG_UPLOAD_ALLOW_UNKNOWN=true
```

## HTTP API

### POST /api/upload

上传文件到服务器。

**请求格式**: `multipart/form-data`

**参数**:

- `file` (required): 要上传的文件
- `source` (optional): 上传来源 (`web`, `imessage`, `api`)
- `sessionId` (optional): 关联的会话 ID
- `userId` (optional): 关联的用户 ID

**示例**:

```bash
curl -F "file=@image.png" \
     -F "source=web" \
     http://localhost:17800/api/upload
```

**响应**:

```json
{
  "success": true,
  "file": {
    "fileId": "abc123...",
    "fileName": "image.png",
    "mimeType": "image/png",
    "size": 12345,
    "url": "http://localhost:17800/api/files/abc123...",
    "uploadedAt": "2024-01-15T10:30:00Z"
  }
}
```

### GET /api/files/:fileId

获取或下载已上传的文件。

**参数**:

- `download=true` (optional): 强制下载而不是预览

**示例**:

```bash
# 预览文件
curl http://localhost:17800/api/files/abc123

# 下载文件
curl -O -J "http://localhost:17800/api/files/abc123?download=true"
```

### DELETE /api/files/:fileId

删除已上传的文件。

**示例**:

```bash
curl -X DELETE http://localhost:17800/api/files/abc123
```

## WebSocket 消息

### 带附件的 Prompt

发送包含文件附件的消息给 Agent。

**消息格式**:

```json
{
  "type": "prompt_with_attachments",
  "message": "请分析这些文件",
  "attachments": [
    {
      "fileId": "abc123...",
      "fileName": "chart.png",
      "mimeType": "image/png",
      "size": 12345,
      "url": "http://localhost:17800/api/files/abc123..."
    }
  ]
}
```

**字段说明**:

- `type`: 固定为 `"prompt_with_attachments"`
- `message`: 文本消息内容
- `attachments`: 附件列表，每个附件包含：
  - `fileId`: 文件唯一标识（必需）
  - `fileName`: 文件名
  - `mimeType`: MIME 类型
  - `size`: 文件大小（字节）
  - `url`: 文件访问 URL

### 向后兼容

纯文本消息格式仍然支持：

```json
{
  "type": "prompt",
  "message": "Hello"
}
```

## 文件存储结构

上传的文件存储在以下目录结构中：

```
~/.loong/runtime/uploads/
├── files/
│   └── 2024/
│       └── 01/
│           └── 15/
│               └── abc123...-filename.png
└── metadata/
    └── abc123....json
```

元数据文件包含文件的完整信息：

```json
{
  "fileId": "abc123...",
  "fileName": "image.png",
  "mimeType": "image/png",
  "size": 12345,
  "storagePath": "2024/01/15/abc123...-image.png",
  "uploadedAt": "2024-01-15T10:30:00Z",
  "source": "web"
}
```

## Agent 接收格式

Agent 会收到包含附件内容的 prompt 消息。附件内容会被转换为 base64 格式嵌入到消息中：

```xml
用户消息内容

<attachments>
<image mimeType="image/png" fileName="chart.png">base64encodedcontent...</image>
<audio mimeType="audio/mpeg" fileName="recording.mp3">base64encodedcontent...</audio>
<video mimeType="video/mp4" fileName="demo.mp4">base64encodedcontent...</video>
<file mimeType="application/pdf" fileName="document.pdf" size="12345">base64encodedcontent...</file>
</attachments>
```

## 支持的文件类型

默认支持的文件类型包括：

- **图片**: `image/*` (png, jpg, gif, webp, etc.)
- **音频**: `audio/*` (mp3, wav, m4a, etc.)
- **视频**: `video/*` (mp4, mov, avi, etc.)
- **文档**:
  - `application/pdf`
  - `text/*`
  - Microsoft Office 文档
  - 其他常见文档格式

## iMessage 附件支持

iMessage 通道现在也支持接收附件：

1. 当用户通过 iMessage 发送图片/视频/音频时，附件会被自动下载并保存到文件存储
2. 文件元数据会传递给 Agent 进行处理
3. 需要在环境变量中启用附件支持：

```bash
export IMESSAGE_ATTACHMENTS=1
```

## WebUI 使用说明

WebUI 现在支持拖拽上传和文件选择：

1. **拖拽上传**: 直接将文件拖拽到输入框区域
2. **点击附件按钮**: 点击输入框左侧的回形针图标选择文件
3. **预览**: 图片文件会显示预览缩略图
4. **发送**: 点击发送按钮或按 Enter 键发送消息（文件会自动上传）

## 测试

运行测试脚本验证功能：

```bash
# 测试文件上传 API
./test-file-upload.sh

# 测试 WebSocket 附件消息（需要先上传文件获取 fileId）
node test-ws-attachments.js <fileId>
```

## 注意事项

1. **文件大小限制**: 默认最大 10MB，可通过 `LOONG_UPLOAD_MAX_SIZE` 调整
2. **存储空间**: 上传的文件会持久化存储，需要定期清理或设置自动清理
3. **安全性**: 文件上传端点默认需要认证（如果设置了 `LOONG_PASSWORD`）
4. **并发**: 支持同时上传多个文件，但每个文件大小不能超过限制
