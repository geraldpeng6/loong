import { createServer } from "http";
import {
	mkdirSync,
	createReadStream,
	statSync,
	readFileSync,
	writeFileSync,
	existsSync,
	readdirSync,
	renameSync,
	copyFileSync,
	unlinkSync,
} from "fs";
import { dirname, join, extname, resolve, basename, relative, sep } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { homedir } from "os";
import { createInterface } from "readline";
import { WebSocketServer, WebSocket } from "ws";
import { startIMessageBridge } from "./imessage.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 17800);
const PI_CMD = process.env.PI_CMD || "pi";
const PI_CWD = process.env.PI_CWD || process.cwd();
const LOONG_HOME =
	process.env.LOONG_HOME || process.env.JARVIS_HOME || join(homedir(), ".loong");
const LOONG_SPACE = process.env.LOONG_SPACE || join(homedir(), "loongspace");
process.env.LOONG_SPACE = LOONG_SPACE;
const LOONG_CONFIG_PATH =
	process.env.LOONG_CONFIG_PATH ||
	process.env.JARVIS_CONFIG_PATH ||
	join(LOONG_HOME, "config.json");
const LOONG_CMD_PREFIX =
	process.env.LOONG_CMD_PREFIX || process.env.JARVIS_CMD_PREFIX || "!";
const LOONG_PASSWORD = process.env.LOONG_PASSWORD || process.env.JARVIS_PASSWORD || "";
const PASSWORD_REQUIRED = Boolean(LOONG_PASSWORD);
const WS_HEARTBEAT_MS = Number(process.env.LOONG_WS_HEARTBEAT_MS || 30000);
const TASK_TIMEOUT_MS = Number(process.env.LOONG_TASK_TIMEOUT_MS || 10 * 60 * 1000);
const SESSION_CACHE_TTL_MS = Number(process.env.LOONG_SESSION_CACHE_TTL_MS || 3000);

const IMESSAGE_ENABLED = ["1", "true", "yes"].includes(
	String(process.env.IMESSAGE_ENABLED || "").toLowerCase(),
);
const IMESSAGE_CLI_PATH = process.env.IMESSAGE_CLI_PATH || "imsg";
const IMESSAGE_DB_PATH = process.env.IMESSAGE_DB_PATH;
const IMESSAGE_SERVICE = process.env.IMESSAGE_SERVICE || "auto";
const IMESSAGE_REGION = process.env.IMESSAGE_REGION || "US";
const IMESSAGE_ATTACHMENTS = ["1", "true", "yes"].includes(
	String(process.env.IMESSAGE_ATTACHMENTS || "").toLowerCase(),
);
const IMESSAGE_SESSION_MODE = (process.env.IMESSAGE_SESSION_MODE || "shared").toLowerCase();
const IMESSAGE_PER_CHAT = IMESSAGE_SESSION_MODE === "per-chat";
const IMESSAGE_ALLOWLIST = (process.env.IMESSAGE_ALLOWLIST || "")
	.split(",")
	.map((entry) => entry.trim())
	.filter(Boolean);
const IMESSAGE_OUTBOUND_DIR =
	process.env.IMESSAGE_OUTBOUND_DIR || join(LOONG_HOME, "imessage-outbound");

const DEFAULT_GATEWAY_CONFIG = {
	agentsDir: "agents",
	defaultAgent: null,
	notifyOnStart: true,
	replyPrefixMode: "always",
	keywordMode: "prefix",
};

mkdirSync(LOONG_HOME, { recursive: true });
mkdirSync(LOONG_SPACE, { recursive: true });
if (IMESSAGE_ENABLED) {
	mkdirSync(IMESSAGE_OUTBOUND_DIR, { recursive: true });
}

const piCmdParts = PI_CMD.split(/\s+/).filter(Boolean);
const piCmd = piCmdParts[0];
const piBaseArgs = piCmdParts.slice(1);

const clients = new Set();
const webContexts = new Map();

const gatewayConfig = loadGatewayConfig();
const agents = new Map();
const agentList = [];
const defaultAgentId = initAgents(gatewayConfig);

if (!defaultAgentId) {
	console.error("[loong] no agents loaded; check config and agents directory");
	process.exit(1);
}

const publicDir = join(__dirname, "..", "public");

const parseRequestUrl = (req) => {
	const host = req.headers.host || "localhost";
	try {
		return new URL(req.url || "/", `http://${host}`);
	} catch {
		return null;
	}
};

const safeDecodeURIComponent = (value) => {
	try {
		return decodeURIComponent(value);
	} catch {
		return null;
	}
};

const resolvePublicFilePath = (pathname) => {
	if (!pathname) return null;
	const normalizedPath = pathname === "/" ? "/index.html" : pathname;
	const decodedPath = safeDecodeURIComponent(normalizedPath);
	if (!decodedPath || decodedPath.includes("\0")) return null;
	const publicRoot = resolve(publicDir);
	const resolvedPath = resolve(publicRoot, `.${decodedPath}`);
	if (resolvedPath !== publicRoot && !resolvedPath.startsWith(publicRoot + sep)) {
		return null;
	}
	return resolvedPath;
};

const getRequestPassword = (req, parsedUrl) => {
	const authHeader = req.headers.authorization;
	if (typeof authHeader === "string" && authHeader.trim()) {
		const trimmed = authHeader.trim();
		if (trimmed.toLowerCase().startsWith("bearer ")) {
			return trimmed.slice(7).trim();
		}
		if (trimmed.toLowerCase().startsWith("basic ")) {
			try {
				const decoded = Buffer.from(trimmed.slice(6), "base64").toString("utf8");
				const separator = decoded.indexOf(":");
				return separator >= 0 ? decoded.slice(separator + 1) : decoded;
			} catch {
				// ignore
			}
		}
	}
	const headerPassword = req.headers["x-loong-password"];
	if (typeof headerPassword === "string" && headerPassword.trim()) {
		return headerPassword.trim();
	}
	const url = parsedUrl || parseRequestUrl(req);
	const queryPassword = url?.searchParams?.get("password");
	if (queryPassword) return queryPassword;
	return "";
};

const isAuthorizedRequest = (req, parsedUrl) => {
	if (!PASSWORD_REQUIRED) return true;
	return getRequestPassword(req, parsedUrl) === LOONG_PASSWORD;
};

