const statusEl = document.getElementById("status");
const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("sendBtn");
const sessionListEl = document.getElementById("sessionList");
const refreshSessionsBtn = document.getElementById("refreshSessions");
const sessionDirEl = document.getElementById("sessionDir");
const agentSelectEl = document.getElementById("agentSelect");
const providerInput = document.getElementById("providerInput");
const providerListEl = document.getElementById("providerList");
const modelInput = document.getElementById("modelInput");
const modelListEl = document.getElementById("modelList");

let ws;
let pendingAssistant = null;
let pendingUser = null;
const localPromptQueue = [];
let latestMessages = null;
let latestForkMessages = null;
let currentSessions = [];
let availableModels = [];
let providerOptions = [];
let currentSessionFile = null;
let currentModel = null;
let currentAgentId = null;
let currentAgentName = null;
let currentAgentBusy = false;
let currentAgentQueue = 0;
let knownAgents = [];

const renderAgentOptions = () => {
  if (!agentSelectEl) return;
  agentSelectEl.innerHTML = "";
  if (!knownAgents || knownAgents.length === 0) {
    agentSelectEl.disabled = true;
    return;
  }

  knownAgents.forEach((agent) => {
    const option = document.createElement("option");
    option.value = agent.id;
    option.textContent = agent.name || agent.id;
    agentSelectEl.appendChild(option);
  });

  agentSelectEl.disabled = false;
  if (currentAgentId) {
    agentSelectEl.value = currentAgentId;
  }
};

const connect = () => {
  const wsUrl = new URL("/ws", window.location.href);
  wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
  wsUrl.search = window.location.search;
  ws = new WebSocket(wsUrl);

  ws.addEventListener("open", () => {
    statusEl.textContent = "connected";
    send({ type: "get_state" });
    send({ type: "get_messages" });
    send({ type: "get_available_models" });
    send({ type: "list_sessions" });
  });

  ws.addEventListener("close", () => {
    statusEl.textContent = "disconnected - retrying...";
    setTimeout(connect, 1000);
  });

  ws.addEventListener("message", (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }

    if (payload.type === "gateway_ready") {
      knownAgents = payload.agents || [];
      const activeId = payload.activeAgent || payload.defaultAgent || currentAgentId;
      const activeAgent = knownAgents.find((agent) => agent.id === activeId);
      currentAgentId = activeId || currentAgentId;
      currentAgentName = activeAgent?.name || activeId || currentAgentName;
      currentAgentBusy = false;
      currentAgentQueue = 0;
      currentSessionFile = null;
      currentModel = null;
      currentSessions = [];
      availableModels = [];
      const homePath = payload.loongSpace || payload.loongHome || payload.jarvisHome;
      if (homePath) {
        sessionDirEl.textContent = homePath;
      }
      renderAgentOptions();
      updateStatus({});
      return;
    }

    if (payload.type === "response") {
      handleResponse(payload);
      return;
    }

    handleEvent(payload);
  });
};

const send = (command) => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(command));
};

