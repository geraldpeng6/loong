#!/usr/bin/env node
import { spawn, execSync } from "child_process";
import { createInterface } from "readline";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import assert from "assert/strict";
import net from "net";
import WebSocket from "ws";

// Check if pi is installed
try {
  execSync("which pi", { stdio: "ignore" });
} catch {
  console.log("[test] Skipping: pi is not installed");
  console.log("[test] Install: npm install -g @mariozechner/pi-coding-agent");
  process.exit(0);
}

const getFreePort = () =>
  new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, () => {
      const address = srv.address();
      const port = typeof address === "object" && address ? address.port : null;
      if (!port) {
        srv.close(() => reject(new Error("Failed to allocate port")));
        return;
      }
      srv.close(() => resolve(port));
    });
  });

const ROOT = process.cwd();
const TEMP_ROOT = mkdtempSync(join(tmpdir(), "loong-it-"));
const HOME_DIR = join(TEMP_ROOT, "home");
const STATE_DIR = join(TEMP_ROOT, "state");
const AGENTS_DIR = join(HOME_DIR, ".pi", "agent", "agents");
const PORT = Number(process.env.PORT) || (await getFreePort());
const PASSWORD = "testpass";

mkdirSync(STATE_DIR, { recursive: true });
mkdirSync(AGENTS_DIR, { recursive: true });

writeFileSync(
  join(STATE_DIR, "config.json"),
  JSON.stringify(
    {
      defaultAgent: "jarvis",
    },
    null,
    2,
  ),
);

writeFileSync(
  join(AGENTS_DIR, "jarvis.md"),
  `---\nname: jarvis\nnameZh: 贾维斯\nnameEn: Jarvis\ndescription: Test agent\ntools: read, bash\nnoSkills: true\n---\nYou are a test agent.\n`,
);

const serverEnv = {
  ...process.env,
  PORT: String(PORT),
  PI_CMD: "pi",
  HOME: HOME_DIR,
  LOONG_STATE_DIR: STATE_DIR,
  LOONG_CONFIG_PATH: join(STATE_DIR, "config.json"),
  LOONG_PASSWORD: PASSWORD,
  LOONG_TASK_TIMEOUT_MS: "5000",
  LOONG_AGENT_RESTART_MS: "-1",
};

const server = spawn("pnpm", ["--filter", "loong-server", "start"], {
  cwd: ROOT,
  env: serverEnv,
  stdio: ["ignore", "pipe", "pipe"],
});

const waitForReady = () =>
  new Promise((resolve, reject) => {
    const rl = createInterface({ input: server.stdout });
    const timer = setTimeout(() => {
      rl.close();
      reject(new Error("Server start timeout"));
    }, 10000);

    rl.on("line", (line) => {
      if (line.includes("listening on")) {
        clearTimeout(timer);
        rl.close();
        resolve();
      }
    });

    server.on("exit", (code) => {
      clearTimeout(timer);
      rl.close();
      reject(new Error(`Server exited early (${code})`));
    });
  });

const waitForWsMessage = (ws, predicate, timeoutMs = 5000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("WebSocket timeout"));
    }, timeoutMs);

    const onMessage = (data) => {
      let parsed;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (predicate(parsed)) {
        cleanup();
        resolve(parsed);
      }
    };

    const onError = (err) => {
      cleanup();
      reject(err);
    };

    const onClose = () => {
      cleanup();
      reject(new Error("WebSocket closed"));
    };

    const cleanup = () => {
      clearTimeout(timer);
      ws.off("message", onMessage);
      ws.off("error", onError);
      ws.off("close", onClose);
    };

    ws.on("message", onMessage);
    ws.on("error", onError);
    ws.on("close", onClose);
  });

const waitForWsClose = (ws, timeoutMs = 5000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("WebSocket close timeout"));
    }, timeoutMs);
    ws.on("close", (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason });
    });
    ws.on("error", reject);
  });

const sendWsRequest = async (ws, type, payload = {}, timeoutMs = 10000) => {
  const id = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  ws.send(JSON.stringify({ type, id, ...payload }));
  return waitForWsMessage(ws, (msg) => msg.type === "response" && msg.id === id, timeoutMs);
};