const sendUnauthorized = (res) => {
	res.writeHead(401, {
		"content-type": "text/plain",
		"www-authenticate": "Basic realm=\"loong\"",
	});
	res.end("Unauthorized");
};

const readBody = (req) => {
	return new Promise((resolve, reject) => {
		let body = "";
		req.on("data", (chunk) => { body += chunk; });
		req.on("end", () => {
			try {
				resolve(body ? JSON.parse(body) : {});
			} catch (e) {
				reject(e);
			}
		});
		req.on("error", reject);
	});
};

const server = createServer((req, res) => {
	const url = parseRequestUrl(req);
	if (!url) {
		res.writeHead(400);
		res.end();
		return;
	}

	if (!isAuthorizedRequest(req, url)) {
		sendUnauthorized(res);
		return;
	}

	if (url.pathname === "/health") {
		res.writeHead(200, { "content-type": "application/json" });
		res.end(
			JSON.stringify({
				ok: true,
				agents: agentList,
				defaultAgent: defaultAgentId,
			}),
		);
		return;
	}

	// POST /api/notify - 直接推送文字给所有 WebSocket 客户端
	if (url.pathname === "/api/notify" && req.method === "POST") {
		readBody(req)
			.then((body) => {
				const { text, agentId = defaultAgentId } = body;
				if (!text || typeof text !== "string") {
					res.writeHead(400, { "content-type": "application/json" });
					res.end(JSON.stringify({ error: "Missing or invalid 'text' field" }));
					return;
				}

				const agent = agents.get(agentId) || agents.get(defaultAgentId);
				if (!agent) {
					res.writeHead(404, { "content-type": "application/json" });
					res.end(JSON.stringify({ error: "Agent not found" }));
					return;
				}

				const formattedText = formatAgentReply(agent, text);
				const msg = JSON.stringify({ type: "gateway_message", text: formattedText });
				let sentCount = 0;

				for (const client of clients) {
					if (client.readyState === WebSocket.OPEN) {
						client.send(msg);
						sentCount++;
					}
				}

				console.log(`[loong] /api/notify sent to ${sentCount} clients: ${text.substring(0, 50)}...`);
				res.writeHead(200, { "content-type": "application/json" });
				res.end(JSON.stringify({ success: true, sentCount }));
			})
			.catch((err) => {
				res.writeHead(400, { "content-type": "application/json" });
				res.end(JSON.stringify({ error: "Invalid JSON body" }));
			});
		return;
	}

	// POST /api/ask - 发送给 LLM 处理，然后推送回复给客户端
	if (url.pathname === "/api/ask" && req.method === "POST") {
		readBody(req)
			.then(async (body) => {
				const { message, agentId = defaultAgentId, timeoutMs = 60000 } = body;
				if (!message || typeof message !== "string") {
					res.writeHead(400, { "content-type": "application/json" });
					res.end(JSON.stringify({ error: "Missing or invalid 'message' field" }));
					return;
				}

				const agent = agents.get(agentId) || agents.get(defaultAgentId);
				if (!agent) {
					res.writeHead(404, { "content-type": "application/json" });
					res.end(JSON.stringify({ error: "Agent not found" }));
					return;
				}

				// 检查 agent 是否忙碌
				if (agent.busy) {
					res.writeHead(503, { "content-type": "application/json" });
					res.end(JSON.stringify({ error: "Agent is busy, try again later", busy: true }));
					return;
				}

				console.log(`[loong] /api/ask processing: ${message.substring(0, 50)}...`);

				// 创建 Promise 等待回复
				const replyPromise = new Promise((resolve, reject) => {
					const timeout = setTimeout(() => {
						reject(new Error("Timeout waiting for agent response"));
					}, timeoutMs);

					enqueueAgentPrompt(agent, {
						source: "api",
						text: message,
						onReply: (reply) => {
							clearTimeout(timeout);
							resolve(reply);
						},
					});
				});

				try {
					const reply = await replyPromise;
					console.log(`[loong] /api/ask reply: ${reply.substring(0, 50)}...`);
					res.writeHead(200, { "content-type": "application/json" });
					res.end(JSON.stringify({ success: true, reply }));
				} catch (err) {
					res.writeHead(504, { "content-type": "application/json" });
					res.end(JSON.stringify({ error: err.message }));
				}
			})
			.catch((err) => {
				res.writeHead(400, { "content-type": "application/json" });
				res.end(JSON.stringify({ error: "Invalid JSON body" }));
			});
		return;
	}

	const filePath = resolvePublicFilePath(url.pathname);
	if (!filePath) {
		res.writeHead(404);
		res.end();
		return;
	}

	try {
		const stat = statSync(filePath);
		if (!stat.isFile()) {
			res.writeHead(404);
			res.end();
			return;
		}

		const ext = extname(filePath);
		const contentType = ext === ".html"
			? "text/html"
			: ext === ".js"
				? "text/javascript"
				: ext === ".css"
					? "text/css"
					: "application/octet-stream";

		res.writeHead(200, { "content-type": contentType });
		createReadStream(filePath).pipe(res);
	} catch {
		res.writeHead(404);
		res.end();
	}
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws, req) => {
	if (PASSWORD_REQUIRED && (!req || !isAuthorizedRequest(req))) {
		ws.close(1008, "Unauthorized");
		return;
	}
	ws.isAlive = true;
	ws.on("pong", () => {
		ws.isAlive = true;
	});
	clients.add(ws);
	webContexts.set(ws, { agentId: defaultAgentId });
	ws.send(
		JSON.stringify({
			type: "gateway_ready",
			agents: agentList,
			defaultAgent: defaultAgentId,
			activeAgent: defaultAgentId,
			loongHome: LOONG_HOME,
			jarvisHome: LOONG_HOME,
			loongSpace: LOONG_SPACE,
		}),
	);

	ws.on("message", async (data) => {
		let payload;
		try {
			payload = JSON.parse(data.toString());
		} catch {
			ws.send(JSON.stringify({ type: "error", error: "Invalid JSON" }));
			return;
		}

		if (!payload || typeof payload !== "object" || !payload.type) {
			ws.send(JSON.stringify({ type: "error", error: "Missing 'type' in message" }));
			return;
		}

		if (payload.type === "list_agents") {
			ws.send(
				JSON.stringify({
					type: "response",
					command: "list_agents",
					success: true,
					data: { agents: agentList, defaultAgent: defaultAgentId },
				}),
			);
			return;
		}

		const context = webContexts.get(ws) || { agentId: defaultAgentId };
		const currentAgent = agents.get(context.agentId) || agents.get(defaultAgentId);
		if (!currentAgent) {
			ws.send(JSON.stringify({ type: "error", error: "No agent available" }));
			return;
		}

		if (payload.type === "list_sessions") {
			await sendAgentRequest(currentAgent, { type: "get_state" }).catch(() => null);
			const entries = getSessionEntries(currentAgent);
			ws.send(
				JSON.stringify({
					type: "response",
					command: "list_sessions",
					success: true,
					data: { sessions: entries },
				}),
			);
			return;
		}

		if (payload.type === "prompt" && typeof payload.message === "string") {
			const { agent, remainder, switched } = resolveAgentFromText(
				payload.message,
				context.agentId,
			);

			if (agent && switched) {
				webContexts.set(ws, { agentId: agent.id });
				ws.send(
					JSON.stringify({
						type: "gateway_agent_switched",
						agent: { id: agent.id, name: agent.name, keywords: agent.keywords },
					}),
				);
			}

			const trimmed = remainder.trim();
			if (!trimmed) {
				sendGatewayMessage(ws, `已切换到 ${agent.name}`);
				return;
			}

			const command = resolveCommand(trimmed);
			const handled = command
				? await handleGatewayCommand({
					agent,
					command,
					respond: (replyText) => sendGatewayMessage(ws, replyText),
					sendPrompt: (promptText) =>
						enqueueAgentPrompt(agent, {
							source: "web",
							ws,
							text: promptText,
						}),
					contextKey: null,
				})
				: false;
			if (handled) {
				return;
			}

			enqueueAgentPrompt(agent, {
				source: "web",
				ws,
				text: trimmed,
			});
			return;
		}

		// Forward other RPC commands to current agent
		sendToPi(currentAgent, payload);
	});

	ws.on("close", () => {
		clients.delete(ws);
		webContexts.delete(ws);
	});
});

