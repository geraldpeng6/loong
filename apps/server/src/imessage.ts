import { spawn } from "child_process";
import { createInterface } from "readline";

export const startIMessageBridge = async ({ cliPath = "imsg", dbPath, runtime, onMessage }) => {
  const args = ["rpc"];
  if (dbPath) {
    args.push("--db", dbPath);
  }

  const child = spawn(cliPath, args, {
    stdio: ["pipe", "pipe", "inherit"],
  });

  let nextId = 1;
  const pending = new Map();
  const rl = createInterface({ input: child.stdout });

  const sendLine = (payload) => {
    child.stdin.write(`${JSON.stringify(payload)}\n`);
  };

  const request = (method, params = {}, { timeoutMs = 10000 } = {}) => {
    const id = nextId++;
    const payload = { jsonrpc: "2.0", id, method, params };
    sendLine(payload);

    return new Promise((resolve, reject) => {
      const timer = timeoutMs
        ? setTimeout(() => {
            pending.delete(id);
            reject(new Error(`imsg rpc timeout (${method})`));
          }, timeoutMs)
        : undefined;
      pending.set(id, { resolve, reject, timer });
    });
  };

  const handleResponse = (msg) => {
    const entry = pending.get(msg.id);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    pending.delete(msg.id);
    if (msg.error) {
      const message = msg.error?.message || "imsg rpc error";
      entry.reject(new Error(message));
      return;
    }
    entry.resolve(msg.result);
  };

  const handleLine = (line) => {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      return;
    }

    if (parsed.id !== undefined && parsed.id !== null) {
      handleResponse(parsed);
      return;
    }

    if (parsed.method === "message") {
      onMessage?.(parsed.params?.message ?? parsed.params);
      return;
    }

    if (parsed.method === "error") {
      runtime?.error?.(`imsg rpc error: ${JSON.stringify(parsed.params)}`);
    }
  };

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (trimmed) handleLine(trimmed);
  });

  child.on("error", (err) => {
    runtime?.error?.(`imsg rpc error: ${err.message}`);
  });

  child.on("close", (code) => {
    runtime?.error?.(`imsg rpc exited (code ${code})`);
  });

  const subscribe = async ({ attachments = false } = {}) => {
    await request("watch.subscribe", { attachments });
  };

  const sendMessage = async ({ text, file, chatId, to, service = "auto", region = "US" }) => {
    if (!text?.trim() && !file) return;
    const params = {
      service,
      region,
    };
    if (text?.trim()) {
      params.text = text;
    }
    if (file) {
      params.file = file;
    }
    if (chatId != null) {
      params.chat_id = chatId;
    } else if (to) {
      params.to = to;
    } else {
      throw new Error("imessage send missing chat_id or to");
    }

    await request("send", params);
  };

  const stop = async () => {
    rl.close();
    child.stdin.end();
    child.kill("SIGTERM");
  };

  return { subscribe, sendMessage, stop };
};