const cleanup = async () => {
  if (server.exitCode === null && server.signalCode === null && !server.killed) {
    server.kill("SIGTERM");
  }
  await new Promise((resolve) => {
    if (server.exitCode !== null || server.signalCode !== null) {
      resolve();
      return;
    }
    server.once("exit", resolve);
  });
  try {
    rmSync(TEMP_ROOT, { recursive: true, force: true });
  } catch {
    // ignore
  }
};

try {
  await waitForReady();

  const basicAuth = Buffer.from(`user:${PASSWORD}`).toString("base64");
  const authHeaders = { Authorization: `Basic ${basicAuth}` };

  const healthUnauth = await fetch(`http://localhost:${PORT}/health`);
  assert.equal(healthUnauth.status, 401);

  const healthAuth = await fetch(`http://localhost:${PORT}/health`, { headers: authHeaders });
  assert.equal(healthAuth.status, 200);
  const healthPayload = await healthAuth.json();
  assert.equal(healthPayload.ok, true);

  const traversalResp = await fetch(`http://localhost:${PORT}/%2e%2e/package.json`, {
    headers: authHeaders,
  });
  assert.equal(traversalResp.status, 404);

  const wsUnauth = new WebSocket(`ws://localhost:${PORT}/ws`);
  const closed = await waitForWsClose(wsUnauth);
  assert.equal(closed.code, 1008);

  const wsAuth = new WebSocket(`ws://localhost:${PORT}/ws?password=${PASSWORD}`);
  await waitForWsMessage(wsAuth, (msg) => msg.type === "gateway_ready");

  const initialSessions = await sendWsRequest(wsAuth, "list_sessions");
  assert.ok(Array.isArray(initialSessions?.data?.sessions));

  const notifyWaiter = waitForWsMessage(
    wsAuth,
    (msg) => msg.type === "gateway_message" && msg.text.includes("ping"),
  );
  const notifyResp = await fetch(`http://localhost:${PORT}/api/notify`, {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({ text: "ping", agentId: "jarvis", scope: "agent" }),
  });
  assert.equal(notifyResp.status, 200);
  const notifyPayload = await notifyResp.json();
  assert.equal(notifyPayload.sentCount, 1);
  const notifyMsg = await notifyWaiter;
  assert.ok(notifyMsg.text);

  wsAuth.send(JSON.stringify({ type: "prompt", message: "hello" }));
  const agentEnd = await waitForWsMessage(wsAuth, (msg) => msg.type === "agent_end", 15000);
  assert.ok(Array.isArray(agentEnd.messages));

  const sessionsResp = await sendWsRequest(wsAuth, "list_sessions", { force: true });
  const sessions = sessionsResp?.data?.sessions || [];
  assert.ok(sessions.length >= 1);
  const currentSession = sessions.find((entry) => entry.isCurrent) || sessions[0];
  assert.ok(currentSession?.path);

  const renameResp = await sendWsRequest(wsAuth, "rename_session", {
    sessionPath: currentSession.path,
    label: "renamed session",
  });
  assert.equal(renameResp.success, true);
  const renamedPath = renameResp?.data?.sessionPath;
  assert.ok(renamedPath);

  wsAuth.send(JSON.stringify({ type: "prompt", message: "new hello" }));
  const agentEndNew = await waitForWsMessage(wsAuth, (msg) => msg.type === "agent_end", 15000);
  assert.ok(Array.isArray(agentEndNew.messages));

  const sessionsAfterNew = await sendWsRequest(wsAuth, "list_sessions", { force: true });
  const sessionsAfter = sessionsAfterNew?.data?.sessions || [];
  assert.ok(sessionsAfter.length >= 2);

  const deleteResp = await sendWsRequest(wsAuth, "delete_session", {
    sessionPath: renamedPath,
  });
  assert.equal(deleteResp.success, true);

  wsAuth.close();

  console.log("Integration tests passed.");
  await cleanup();
} catch (err) {
  console.error(`Integration tests failed: ${err.message}`);
  await cleanup();
  process.exitCode = 1;
}