const heartbeatInterval = WS_HEARTBEAT_MS > 0
	? setInterval(() => {
		for (const client of wss.clients) {
			if (client.isAlive === false) {
				client.terminate();
				continue;
			}
			client.isAlive = false;
			client.ping();
		}
	}, WS_HEARTBEAT_MS)
	: null;

wss.on("close", () => {
	if (heartbeatInterval) {
		clearInterval(heartbeatInterval);
	}
});

const extractTextBlocks = (content) => {
	if (!content) return "";
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((block) => {
				if (!block) return "";
				if (block.type === "text") return block.text || "";
				if (block.type === "input_text") return block.text || "";
				return "";
			})
			.join("");
	}
	return "";
};

const extractAssistantText = (messages = []) => {
	const assistant = [...messages].reverse().find((msg) => msg?.role === "assistant");
	return assistant ? extractTextBlocks(assistant.content) : "";
};

const MEDIA_EXTENSION_MAP = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/jpg": "jpg",
	"image/gif": "gif",
	"image/webp": "webp",
	"audio/mpeg": "mp3",
	"audio/mp3": "mp3",
	"audio/wav": "wav",
	"audio/x-wav": "wav",
	"audio/mp4": "m4a",
	"video/mp4": "mp4",
	"video/quicktime": "mov",
	"video/webm": "webm",
	"application/pdf": "pdf",
};

const resolveMediaExtension = (mimeType, fileName) => {
	if (fileName) {
		const ext = extname(fileName).replace(".", "");
		if (ext) return ext;
	}
	if (mimeType && MEDIA_EXTENSION_MAP[mimeType]) {
		return MEDIA_EXTENSION_MAP[mimeType];
	}
	if (mimeType && mimeType.includes("/")) {
		return mimeType.split("/")[1];
	}
	return "bin";
};

const sanitizeFileName = (name) => {
	if (!name) return "attachment";
	return name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "attachment";
};

const writeOutboundMediaFile = ({ data, mimeType, fileName }) => {
	if (!data) return null;
	const extension = resolveMediaExtension(mimeType, fileName);
	const baseName = sanitizeFileName(fileName ? fileName.replace(/\.[^.]+$/, "") : "attachment");
	const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
	const resolvedName = `${baseName}-${suffix}.${extension}`;
	const filePath = join(IMESSAGE_OUTBOUND_DIR, resolvedName);
	writeFileSync(filePath, Buffer.from(data, "base64"));
	return filePath;
};

const resolveMediaPlaceholder = (mimeType) => {
	if (!mimeType) return "<media:attachment>";
	if (mimeType.startsWith("image/")) return "<media:image>";
	if (mimeType.startsWith("audio/")) return "<media:audio>";
	if (mimeType.startsWith("video/")) return "<media:video>";
	return "<media:attachment>";
};

const collectOutboundMedia = (messages = []) => {
	const items = [];
	for (const message of messages) {
		if (!message) continue;
		if (message.role !== "assistant" && message.role !== "toolResult") continue;
		if (Array.isArray(message.attachments)) {
			for (const attachment of message.attachments) {
				if (!attachment?.content) continue;
				items.push({
					data: attachment.content,
					mimeType: attachment.mimeType || "application/octet-stream",
					fileName: attachment.fileName || "attachment",
				});
			}
		}
		if (Array.isArray(message.content)) {
			let imageIndex = 1;
			for (const block of message.content) {
				if (block?.type !== "image" || !block.data) continue;
				items.push({
					data: block.data,
					mimeType: block.mimeType || "image/png",
					fileName: `image-${imageIndex++}`,
				});
			}
		}
	}
	return items;
};

const formatSessionSize = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

const listSessionFiles = (rootDir) => {
	if (!rootDir || !existsSync(rootDir)) return [];
	const results = [];
	const queue = [rootDir];

	while (queue.length > 0) {
		const current = queue.pop();
		let entries = [];
		try {
			entries = readdirSync(current, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			const fullPath = join(current, entry.name);
			if (entry.isDirectory()) {
				queue.push(fullPath);
			} else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
				results.push(fullPath);
			}
		}
	}

	return results;
};

