#!/usr/bin/env node
import { createInterface } from "readline";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const args = process.argv.slice(2);
let sessionDir = process.cwd();
for (let i = 0; i < args.length; i += 1) {
	if (args[i] === "--session-dir" && args[i + 1]) {
		sessionDir = args[i + 1];
		break;
	}
}

mkdirSync(sessionDir, { recursive: true });
let sessionFile = join(sessionDir, "session.jsonl");
const ensureSessionFile = () => {
	try {
		writeFileSync(sessionFile, "", { flag: "a" });
	} catch {
		// ignore
	}
};
ensureSessionFile();

let currentModel = { provider: "mock", id: "mock-1" };

const send = (payload) => {
	process.stdout.write(`${JSON.stringify(payload)}\n`);
};

const respond = (req, data = {}, success = true) => {
	send({ type: "response", id: req.id, command: req.type, success, data });
};

const emitAssistantReply = (text) => {
	const reply = `Echo: ${text}`;
	send({ type: "message_start", message: { role: "user", content: text } });
	send({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: reply } });
	const assistantMessage = { role: "assistant", content: reply };
	send({ type: "message_end", message: assistantMessage });
	send({ type: "agent_end", messages: [assistantMessage] });
};

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
	const trimmed = line.trim();
	if (!trimmed) return;
	let req;
	try {
		req = JSON.parse(trimmed);
	} catch {
		return;
	}

	switch (req.type) {
		case "get_state":
			respond(req, { sessionFile, model: currentModel });
			break;
		case "get_messages":
			respond(req, { messages: [] });
			break;
		case "get_fork_messages":
			respond(req, { messages: [] });
			break;
		case "get_available_models":
			respond(req, {
				models: [
					{ provider: "mock", id: "mock-1" },
					{ provider: "mock", id: "mock-2" },
				],
			});
			break;
		case "set_model":
			currentModel = {
				provider: req.provider || "mock",
				id: req.modelId || req.model || "mock-1",
			};
			respond(req, { provider: currentModel.provider, id: currentModel.id });
			break;
		case "new_session": {
			const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
			sessionFile = join(sessionDir, `session-${suffix}.jsonl`);
			ensureSessionFile();
			respond(req, {});
			break;
		}
		case "switch_session":
			if (req.sessionPath) {
				sessionFile = req.sessionPath;
				ensureSessionFile();
			}
			respond(req, {});
			break;
		case "prompt": {
			const msg = String(req.message ?? "");
			if (msg.startsWith("/notify")) {
				send({
					type: "extension_ui_request",
					id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
					method: "notify",
					message: "notify ok",
					notifyType: "info",
				});
				send({ type: "agent_end", messages: [] });
				break;
			}
			emitAssistantReply(msg);
			break;
		}
		default:
			respond(req, { error: "unknown command" }, false);
	}
});

process.on("SIGTERM", () => {
	rl.close();
	process.exit(0);
});