const handleResponse = (payload) => {
  if (payload.command === "get_messages" && payload.success) {
    latestMessages = payload.data.messages || [];
    send({ type: "get_fork_messages" });
    return;
  }

  if (payload.command === "get_fork_messages" && payload.success) {
    latestForkMessages = payload.data.messages || [];
    if (latestMessages) {
      renderMessages(latestMessages, latestForkMessages);
    }
    return;
  }

  if (payload.command === "get_state" && payload.success) {
    const state = payload.data || {};
    currentSessionFile = state.sessionFile || currentSessionFile;
    currentModel = state.model || currentModel;
    updateStatus(state);
    if (currentSessions.length > 0) {
      renderSessions(currentSessions);
    }
    if (state.model) {
      providerInput.value = state.model.provider || "";
      modelInput.value = state.model.id || "";
    }
    return;
  }

  if (payload.command === "list_sessions" && payload.success) {
    currentSessions = payload.data.sessions || [];
    renderSessions(currentSessions);
    return;
  }

  if (payload.command === "get_available_models" && payload.success) {
    availableModels = payload.data.models || [];
    providerOptions = [...new Set(availableModels.map((m) => m.provider))].sort();
    updateProviderList();
    updateModelList();
    return;
  }

  if (payload.command === "set_model" && payload.success) {
    currentModel = payload.data || currentModel;
    const label = payload.data ? `${payload.data.provider}/${payload.data.id}` : "";
    appendMessage("system", label ? `模型已切换到 ${label}` : "模型已切换");
    send({ type: "get_state" });
    return;
  }

  if (payload.command === "list_agents" && payload.success) {
    knownAgents = payload.data?.agents || [];
    renderAgentOptions();
    return;
  }

  if (payload.command === "fork" && payload.success) {
    if (payload.data?.cancelled) {
      appendMessage("system", "分支创建被取消");
    } else {
      inputEl.value = payload.data?.text || "";
      inputEl.focus();
      appendMessage("system", "已回到该节点，输入框已填充");
      send({ type: "get_messages" });
      send({ type: "get_state" });
      send({ type: "list_sessions" });
    }
    return;
  }

  if ((payload.command === "new_session" || payload.command === "switch_session") && payload.success) {
    send({ type: "get_messages" });
    send({ type: "get_state" });
    send({ type: "list_sessions" });
    return;
  }
};

const handleEvent = (payload) => {
  if (payload.type === "gateway_message") {
    appendMessage("system", payload.text || "");
    return;
  }

  if (payload.type === "gateway_agent_switched") {
    const agent = payload.agent || {};
    currentAgentId = agent.id || currentAgentId;
    currentAgentName = agent.name || currentAgentName;
    currentAgentBusy = false;
    currentAgentQueue = 0;
    pendingAssistant = null;
    pendingUser = null;
    latestMessages = null;
    latestForkMessages = null;
    appendMessage("system", `已切换到 ${currentAgentName || currentAgentId}`.trim());
    renderAgentOptions();
    send({ type: "get_state" });
    send({ type: "get_messages" });
    send({ type: "get_available_models" });
    send({ type: "list_sessions" });
    updateStatus({});
    return;
  }

  if (payload.type === "gateway_agent_status") {
    if (payload.agent?.id && currentAgentId && payload.agent.id !== currentAgentId) {
      return;
    }
    currentAgentBusy = !!payload.busy;
    currentAgentQueue = Number(payload.queueLength || 0);
    updateStatus({});
    return;
  }

  if (payload.type === "message_start") {
    const message = payload.message;
    if (!message) return;

    if (message.role === "user" || message.role === "user-with-attachments") {
      const text = extractText(message.content);
      if (localPromptQueue.length > 0 && text.trim() === localPromptQueue[0].trim()) {
        localPromptQueue.shift();
        return;
      }
      pendingUser = appendMessage("user", "");
      applyMessageContent(pendingUser, message);
      return;
    }
  }

  if (payload.type === "message_update") {
    const delta = payload.assistantMessageEvent;
    if (delta?.type === "text_delta") {
      if (!pendingAssistant) {
        pendingAssistant = appendMessage("assistant", "");
      }
      pendingAssistant.rawText += delta.delta;
      setMessageText(pendingAssistant, pendingAssistant.rawText);
    }
  }

  if (payload.type === "message_end") {
    const message = payload.message;
    if (!message) {
      pendingAssistant = null;
      pendingUser = null;
      return;
    }

    if (message.role === "assistant") {
      const target = pendingAssistant || appendMessage("assistant", "");
      applyMessageContent(target, message);
      pendingAssistant = null;
      return;
    }

    if (message.role === "toolResult") {
      const target = appendMessage("tool", "");
      applyMessageContent(target, message);
      return;
    }

    if (message.role === "user" || message.role === "user-with-attachments") {
      const text = extractText(message.content);
      if (pendingUser) {
        applyMessageContent(pendingUser, message);
        pendingUser = null;
        return;
      }
      if (localPromptQueue.length > 0 && text.trim() === localPromptQueue[0].trim()) {
        localPromptQueue.shift();
        return;
      }
      const target = appendMessage("user", "");
      applyMessageContent(target, message);
    }
  }

  if (payload.type === "agent_end") {
    send({ type: "get_messages" });
    send({ type: "list_sessions" });
  }
};