const getSessionEntries = (agent) => {
	const now = Date.now();
	if (
		SESSION_CACHE_TTL_MS > 0
		&& agent.sessionCache
		&& now - agent.sessionCache.updatedAt < SESSION_CACHE_TTL_MS
	) {
		return agent.sessionCache.entries;
	}

	const sessionFiles = listSessionFiles(agent.sessionDir).sort();
	const currentPath = agent.currentSessionFile ? resolve(agent.currentSessionFile) : null;

	const entries = sessionFiles.map((filePath) => {
		const relativePath = relative(agent.sessionDir, filePath);
		const normalized = relativePath.replace(/\\/g, "/");
		const withoutExt = normalized.replace(/\.jsonl$/, "");
		const dirName = dirname(withoutExt);
		const label = dirName && dirName !== "." ? dirName : withoutExt;
		const id = dirName && dirName !== "." ? basename(dirName) : basename(withoutExt);
		let sizeText = "unknown";
		try {
			sizeText = formatSessionSize(statSync(filePath).size);
		} catch {
			// ignore
		}
		return {
			id,
			name: label,
			base: label,
			path: filePath,
			sizeText,
			isCurrent: currentPath && resolve(filePath) === currentPath,
		};
	});

	agent.sessionCache = { entries, updatedAt: now };
	return entries;
};

const pad2 = (value) => String(value).padStart(2, "0");

const createSessionPath = (agent, now = new Date()) => {
	const dateLabel = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
	const timeLabel = `${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
	const rand = Math.random().toString(36).slice(2, 8);
	const folder = `${timeLabel}_${rand}`;
	const sessionDir = join(agent.sessionDir, dateLabel, folder);
	const sessionPath = join(sessionDir, "session.jsonl");
	return { sessionDir, sessionPath, label: `${dateLabel}/${folder}` };
};

const relocateSessionFile = (fromPath, toPath) => {
	if (!fromPath || !toPath) return { ok: false, error: "missing session path" };
	mkdirSync(dirname(toPath), { recursive: true });
	try {
		renameSync(fromPath, toPath);
		return { ok: true, moved: true };
	} catch (err) {
		try {
			copyFileSync(fromPath, toPath);
			try {
				unlinkSync(fromPath);
			} catch {
				// ignore
			}
			return { ok: true, moved: false };
		} catch (copyErr) {
			return { ok: false, error: copyErr instanceof Error ? copyErr.message : String(copyErr) };
		}
	}
};

const notifyIMessage = async ({ text, chatId, sender }) => {
	if (!imessageBridge) return;
	await imessageBridge.sendMessage({
		text,
		chatId,
		to: sender,
		service: IMESSAGE_SERVICE,
		region: IMESSAGE_REGION,
	});
};

const safeNotify = async (notify, text) => {
	try {
		await notify(text);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[loong] notify failed: ${message}`);
	}
};

const resolveAgentLabel = (agent) => `[${agent.name || agent.id}]`;

const formatAgentReply = (agent, text) => {
	if (!text) return text;
	if (agent.replyPrefixMode === "never") return text;
	return `${resolveAgentLabel(agent)} ${text}`.trim();
};

const parsePrefixedCommand = (text) => {
	if (!LOONG_CMD_PREFIX) return null;
	const trimmed = text.trim();
	if (!trimmed.startsWith(LOONG_CMD_PREFIX)) return null;
	const token = trimmed.split(/\s+/)[0] || "";
	const name = token.toLowerCase().split(":")[0];
	let remainder = trimmed.slice(token.length).trim();
	if (remainder.startsWith(":")) remainder = remainder.slice(1).trim();
	return { name, remainder };
};

const normalizeCommand = (prefixed) => {
	if (!prefixed) return null;
	const { name, remainder } = prefixed;
	if (name === `${LOONG_CMD_PREFIX}new`) {
		return { type: "new_session", remainder };
	}
	return null;
};

const matchVoiceCommand = (text) => {
	const trimmed = text.trim();
	if (!trimmed) return null;

	const match = trimmed.match(/^new\b\s*(.*)$/i);
	if (!match) return null;

	const remainder = match[1]?.trim() || "";
	if (/^(chat|session)\b/i.test(remainder)) return null;

	return { type: "new_session", remainder };
};

const resolveCommand = (text) => {
	const prefixed = normalizeCommand(parsePrefixedCommand(text));
	if (prefixed) return prefixed;
	return matchVoiceCommand(text);
};

const isAuthorized = (sender) => {
	if (IMESSAGE_ALLOWLIST.length === 0) return true;
	if (!sender) return false;
	return IMESSAGE_ALLOWLIST.includes(sender);
};

const resolveIMessageKey = (entry) => {
	if (entry.chatId != null) return `chat:${entry.chatId}`;
	if (entry.sender) return `sender:${entry.sender}`;
	return "unknown";
};

const handleGatewayCommand = async ({
	agent,
	command,
	respond,
	sendPrompt,
	contextKey,
}) => {
	if (!command || command.type !== "new_session") return false;
	const { remainder } = command;

	const trimmed = remainder.trim();
	let promptText = trimmed;
	let modelSpec = null;
	if (trimmed) {
		const [candidate, ...rest] = trimmed.split(/\s+/);
		if (candidate && candidate.includes("/")) {
			const resolved = await resolveModelSpec(agent, candidate);
			if (resolved?.error) {
				await respond(resolved.error);
				return true;
			}
			modelSpec = resolved;
			promptText = rest.join(" ").trim();
		}
	}

	await sendAgentRequest(agent, { type: "new_session" });
	if (modelSpec) {
		await sendAgentRequest(agent, {
			type: "set_model",
			provider: modelSpec.provider,
			modelId: modelSpec.modelId,
		});
	}
	const state = await sendAgentRequest(agent, { type: "get_state" }).catch(() => null);
	const sessionFile = state?.data?.sessionFile ?? null;
	if (!sessionFile) {
		await respond("新建会话失败（未获取到 session 文件）");
		return true;
	}

	let activeSessionFile = sessionFile;
	const sessionInfo = createSessionPath(agent);
	const relocateResult = relocateSessionFile(sessionFile, sessionInfo.sessionPath);
	if (relocateResult.ok) {
		const switchResp = await sendAgentRequest(agent, {
			type: "switch_session",
			sessionPath: sessionInfo.sessionPath,
		});
		if (switchResp?.success === false) {
			console.warn(`[loong] failed to switch session to ${sessionInfo.sessionPath}`);
		} else {
			activeSessionFile = sessionInfo.sessionPath;
		}
	} else {
		console.warn(`[loong] failed to relocate session file: ${relocateResult.error || "unknown error"}`);
	}

	agent.currentSessionFile = activeSessionFile;
	updateSessionMapping(agent, contextKey, activeSessionFile);

	if (promptText) {
		sendPrompt(promptText);
	} else {
		const modelNote = modelSpec ? ` (${modelSpec.provider}/${modelSpec.modelId})` : "";
		await respond(`已创建新会话${modelNote}。`);
	}
	return true;
};

