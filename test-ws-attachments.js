#!/usr/bin/env node
/**
 * WebSocket 附件消息测试脚本
 *
 * 使用方法:
 * 1. 先上传文件获取 fileId: curl -F "file=@image.png" http://localhost:17800/api/upload
 * 2. 运行测试: node test-ws-attachments.js <fileId>
 */

import WebSocket from "ws";

const WS_URL = process.env.WS_URL || "ws://localhost:17800/ws";
const PASSWORD = process.env.LOONG_PASSWORD || "";

const fileId = process.argv[2];

if (!fileId) {
  console.error("Usage: node test-ws-attachments.js <fileId>");
  console.error("");
  console.error("First upload a file to get the fileId:");
  console.error('  curl -F "file=@image.png" http://localhost:17800/api/upload');
  process.exit(1);
}

console.log("=== WebSocket Attachment Test ===");
console.log("Connecting to:", WS_URL);

const wsUrl = PASSWORD ? `${WS_URL}?password=${PASSWORD}` : WS_URL;
const ws = new WebSocket(wsUrl);

ws.on("open", () => {
  console.log("✅ Connected to WebSocket");
  console.log("");

  // 发送带附件的消息
  const message = {
    type: "prompt_with_attachments",
    message: "Please analyze this file",
    attachments: [
      {
        fileId: fileId,
        fileName: "test-file.png",
        mimeType: "image/png",
        size: 12345,
      },
    ],
  };

  console.log("Sending message with attachments:");
  console.log(JSON.stringify(message, null, 2));
  console.log("");

  ws.send(JSON.stringify(message));
});

ws.on("message", (data) => {
  try {
    const payload = JSON.parse(data.toString());
    console.log("Received:", payload.type);

    if (payload.type === "gateway_ready") {
      console.log("✅ Gateway ready, agents:", payload.agents?.length || 0);
    }

    if (payload.type === "error") {
      console.error("❌ Error:", payload.error);
    }

    if (payload.type === "gateway_agent_status") {
      console.log("Agent status - busy:", payload.busy, "queue:", payload.queueLength);
    }

    if (payload.type === "message_start") {
      console.log("✅ Message started");
    }

    if (payload.type === "message_end") {
      console.log("✅ Message ended");
      console.log("");
      console.log("Test completed successfully!");
      ws.close();
      process.exit(0);
    }
  } catch (err) {
    console.error("Failed to parse message:", err.message);
  }
});

ws.on("error", (err) => {
  console.error("❌ WebSocket error:", err.message);
  process.exit(1);
});

ws.on("close", () => {
  console.log("Connection closed");
});

// 超时处理
setTimeout(() => {
  console.error("❌ Test timeout");
  ws.close();
  process.exit(1);
}, 30000);