const updateStatus = (state) => {
  const agentLabel = currentAgentName
    ? `[${currentAgentName}]`
    : currentAgentId
      ? `[${currentAgentId}]`
      : "";
  const busyLabel = currentAgentBusy
    ? ` ⏳${currentAgentQueue > 0 ? `(${currentAgentQueue + 1})` : ""}`
    : "";
  const sessionPath = state.sessionFile || currentSessionFile;
  const modelState = state.model || currentModel;
  const sessionLabel = sessionPath ? ` (${sessionPath})` : "";
  const modelLabel = modelState ? ` ${modelState.provider}/${modelState.id}` : "";
  statusEl.textContent = `connected ${agentLabel}${busyLabel}${sessionLabel}${modelLabel}`.trim();
};

const renderSessions = (sessions) => {
  sessionListEl.innerHTML = "";
  sessions.forEach((entry) => {
    const button = document.createElement("button");
    button.className = "session-item";
    if (entry.isCurrent || entry.path === currentSessionFile) {
      button.classList.add("active");
    }

    const title = document.createElement("div");
    title.textContent = `${entry.id}  ${entry.name}`;

    const meta = document.createElement("div");
    meta.className = "session-meta";
    meta.textContent = `${entry.sizeText}`;

    button.appendChild(title);
    button.appendChild(meta);

    button.addEventListener("click", () => {
      send({ type: "switch_session", sessionPath: entry.path });
    });

    sessionListEl.appendChild(button);
  });
};

const renderMessages = (messages, forkMessages = []) => {
  messagesEl.innerHTML = "";
  pendingAssistant = null;
  pendingUser = null;
  localPromptQueue.length = 0;
  let userIndex = 0;

  for (const msg of messages) {
    if (msg.role === "user" || msg.role === "user-with-attachments") {
      const forkEntry = forkMessages[userIndex];
      const target = appendMessage("user", "", { forkEntryId: forkEntry?.entryId || null });
      applyMessageContent(target, msg);
      userIndex += 1;
    } else if (msg.role === "assistant") {
      const target = appendMessage("assistant", "");
      applyMessageContent(target, msg);
    } else if (msg.role === "toolResult") {
      const target = appendMessage("tool", "");
      applyMessageContent(target, msg);
    }
  }
};