const updateSessionMapping = (agent, sessionKey, sessionFile) => {
	if (!IMESSAGE_PER_CHAT) return;
	if (!sessionKey || !sessionFile) return;
	agent.imessageSessions.set(sessionKey, sessionFile);
	persistIMessageSessionMap(agent);
};

const resolveModelSpec = async (agent, token) => {
	if (!token || !token.includes("/")) return null;
	const [provider, modelId] = token.split("/");
	if (!provider || !modelId) {
		return { error: "模型格式应为 provider/model" };
	}
	const response = await sendAgentRequest(agent, { type: "get_available_models" });
	const models = response?.data?.models ?? [];
	const found = models.find((model) => model.provider === provider && model.id === modelId);
	if (!found) {
		return { error: `模型不存在: ${provider}/${modelId}` };
	}
	return { provider, modelId };
};

const resolveAgentFromText = (text, currentAgentId) => {
	const trimmed = text.trim();
	const lowered = trimmed.toLowerCase();
	const boundaryChars = new Set([
		"",
		" ",
		"\n",
		"\t",
		":",
		"：",
		",",
		"，",
		".",
		"。",
		"!",
		"！",
		"?",
		"？",
		"、",
		"-",
	]);

	for (const agent of agents.values()) {
		const keywords = [...agent.keywords].sort((a, b) => b.length - a.length);
		for (const keyword of keywords) {
			if (!keyword) continue;
			const loweredKeyword = keyword.toLowerCase();
			if (!lowered.startsWith(loweredKeyword)) continue;
			const nextChar = lowered[loweredKeyword.length] || "";
			if (!boundaryChars.has(nextChar)) continue;
			let remainder = trimmed.slice(keyword.length).trim();
			remainder = remainder.replace(/^[:：,，\-]+/, "").trim();
			return {
				agent,
				remainder,
				switched: agent.id !== currentAgentId,
			};
		}
	}

	const fallbackAgent =
		( currentAgentId && agents.get(currentAgentId) ) || agents.get(defaultAgentId);
	return {
		agent: fallbackAgent,
		remainder: trimmed,
		switched: false,
	};
};

const clearTaskTimeout = (task) => {
	if (task?.timeoutTimer) {
		clearTimeout(task.timeoutTimer);
		task.timeoutTimer = null;
	}
};

const notifyTaskMessage = async (agent, task, text) => {
	if (!task || !text) return;
	const message = formatAgentReply(agent, text);
	if (task.source === "imessage") {
		await safeNotify(
			(replyText) =>
				notifyIMessage({ text: replyText, chatId: task.chatId, sender: task.sender }),
			message,
		);
		return;
	}
	if (task.source === "web" && task.ws) {
		sendGatewayMessage(task.ws, message);
	}
};

const failCurrentTask = async (agent, task, text, { skipQueue = false } = {}) => {
	if (!task) return;
	task.aborted = true;
	clearTaskTimeout(task);
	await notifyTaskMessage(agent, task, text);
	agent.busy = false;
	agent.currentTask = null;
	if (!skipQueue) {
		processNextAgent(agent);
	}
	broadcastAgentStatus(agent);
};

const rejectPendingRequests = (agent, reason) => {
	for (const pending of agent.pending.values()) {
		if (pending.timer) clearTimeout(pending.timer);
		pending.reject(new Error(reason));
	}
	agent.pending.clear();
};

const handleAgentExit = async (agent, reason) => {
	agent.offline = true;
	rejectPendingRequests(agent, reason);
	agent.queue = [];
	if (agent.currentTask) {
		await failCurrentTask(agent, agent.currentTask, "代理已退出，任务已取消。", { skipQueue: true });
		return;
	}
	agent.busy = false;
	agent.currentTask = null;
	broadcastAgentStatus(agent);
};

const enqueueAgentPrompt = (agent, task) => {
	if (agent.offline) {
		void notifyTaskMessage(agent, task, "代理当前不可用，请稍后再试。");
		return;
	}
	agent.queue.push(task);
	processNextAgent(agent);
	broadcastAgentStatus(agent);
};

const processNextAgent = async (agent) => {
	if (agent.offline) return;
	if (agent.busy || agent.queue.length === 0) return;
	agent.busy = true;
	agent.currentTask = agent.queue.shift();

	const task = agent.currentTask;
	if (TASK_TIMEOUT_MS > 0) {
		task.timeoutTimer = setTimeout(() => {
			void failCurrentTask(agent, task, "处理超时，已取消。", { skipQueue: agent.offline });
		}, TASK_TIMEOUT_MS);
	}

	try {
		if (task.onStart) {
			await task.onStart();
		}
		await ensureAgentSession(agent, task);
		const snapshot = await sendAgentRequest(agent, { type: "get_messages" }).catch(() => null);
		task.baseMessageCount = snapshot?.data?.messages?.length ?? null;
		const message = buildPromptText(task);
		sendToPi(agent, { type: "prompt", message });
	} catch (err) {
		clearTaskTimeout(task);
		console.error(`[loong] agent ${agent.id} session error: ${err.message}`);
		agent.busy = false;
		agent.currentTask = null;
		processNextAgent(agent);
	} finally {
		broadcastAgentStatus(agent);
	}
};

