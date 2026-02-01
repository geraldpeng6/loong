#!/usr/bin/env node
import { spawn } from "child_process";
import { createInterface } from "readline";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import assert from "assert/strict";
import WebSocket from "ws";

const ROOT = process.cwd();
const TEMP_ROOT = mkdtempSync(join(tmpdir(), "loong-it-"));
const LOONG_HOME = join(TEMP_ROOT, "home");
const LOONG_SPACE = join(TEMP_ROOT, "space");
const AGENT_DIR = join(LOONG_HOME, "agents", "jarvis");
const PORT = 17801;
const PASSWORD = "testpass";

mkdirSync(AGENT_DIR, { recursive: true });

writeFileSync(
	join(LOONG_HOME, "config.json"),
	JSON.stringify(
		{
			agentsDir: "agents",
			defaultAgent: "jarvis",
		},
		null,
		2,
	),
);

writeFileSync(
	join(AGENT_DIR, "agent.json"),
	JSON.stringify(
		{
			id: "jarvis",
			name: "Jarvis",
			keywords: ["jarvis"],
			systemPrompt: "You are a mock agent.",
			model: { provider: "mock", modelId: "mock-1" },
			thinkingLevel: "low",
			sessionDir: "sessions",
			tools: [],
		},
		null,
		2,
	),
);

const mockPath = join(ROOT, "scripts", "mock-pi.js");
const serverEnv = {
	...process.env,
	PORT: String(PORT),
	PI_CMD: `node ${mockPath}`,
	LOONG_HOME,
	LOONG_SPACE,
	LOONG_PASSWORD: PASSWORD,
	LOONG_TASK_TIMEOUT_MS: "5000",
	LOONG_AGENT_RESTART_MS: "-1",
};

const server = spawn("node", ["src/server.js"], {
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

const cleanup = async () => {
	if (!server.killed) {
		server.kill("SIGTERM");
	}
	await new Promise((resolve) => server.on("exit", resolve));
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

	wsAuth.send(JSON.stringify({ type: "prompt", message: "/notify" }));
	const extensionNotify = await waitForWsMessage(
		wsAuth,
		(msg) => msg.type === "gateway_message" && msg.text.includes("notify ok"),
	);
	assert.ok(extensionNotify.text);

	wsAuth.send(JSON.stringify({ type: "prompt", message: "hello" }));
	const agentEnd = await waitForWsMessage(wsAuth, (msg) => msg.type === "agent_end");
	assert.ok(Array.isArray(agentEnd.messages));
	wsAuth.close();

	console.log("Integration tests passed.");
	await cleanup();
} catch (err) {
	console.error(`Integration tests failed: ${err.message}`);
	await cleanup();
	process.exitCode = 1;
}