const escapeHtml = (text) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const renderMarkdown = (text) => {
  if (!text) return "";
  const escaped = escapeHtml(text);
  const codeBlocks = [];
  let html = escaped.replace(/```([\w+-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const index = codeBlocks.length;
    codeBlocks.push({ lang, code });
    return `@@CODEBLOCK${index}@@`;
  });

  html = html
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");

  codeBlocks.forEach((block, index) => {
    const languageClass = block.lang ? ` class="language-${block.lang}"` : "";
    const fenced = `<pre><code${languageClass}>${block.code}</code></pre>`;
    html = html.replace(`@@CODEBLOCK${index}@@`, fenced);
  });

  return html;
};

const extractText = (content) => {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (block.type === "text") return block.text || "";
        if (block.type === "input_text") return block.text || "";
        return "";
      })
      .join("");
  }
  return "";
};

const extractImagesFromContent = (content) => {
  if (!Array.isArray(content)) return [];
  return content
    .filter((block) => block?.type === "image" && block.data)
    .map((block, index) => ({
      kind: "image",
      mimeType: block.mimeType || "image/png",
      data: block.data,
      fileName: `image-${index + 1}`,
    }));
};

const extractAttachments = (message) => {
  const items = [];
  if (message?.attachments && Array.isArray(message.attachments)) {
    for (const attachment of message.attachments) {
      if (!attachment?.content) continue;
      const mimeType = attachment.mimeType || "application/octet-stream";
      const kind = mimeType.startsWith("image/")
        ? "image"
        : mimeType.startsWith("audio/")
          ? "audio"
          : mimeType.startsWith("video/")
            ? "video"
            : "file";
      items.push({
        kind,
        mimeType,
        data: attachment.content,
        fileName: attachment.fileName || "attachment",
        preview: attachment.preview || null,
      });
    }
  }

  const images = extractImagesFromContent(message?.content);
  return [...items, ...images];
};

const setMessageText = (target, text) => {
  target.rawText = text || "";
  target.textEl.innerHTML = renderMarkdown(target.rawText);
};

const updateMessageActions = (target) => {
  if (!target.actionsEl) return;
  target.actionsEl.innerHTML = "";
  if (target.role === "user" && target.forkEntryId) {
    const button = document.createElement("button");
    button.className = "message-action";
    button.textContent = "↩ 返回此处";
    button.addEventListener("click", () => {
      send({ type: "fork", entryId: target.forkEntryId });
    });
    target.actionsEl.appendChild(button);
  }
};

const applyMessageContent = (target, message) => {
  const text = extractText(message.content);
  setMessageText(target, text);
  const attachments = extractAttachments(message);
  target.attachmentsEl.innerHTML = "";
  if (attachments.length > 0) {
    target.attachmentsEl.style.display = "flex";
    for (const attachment of attachments) {
      target.attachmentsEl.appendChild(renderAttachment(attachment));
    }
  } else {
    target.attachmentsEl.style.display = "none";
  }
  updateMessageActions(target);
  messagesEl.scrollTop = messagesEl.scrollHeight;
};

const appendMessage = (role, text, { forkEntryId = null } = {}) => {
  const container = document.createElement("div");
  container.className = `message ${role}`;

  const textEl = document.createElement("div");
  textEl.className = "message-text";
  container.appendChild(textEl);

  const attachmentsEl = document.createElement("div");
  attachmentsEl.className = "attachments";
  attachmentsEl.style.display = "none";
  container.appendChild(attachmentsEl);

  const actionsEl = document.createElement("div");
  actionsEl.className = "message-actions";
  container.appendChild(actionsEl);

  messagesEl.appendChild(container);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  const messageObj = {
    role,
    container,
    textEl,
    attachmentsEl,
    actionsEl,
    rawText: text || "",
    forkEntryId,
  };
  setMessageText(messageObj, text || "");
  updateMessageActions(messageObj);
  return messageObj;
};

const renderAttachment = (attachment) => {
  const wrapper = document.createElement("div");
  wrapper.className = "attachment";

  const mimeType = attachment.mimeType || "application/octet-stream";
  const dataUrl = attachment.data ? `data:${mimeType};base64,${attachment.data}` : null;
  const previewUrl = attachment.preview ? `data:image/png;base64,${attachment.preview}` : null;
  const label = document.createElement("div");
  label.className = "attachment-label";
  label.textContent = attachment.fileName || "attachment";

  if (attachment.kind === "image" || previewUrl) {
    const img = document.createElement("img");
    img.className = "attachment-image";
    img.src = previewUrl || dataUrl || "";
    img.alt = attachment.fileName || "image";
    if (dataUrl) {
      img.addEventListener("click", () => window.open(dataUrl, "_blank"));
    }
    wrapper.appendChild(img);
    if (attachment.kind === "image") {
      wrapper.appendChild(label);
      return wrapper;
    }
  }

  if (attachment.kind === "audio") {
    const audio = document.createElement("audio");
    audio.className = "attachment-media";
    audio.controls = true;
    if (dataUrl) audio.src = dataUrl;
    wrapper.appendChild(audio);
    wrapper.appendChild(label);
    return wrapper;
  }

  if (attachment.kind === "video") {
    const video = document.createElement("video");
    video.className = "attachment-media";
    video.controls = true;
    if (dataUrl) video.src = dataUrl;
    wrapper.appendChild(video);
    wrapper.appendChild(label);
    return wrapper;
  }

  const link = document.createElement("a");
  link.className = "attachment-file";
  link.textContent = attachment.fileName || "download";
  if (dataUrl) {
    link.href = dataUrl;
    link.download = attachment.fileName || "attachment";
  } else {
    link.href = "#";
  }
  wrapper.appendChild(link);
  return wrapper;
};

const updateProviderList = () => {
  const query = providerInput.value.trim().toLowerCase();
  const options = providerOptions.filter((provider) => provider.toLowerCase().includes(query));
  renderPickerList(providerListEl, options, (value) => {
    providerInput.value = value;
    modelInput.value = "";
    updateModelList();
    hidePickerList(providerListEl);
  });
};

const updateModelList = () => {
  const provider = providerInput.value.trim();
  const query = modelInput.value.trim().toLowerCase();
  const models = resolveModelsForProvider(provider);
  const options = models.filter((model) => model.toLowerCase().includes(query));
  renderPickerList(modelListEl, options, (value) => {
    modelInput.value = value;
    hidePickerList(modelListEl);
    attemptSetModel();
  });
};

const resolveModelsForProvider = (provider) => {
  if (!provider) {
    return [...new Set(availableModels.map((model) => model.id))].sort();
  }
  const lowered = provider.toLowerCase();
  const filtered = availableModels.filter((model) => model.provider.toLowerCase() === lowered);
  if (filtered.length === 0) {
    return [...new Set(availableModels.map((model) => model.id))].sort();
  }
  return [...new Set(filtered.map((model) => model.id))].sort();
};

const renderPickerList = (listEl, options, onSelect) => {
  listEl.innerHTML = "";
  if (options.length === 0) {
    listEl.style.display = "none";
    return;
  }
  options.slice(0, 40).forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = option;
    button.addEventListener("click", () => onSelect(option));
    listEl.appendChild(button);
  });
  listEl.style.display = "block";
};

const hidePickerList = (listEl) => {
  listEl.style.display = "none";
};

const attemptSetModel = () => {
  const provider = providerInput.value.trim();
  const modelId = modelInput.value.trim();
  if (!provider || !modelId) return;
  const match = availableModels.find(
    (model) => model.provider.toLowerCase() === provider.toLowerCase() && model.id === modelId,
  );
  if (!match) return;
  send({ type: "set_model", provider: match.provider, modelId: match.id });
};

if (agentSelectEl) {
  agentSelectEl.addEventListener("change", () => {
    const targetId = agentSelectEl.value;
    if (!targetId || targetId === currentAgentId) return;
    send({ type: "switch_agent", agentId: targetId });
  });
}

refreshSessionsBtn.addEventListener("click", () => {
  send({ type: "list_sessions" });
});

providerInput.addEventListener("input", () => {
  updateProviderList();
  updateModelList();
});

providerInput.addEventListener("focus", () => {
  updateProviderList();
});

modelInput.addEventListener("input", () => {
  updateModelList();
});

modelInput.addEventListener("focus", () => {
  updateModelList();
});

modelInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    attemptSetModel();
    hidePickerList(modelListEl);
  }
});

providerInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    hidePickerList(providerListEl);
  }
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!providerListEl.contains(target) && target !== providerInput) {
    hidePickerList(providerListEl);
  }
  if (!modelListEl.contains(target) && target !== modelInput) {
    hidePickerList(modelListEl);
  }
});

sendBtn.addEventListener("click", () => {
  const raw = inputEl.value;
  if (!raw.trim()) return;
  localPromptQueue.push(raw);
  appendMessage("user", raw);
  inputEl.value = "";
  send({ type: "prompt", message: raw });
});

inputEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendBtn.click();
  }
});

connect();