const buildPromptText = (task) => {
	const text = task.text || "";
	if (task.source === "imessage") {
		const sender = task.sender || "unknown";
		const prefix = `iMessage from ${sender}:\n`;
		return `${prefix}${text}`;
	}
	return text;
};

const ensureAgentSession = async (agent, task) => {
	if (task.source !== "imessage" || !IMESSAGE_PER_CHAT) {
		const state = await sendAgentRequest(agent, { type: "get_state" }).catch(() => null);
		if (state?.data?.sessionFile) {
			agent.currentSessionFile = state.data.sessionFile;
		}
		return agent.currentSessionFile;
	}

	const key = resolveIMessageKey(task);
	let sessionFile = agent.imessageSessions.get(key) || null;

	const switchToSession = async () => {
		if (!sessionFile) return false;
		if (agent.currentSessionFile && sessionFile === agent.currentSessionFile) return true;
		const resp = await sendAgentRequest(agent, { type: "switch_session", sessionPath: sessionFile });
		if (resp?.success === false) {
			agent.imessageSessions.delete(key);
			persistIMessageSessionMap(agent);
			sessionFile = null;
			return false;
		}
		agent.currentSessionFile = sessionFile;
		return true;
	};

	if (sessionFile) {
		const ok = await switchToSession();
		if (ok) return sessionFile;
	}

	await sendAgentRequest(agent, { type: "new_session" });
	const state = await sendAgentRequest(agent, { type: "get_state" });
	sessionFile = state?.data?.sessionFile ?? null;
	if (sessionFile) {
		const sessionInfo = createSessionPath(agent);
		const relocateResult = relocateSessionFile(sessionFile, sessionInfo.sessionPath);
		if (relocateResult.ok) {
			sessionFile = sessionInfo.sessionPath;
		} else {
			console.warn(
				`[loong] failed to relocate session file for iMessage: ${relocateResult.error || "unknown error"}`,
			);
		}
		agent.imessageSessions.set(key, sessionFile);
		persistIMessageSessionMap(agent);
		await switchToSession();
	}

	return sessionFile;
};

const sendIMessageMedia = async ({ media, chatId, sender }) => {
	if (!imessageBridge) return;
	const filePath = writeOutboundMediaFile(media);
	if (!filePath) return;
	const placeholder = resolveMediaPlaceholder(media.mimeType);
	await imessageBridge.sendMessage({
		text: placeholder,
		file: filePath,
		chatId,
		to: sender,
		service: IMESSAGE_SERVICE,
		region: IMESSAGE_REGION,
	});
};

const sendIMessageReply = async (agent, task, payload) => {
	if (!imessageBridge || !task) return;
	const messages = Array.isArray(payload?.messages) ? payload.messages : [];
	const reply = extractAssistantText(messages);
	const baseIndex = Number.isInteger(task.baseMessageCount) ? task.baseMessageCount : null;
	const newMessages = baseIndex != null ? messages.slice(baseIndex) : messages;
	const mediaItems = collectOutboundMedia(newMessages);
	const chatId = task.chatId;
	const sender = task.sender;

	if (reply.trim()) {
		await imessageBridge.sendMessage({
			text: formatAgentReply(agent, reply),
			chatId,
			to: sender,
			service: IMESSAGE_SERVICE,
			region: IMESSAGE_REGION,
		});
	}

	for (const media of mediaItems) {
		try {
			await sendIMessageMedia({ media, chatId, sender });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			console.error(`[loong] imessage media send failed: ${message}`);
		}
	}
};

const handleAgentResponse = (agent, payload) => {
	if (!payload || payload.type !== "response" || !payload.id) return false;
	const pending = agent.pending.get(payload.id);
	if (pending) {
		if (pending.timer) clearTimeout(pending.timer);
		agent.pending.delete(payload.id);
		pending.resolve(payload);
	}

	if (payload.command === "get_state" && payload.success && payload.data?.sessionFile) {
		agent.currentSessionFile = payload.data.sessionFile;
	}
	return !!pending;
};

const handleAgentEvent = (agent, payload) => {
	if (!payload || typeof payload !== "object") return;

	if (payload.type === "agent_end") {
		const task = agent.currentTask;
		clearTaskTimeout(task);
		if (task?.aborted) {
			agent.busy = false;
			agent.currentTask = null;
			processNextAgent(agent);
			broadcastAgentStatus(agent);
			return;
		}
		const reply = extractAssistantText(payload.messages || []);

		// 处理 API 请求的回调
		if (task?.source === "api" && task.onReply) {
			task.onReply(reply);
		}

		if (task?.source === "imessage") {
			(async () => {
				try {
					await sendIMessageReply(agent, task, payload);
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					console.error(`[loong] imessage send failed: ${message}`);
				} finally {
					agent.busy = false;
					agent.currentTask = null;
					processNextAgent(agent);
					broadcastAgentStatus(agent);
				}
			})();
		} else {
			agent.busy = false;
			agent.currentTask = null;
			processNextAgent(agent);
			broadcastAgentStatus(agent);
		}

		if (reply.trim()) {
			notifyBackgroundWebClients(agent, reply);
		}
	}
};

const notifyBackgroundWebClients = (agent, reply) => {
	const text = formatAgentReply(agent, reply);
	for (const client of clients) {
		if (client.readyState !== WebSocket.OPEN) continue;
		const context = webContexts.get(client);
		if (context?.agentId === agent.id) continue;
		client.send(JSON.stringify({ type: "gateway_message", text }));
	}
};

const broadcastAgentStatus = (agent) => {
	for (const client of clients) {
		if (client.readyState !== WebSocket.OPEN) continue;
		const context = webContexts.get(client);
		if (context?.agentId !== agent.id) continue;
		client.send(
			JSON.stringify({
				type: "gateway_agent_status",
				agent: { id: agent.id, name: agent.name },
				busy: agent.busy,
				queueLength: agent.queue.length,
			}),
		);
	}
};

const handleIMessageIncoming = async (message) => {
	if (!message) return;
	if (message.is_from_me) return;
	const text = message.text?.trim();
	if (!text) return;

	const sender = message.sender ?? undefined;
	if (!isAuthorized(sender)) {
		console.log(`[loong] ignoring message from unauthorized sender: ${sender}`);
		return;
	}
	const chatId = message.chat_id ?? undefined;
	const sessionKey = resolveIMessageKey({ sender, chatId });
	const context = imessageContexts.get(sessionKey);
	const currentAgentId = context?.agentId || defaultAgentId;
	const { agent, remainder, switched } = resolveAgentFromText(text, currentAgentId);
	if (!agent) return;

	if (switched) {
		imessageContexts.set(sessionKey, { agentId: agent.id });
	}

	const trimmed = remainder.trim();
	const respond = (replyText) => notifyIMessage({ text: replyText, chatId, sender });
	if (!trimmed) {
		await respond(`已切换到 ${agent.name}`);
		return;
	}

	const command = resolveCommand(trimmed);
	const handled = command
		? await handleGatewayCommand({
			agent,
			command,
			respond: (replyText) => respond(replyText),
			sendPrompt: (promptText) =>
				enqueueAgentPrompt(agent, {
					source: "imessage",
					text: promptText,
					sender,
					chatId,
					onStart: () => sendProcessingNotice(agent, { chatId, sender }),
				}),
			contextKey: sessionKey,
		})
		: false;
	if (handled) return;

	enqueueAgentPrompt(agent, {
		source: "imessage",
		text: trimmed,
		sender,
		chatId,
		onStart: () => sendProcessingNotice(agent, { chatId, sender }),
	});
};

const sendProcessingNotice = async (agent, { chatId, sender }) => {
	if (!agent.notifyOnStart) return;
	await safeNotify(
		(text) => notifyIMessage({ text, chatId, sender }),
		`${resolveAgentLabel(agent)} 正在处理...`,
	);
};

let imessageBridge = null;
const imessageContexts = new Map();

const sendGatewayMessage = (ws, text) => {
	if (ws.readyState === WebSocket.OPEN) {
		ws.send(JSON.stringify({ type: "gateway_message", text }));
	}
};

const sendToPi = (agent, payload) => {
	agent.pi.stdin.write(`${JSON.stringify(payload)}\n`);
};

const sendAgentRequest = (agent, command, { timeoutMs = 10000 } = {}) => {
	if (agent.offline) {
		return Promise.reject(new Error(`agent ${agent.id} offline`));
	}
	const id = `${agent.id}-${++agent.requestId}`;
	const payload = { ...command, id };
	return new Promise((resolve, reject) => {
		const timer = timeoutMs
			? setTimeout(() => {
				agent.pending.delete(id);
				reject(new Error(`pi RPC timeout (${command.type})`));
			}, timeoutMs)
			: undefined;
		agent.pending.set(id, { resolve, reject, timer });
		sendToPi(agent, payload);
	});
};

const handleAgentLine = (agent, line) => {
	if (!line.trim()) return;

	let payload;
	try {
		payload = JSON.parse(line);
		const handled = handleAgentResponse(agent, payload);
		if (!handled) {
			handleAgentEvent(agent, payload);
		}
	} catch {
		// ignore parse errors
	}

	for (const client of clients) {
		if (client.readyState !== WebSocket.OPEN) continue;
		const context = webContexts.get(client);
		if (context?.agentId !== agent.id) continue;
		client.send(line);
	}
};

const loadIMessageSessionMap = (agent) => {
	if (!IMESSAGE_PER_CHAT) return;
	if (!existsSync(agent.sessionMapFile)) return;
	try {
		const raw = readFileSync(agent.sessionMapFile, "utf8");
		const parsed = JSON.parse(raw);
		const entries = parsed?.entries ?? {};
		for (const [key, value] of Object.entries(entries)) {
			if (typeof value === "string" && value.trim()) {
				agent.imessageSessions.set(key, value.trim());
			}
		}
		if (agent.imessageSessions.size > 0) {
			console.log(`[loong] loaded imessage sessions (${agent.id}): ${agent.imessageSessions.size}`);
		}
	} catch (err) {
		console.error(`[loong] failed to load imessage session map: ${err.message}`);
	}
};

const persistIMessageSessionMap = (agent) => {
	if (!IMESSAGE_PER_CHAT) return;
	try {
		const payload = {
			version: 1,
			entries: Object.fromEntries(agent.imessageSessions.entries()),
		};
		writeFileSync(agent.sessionMapFile, JSON.stringify(payload, null, 2));
	} catch (err) {
		console.error(`[loong] failed to save imessage session map: ${err.message}`);
	}
};

if (IMESSAGE_ENABLED) {
	for (const agent of agents.values()) {
		loadIMessageSessionMap(agent);
	}
	startIMessageBridge({
		cliPath: IMESSAGE_CLI_PATH,
		dbPath: IMESSAGE_DB_PATH,
		runtime: console,
		onMessage: handleIMessageIncoming,
	})
		.then(async (bridge) => {
			imessageBridge = bridge;
			await imessageBridge.subscribe({ attachments: IMESSAGE_ATTACHMENTS });
			console.log("[loong] imessage bridge ready");
		})
		.catch((err) => {
			console.error(`[loong] imessage bridge failed: ${err.message}`);
		});
}

server.listen(PORT, () => {
	console.log(`[loong] listening on http://localhost:${PORT}`);
	console.log(`[loong] websocket ws://localhost:${PORT}/ws`);
	console.log(`[loong] api notify: POST http://localhost:${PORT}/api/notify`);
	console.log(`[loong] api ask: POST http://localhost:${PORT}/api/ask`);
	console.log(`[loong] loong home: ${LOONG_HOME}`);
	console.log(`[loong] agents: ${agentList.map((a) => a.id).join(", ")}`);
	if (IMESSAGE_ENABLED) {
		console.log(`[loong] imessage enabled (cli=${IMESSAGE_CLI_PATH})`);
	} else {
		console.log("[loong] imessage disabled (set IMESSAGE_ENABLED=1 to enable)");
	}
});

function loadGatewayConfig() {
	const defaults = { ...DEFAULT_GATEWAY_CONFIG };
	if (!existsSync(LOONG_CONFIG_PATH)) {
		console.warn(`[loong] config not found at ${LOONG_CONFIG_PATH}, using defaults`);
		return defaults;
	}
	try {
		const raw = readFileSync(LOONG_CONFIG_PATH, "utf8");
		const parsed = JSON.parse(raw);
		return { ...defaults, ...parsed };
	} catch (err) {
		console.error(`[loong] failed to read config: ${err.message}`);
		return defaults;
	}
}

function initAgents(config) {
	const agentConfigs = resolveAgentConfigs(config);
	if (agentConfigs.length === 0) return null;

	for (const agentConfig of agentConfigs) {
		const agent = createAgentRuntime(agentConfig);
		agents.set(agent.id, agent);
		agentList.push({
			id: agent.id,
			name: agent.name,
			keywords: agent.keywords,
			pid: agent.pi.pid,
		});
	}

	const defaultId = config.defaultAgent && agents.has(config.defaultAgent)
		? config.defaultAgent
		: agentConfigs[0].id;

	return defaultId;
}

function resolveAgentConfigs(config) {
	const agentsDir = resolve(LOONG_HOME, config.agentsDir || "agents");
	const results = [];

	const addAgentConfig = (configPath) => {
		if (!existsSync(configPath)) return;
		try {
			const raw = readFileSync(configPath, "utf8");
			const parsed = JSON.parse(raw);
			const normalized = normalizeAgentConfig(parsed, configPath, config);
			if (normalized) results.push(normalized);
		} catch (err) {
			console.error(`[loong] failed to read agent config: ${configPath} (${err.message})`);
		}
	};

	if (Array.isArray(config.agents) && config.agents.length > 0) {
		for (const entry of config.agents) {
			if (!entry || entry.enabled === false) continue;
			const configPath = entry.configPath
				? resolve(LOONG_HOME, entry.configPath)
				: resolve(agentsDir, entry.id || "", "agent.json");
			addAgentConfig(configPath);
		}
		return results;
	}

	if (!existsSync(agentsDir)) {
		console.warn(`[loong] agents dir not found: ${agentsDir}`);
		return results;
	}

	const entries = readdirSync(agentsDir, { withFileTypes: true });
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const configPath = join(agentsDir, entry.name, "agent.json");
		addAgentConfig(configPath);
	}
	return results;
}

function normalizeAgentConfig(config, configPath, gatewayConfig) {
	if (!config || typeof config !== "object") return null;
	const configDir = dirname(configPath);
	const id = config.id || basename(configDir);
	const name = config.name || id;
	const keywords = Array.isArray(config.keywords) && config.keywords.length > 0
		? config.keywords
		: [id];
	const sessionDir = config.sessionDir
		? resolve(configDir, config.sessionDir)
		: resolve(LOONG_SPACE, id);
	const memoryDir = resolve(configDir, config.memory?.dir || "memory");
	const memoryIndexFile = resolve(configDir, config.memory?.indexFile || "MEMORY.md");
	const memoryEnabled = config.memory?.enabled !== false;
	const sessionMapFile = resolve(configDir, config.imessage?.sessionMapFile || "imessage-session-map.json");

	const systemPromptPath = config.systemPromptPath
		? resolve(configDir, config.systemPromptPath)
		: null;
	const appendSystemPromptPath = config.appendSystemPromptPath
		? resolve(configDir, config.appendSystemPromptPath)
		: null;

	return {
		id,
		name,
		keywords,
		configDir,
		systemPrompt: config.systemPrompt || null,
		systemPromptPath,
		appendSystemPrompt: config.appendSystemPrompt || null,
		appendSystemPromptPath,
		model: config.model || null,
		thinkingLevel: config.thinkingLevel || config.thinking || null,
		tools: Array.isArray(config.tools) ? config.tools : null,
		sessionDir,
		memoryDir,
		memoryIndexFile,
		memoryEnabled,
		sessionMapFile,
		notifyOnStart: config.notifyOnStart ?? gatewayConfig.notifyOnStart,
		replyPrefixMode: config.replyPrefixMode || gatewayConfig.replyPrefixMode,
	};
}

function createAgentRuntime(config) {
	mkdirSync(config.sessionDir, { recursive: true });
	if (config.memoryEnabled) {
		mkdirSync(config.memoryDir, { recursive: true });
	}

	const args = [...piBaseArgs, "--mode", "rpc", "--session-dir", config.sessionDir];
	if (config.systemPromptPath) {
		args.push("--system-prompt", config.systemPromptPath);
	} else if (config.systemPrompt) {
		args.push("--system-prompt", config.systemPrompt);
	}
	if (config.appendSystemPromptPath) {
		args.push("--append-system-prompt", config.appendSystemPromptPath);
	} else if (config.appendSystemPrompt) {
		args.push("--append-system-prompt", config.appendSystemPrompt);
	}
	if (config.model?.provider) {
		args.push("--provider", config.model.provider);
	}
	if (config.model?.modelId) {
		args.push("--model", config.model.modelId);
	}
	if (config.thinkingLevel) {
		args.push("--thinking", config.thinkingLevel);
	}
	if (Array.isArray(config.tools)) {
		if (config.tools.length === 0) {
			args.push("--no-tools");
		} else {
			args.push("--tools", config.tools.join(","));
		}
	}

	const pi = spawn(piCmd, args, {
		cwd: PI_CWD,
		stdio: ["pipe", "pipe", "inherit"],
		env: process.env,
	});

	const runtime = {
		id: config.id,
		name: config.name,
		keywords: config.keywords,
		sessionDir: config.sessionDir,
		memoryDir: config.memoryDir,
		memoryIndexFile: config.memoryIndexFile,
		memoryEnabled: config.memoryEnabled,
		sessionMapFile: config.sessionMapFile,
		notifyOnStart: config.notifyOnStart,
		replyPrefixMode: config.replyPrefixMode,
		pi,
		pending: new Map(),
		requestId: 0,
		currentSessionFile: null,
		queue: [],
		busy: false,
		currentTask: null,
		offline: false,
		sessionCache: null,
		imessageSessions: new Map(),
	};

	pi.on("exit", (code, signal) => {
		const reason = `agent ${config.id} exited (code=${code}, signal=${signal})`;
		console.error(`[loong] ${reason}`);
		void handleAgentExit(runtime, reason);
	});

	const rl = createInterface({ input: pi.stdout });
	rl.on("line", (line) => handleAgentLine(runtime, line));

	return runtime;
}
