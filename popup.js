// popup.js v2

const TARGET_URLS = {
  chatgpt: "https://chatgpt.com/",
  claude: "https://claude.ai/new",
  gemini: "https://gemini.google.com/app",
  perplexity: "https://www.perplexity.ai/"
};

// Every provider here exposes an OpenAI-compatible /chat/completions endpoint
// (actual request lives in background.js — this is just UI metadata).
const PROVIDERS = {
  openrouter: {
    label: "OpenRouter", keyPlaceholder: "sk-or-v1-…", helpUrl: "https://openrouter.ai",
    models: ["mistralai/mistral-7b-instruct", "google/gemma-3-4b-it:free", "meta-llama/llama-3.1-8b-instruct", "anthropic/claude-3-haiku", "openai/gpt-4o-mini"]
  },
  nvidia: {
    label: "NVIDIA NIM", keyPlaceholder: "nvapi-…", helpUrl: "https://build.nvidia.com",
    models: ["meta/llama-3.1-8b-instruct", "meta/llama-3.1-70b-instruct", "mistralai/mistral-7b-instruct-v0.3", "nvidia/nemotron-4-340b-instruct"]
  },
  groq: {
    label: "Groq (Fastest ⚡)", keyPlaceholder: "gsk_…", helpUrl: "https://console.groq.com/keys",
    models: ["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "mixtral-8x7b-32768", "gemma2-9b-it"]
  },
  together: {
    label: "Together AI", keyPlaceholder: "…", helpUrl: "https://api.together.ai",
    models: ["meta-llama/Llama-3.1-8B-Instruct-Turbo", "mistralai/Mixtral-8x7B-Instruct-v0.1", "Qwen/Qwen2.5-7B-Instruct-Turbo"]
  },
  fireworks: {
    label: "Fireworks AI", keyPlaceholder: "fw_…", helpUrl: "https://fireworks.ai",
    models: ["accounts/fireworks/models/llama-v3p1-8b-instruct", "accounts/fireworks/models/mixtral-8x7b-instruct"]
  },
  deepinfra: {
    label: "DeepInfra", keyPlaceholder: "…", helpUrl: "https://deepinfra.com",
    models: ["meta-llama/Meta-Llama-3.1-8B-Instruct", "mistralai/Mistral-7B-Instruct-v0.3"]
  },
  mistral: {
    label: "Mistral AI", keyPlaceholder: "…", helpUrl: "https://console.mistral.ai",
    models: ["mistral-small-latest", "mistral-large-latest", "open-mistral-nemo"]
  },
  openai: {
    label: "OpenAI", keyPlaceholder: "sk-…", helpUrl: "https://platform.openai.com/api-keys",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"]
  }
};

let state = { mode: "smart", target: "chatgpt", rawMessages: [], pageContext: null, compressed: "" };
let providerSettings = {}; // { [providerId]: { key, model } }

const $dot = document.getElementById("dot");
const $stxt = document.getElementById("stxt");
const $preview = document.getElementById("preview");
const $stats = document.getElementById("stats");
const $tOrig = document.getElementById("tOrig");
const $tComp = document.getElementById("tComp");
const $tSaved = document.getElementById("tSaved");
const $btnExtract = document.getElementById("btnExtract");
const $btnAI = document.getElementById("btnAI");
const $btnSend = document.getElementById("btnSend");
const $toast = document.getElementById("toast");
const $orProvider = document.getElementById("orProvider");
const $orKey = document.getElementById("orKey");
const $orKeyLabel = document.getElementById("orKeyLabel");
const $orKeyHint = document.getElementById("orKeyHint");
const $orModel = document.getElementById("orModel");
const $modelOpts = document.getElementById("modelOptions");
const $orPrompt = document.getElementById("orPrompt");

let currentTab = null;

// ── Detect active tab on popup startup ────────────────────────────────────────
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  currentTab = tab;
  if (!tab?.url) {
    showStatus("err", "No active tab detected");
    return;
  }

  const isInternal = tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://") || tab.url.startsWith("edge://");
  if (isInternal) {
    showStatus("err", "Open a chat tab on Claude, ChatGPT, Gemini, or Perplexity");
    return;
  }

  try {
    const host = new URL(tab.url).hostname;
    const isSupported = ["claude.ai", "chatgpt.com", "openai.com", "gemini.google.com", "perplexity.ai"].some(h => host.includes(h));
    if (isSupported) {
      const siteLabel = getSiteLabel(host);
      showStatus("ok", `<b>${siteLabel}</b> — ready to extract`);

      // Smart target default: switch target to a different AI than current source
      const currentTarget = getTargetForHost(host);
      if (currentTarget === state.target) {
        const next = ["chatgpt", "claude", "gemini"].find(t => t !== currentTarget) || "chatgpt";
        state.target = next;
        document.querySelectorAll(".tbtn").forEach(b => b.classList.toggle("sel", b.dataset.target === next));
      }
    } else {
      showStatus("err", "Not an AI chat page (open Claude, ChatGPT, Gemini, or Perplexity)");
    }
  } catch (_) {
    showStatus("err", "Unable to detect page");
  }
});

// ── Tabs ──────────────────────────────────────────────────────────────────────
document.querySelectorAll(".tab").forEach(t => {
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    document.querySelectorAll(".panel").forEach(p => p.classList.add("hidden"));
    document.getElementById("panel-" + t.dataset.panel).classList.remove("hidden");
  });
});

// ── Load saved settings ───────────────────────────────────────────────────────
let selectedProviderId = "openrouter";

chrome.storage.local.get(["providerSettings", "selectedProvider", "orPrompt"], (d) => {
  providerSettings = d.providerSettings || {};
  selectedProviderId = d.selectedProvider && PROVIDERS[d.selectedProvider] ? d.selectedProvider : "openrouter";
  $orProvider.value = selectedProviderId;
  if (d.orPrompt) $orPrompt.value = d.orPrompt;
  renderProviderUI(selectedProviderId);
  updateAiButtonState();
});

function hasSelectedProviderKey() {
  return !!providerSettings[selectedProviderId]?.key;
}

function updateAiButtonState() {
  const extracted = state.rawMessages.length > 0;
  const hasKey = hasSelectedProviderKey();
  $btnAI.disabled = !extracted || !hasKey;
  if (!extracted) $btnAI.title = "Extract a chat first";
  else if (!hasKey) $btnAI.title = `Add a ${PROVIDERS[selectedProviderId].label} key in Settings`;
  else $btnAI.title = "Summarizes the conversation accurately using AI";
}

function renderProviderUI(providerId) {
  const p = PROVIDERS[providerId];
  const saved = providerSettings[providerId] || {};
  $orKeyLabel.textContent = `${p.label} API Key`;
  $orKey.placeholder = p.keyPlaceholder;
  $orKey.value = saved.key || "";
  $orKeyHint.innerHTML = `Get a key at <a href="${p.helpUrl}" target="_blank">${new URL(p.helpUrl).hostname}</a> — stored locally, sent only to ${p.label}.`;
  $orModel.placeholder = `e.g. ${p.models[0]}`;
  $orModel.value = saved.model || "";
  $modelOpts.innerHTML = p.models.map(m => `<option value="${m}"></option>`).join("");
}

$orProvider.addEventListener("change", () => renderProviderUI($orProvider.value));

document.getElementById("btnToggleKey").addEventListener("click", (e) => {
  const showing = $orKey.type === "text";
  $orKey.type = showing ? "password" : "text";
  e.currentTarget.setAttribute("aria-pressed", String(!showing));
  e.currentTarget.setAttribute("aria-label", showing ? "Show API key" : "Hide API key");
});

document.getElementById("btnSave").addEventListener("click", () => {
  const providerId = $orProvider.value;
  const key = $orKey.value.trim();

  if (!key) {
    showToast(`⚠️ Add your ${PROVIDERS[providerId].label} API key before saving`);
    $orKey.focus();
    return;
  }

  const model = $orModel.value.trim() || PROVIDERS[providerId].models[0];
  const customPrompt = $orPrompt.value.trim();

  providerSettings[providerId] = { key, model };
  selectedProviderId = providerId;

  chrome.storage.local.set({
    providerSettings,
    selectedProvider: providerId,
    orPrompt: customPrompt
  }, () => {
    updateAiButtonState();
    showToast(`✅ Saved ${PROVIDERS[providerId].label} key & model!`);
    document.querySelector(".tab[data-panel='main']").click();
  });
});

// ── Mode selection ────────────────────────────────────────────────────────────
document.querySelectorAll(".opt").forEach(el => {
  el.addEventListener("click", () => {
    document.querySelectorAll(".opt").forEach(x => {
      x.classList.remove("sel");
      x.setAttribute("aria-pressed", "false");
    });
    el.classList.add("sel");
    el.setAttribute("aria-pressed", "true");
    state.mode = el.dataset.mode;
    if (state.rawMessages.length) renderCompressed();
  });
});

// ── Target selection ──────────────────────────────────────────────────────────
document.querySelectorAll(".tbtn").forEach(el => {
  el.addEventListener("click", () => {
    document.querySelectorAll(".tbtn").forEach(x => {
      x.classList.remove("sel");
      x.setAttribute("aria-pressed", "false");
    });
    el.classList.add("sel");
    el.setAttribute("aria-pressed", "true");
    state.target = el.dataset.target;
    $btnSend.innerHTML = state.target === "clipboard"
      ? '<span class="stepno">3</span>Copy 📋'
      : `<span class="stepno">3</span>Send →`;
  });
});

// ── EXTRACT ───────────────────────────────────────────────────────────────────
$btnExtract.addEventListener("click", async () => {
  setLoading($btnExtract, true, '<span class="stepno">1</span>⬇ Extract', 'Extracting…');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;
    if (!tab?.id) { showStatus("err", "No active tab found"); return; }

    const isChromeInternal = tab.url?.startsWith("chrome://") || tab.url?.startsWith("chrome-extension://") || tab.url?.startsWith("edge://");
    if (isChromeInternal) {
      showStatus("err", "Can't read browser system pages — open a chat tab");
      return;
    }

    const host = tab.url ? new URL(tab.url).hostname : "";
    const isSupported = ["chatgpt.com", "openai.com", "claude.ai", "gemini.google.com", "perplexity.ai"].some(h => host.includes(h));

    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractChatFromPage
    });

    const result = injection?.result;
    const msgs = result?.messages || [];
    state.pageContext = result?.pageContext || null;

    if (!msgs.length) {
      showStatus("err", isSupported ? "No messages found — is the chat empty?" : "Not a supported chat page (open Claude, ChatGPT, Gemini, or Perplexity)");
      $preview.innerHTML = '<span class="ph">No messages found. Try scrolling up or opening a chat.</span>';
      return;
    }

    state.rawMessages = msgs;
    const siteLabel = getSiteLabel(host);
    showStatus("ok", `${siteLabel} detected &bull; <b>${msgs.length} message${msgs.length === 1 ? "" : "s"}</b>`);
    renderCompressed();
    $btnSend.disabled = false;
    updateAiButtonState();
    showToast(`✨ ${getSWQuote("extract")} (${msgs.length} msgs)`);
  } catch (err) {
    const isRestricted = err.message?.includes("Cannot access") || err.message?.includes("restricted");
    showStatus("err", isRestricted ? "Can't read this tab (restricted browser page)" : "Extraction error — try refreshing the chat page");
  } finally {
    setLoading($btnExtract, false, '<span class="stepno">1</span>⬇ Extract');
  }
});

function getSiteLabel(host) {
  if (host.includes("claude.ai")) return "Claude chat";
  if (host.includes("chatgpt.com") || host.includes("openai.com")) return "ChatGPT";
  if (host.includes("gemini.google.com")) return "Gemini chat";
  if (host.includes("perplexity.ai")) return "Perplexity";
  return "Chat";
}

function getTargetForHost(host) {
  if (host.includes("chatgpt.com") || host.includes("openai.com")) return "chatgpt";
  if (host.includes("claude.ai")) return "claude";
  if (host.includes("gemini.google.com")) return "gemini";
  if (host.includes("perplexity.ai")) return "perplexity";
  return null;
}

function showStatus(type, html) {
  $dot.className = "dot " + type;
  $stxt.innerHTML = html;
}

// ── Injected DOM Extractor ────────────────────────────────────────────────────
function extractChatFromPage() {
  const host = location.hostname;
  const pageContext = {
    title: document.title.replace(/\s*[-—|]\s*(ChatGPT|Claude|Gemini|Perplexity).*/i, "").trim(),
    url: location.href
  };

  const msgs = [];

  // ════════════════════════════════════════════════
  //  CLAUDE
  // ════════════════════════════════════════════════
  if (host.includes("claude.ai")) {
    const items = [];
    document.querySelectorAll("[data-testid='user-message']").forEach(el => items.push({ role: "human", el }));
    document.querySelectorAll(".font-claude-message, [data-testid='assistant-message']").forEach(el => items.push({ role: "assistant", el }));

    if (!items.length) {
      document.querySelectorAll("[class*='human'],[class*='UserMessage']").forEach(el => items.push({ role: "human", el }));
      document.querySelectorAll("[class*='assistant'],[class*='ClaudeMessage']").forEach(el => items.push({ role: "assistant", el }));
    }

    const leaves = items.filter(i1 => !items.some(i2 => i1 !== i2 && i1.el.contains(i2.el)));
    leaves.sort((a, b) => a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    leaves.forEach(({ role, el }) => {
      const text = el.innerText?.trim();
      if (text) msgs.push({ role, text });
    });
  }

  // ════════════════════════════════════════════════
  //  CHATGPT
  // ════════════════════════════════════════════════
  else if (host.includes("chatgpt.com") || host.includes("openai.com")) {
    const items = [];
    document.querySelectorAll("[data-message-author-role='user']").forEach(el => items.push({ role: "human", el }));
    document.querySelectorAll("[data-message-author-role='assistant']").forEach(el => items.push({ role: "assistant", el }));

    if (!items.length) {
      document.querySelectorAll("article").forEach(el => {
        if (el.querySelector("[data-message-author-role='user']")) return;
        items.push({ role: "unknown", el });
      });
    }

    const leaves = items.filter(i1 => !items.some(i2 => i1 !== i2 && i1.el.contains(i2.el)));
    leaves.sort((a, b) => a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    leaves.forEach(({ role, el }) => {
      const text = el.innerText?.trim();
      if (text) msgs.push({ role, text });
    });
  }

  // ════════════════════════════════════════════════
  //  GEMINI
  // ════════════════════════════════════════════════
  else if (host.includes("gemini.google.com")) {
    const items = [];
    document.querySelectorAll(".user-query-text,.user-query-bubble").forEach(el => items.push({ role: "human", el }));
    document.querySelectorAll(".model-response-text,.response-container,[class*='ModelResponse']").forEach(el => items.push({ role: "assistant", el }));

    const leaves = items.filter(i1 => !items.some(i2 => i1 !== i2 && i1.el.contains(i2.el)));
    leaves.sort((a, b) => a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    leaves.forEach(({ role, el }) => {
      const text = el.innerText?.trim();
      if (text) msgs.push({ role, text });
    });
  }

  // ════════════════════════════════════════════════
  //  PERPLEXITY
  // ════════════════════════════════════════════════
  else if (host.includes("perplexity.ai")) {
    const items = [];
    document.querySelectorAll("[class*='UserMessage'],[data-testid='user-message']").forEach(el => items.push({ role: "human", el }));
    document.querySelectorAll("[class*='AnswerBody'],[class*='prose'],[data-testid='answer']").forEach(el => items.push({ role: "assistant", el }));

    const leaves = items.filter(i1 => !items.some(i2 => i1 !== i2 && i1.el.contains(i2.el)));
    leaves.sort((a, b) => a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    leaves.forEach(({ role, el }) => {
      const text = el.innerText?.trim();
      if (text) msgs.push({ role, text });
    });
  }

  // Deduplicate & clean
  const seen = new Set();
  const messages = msgs.filter(m => {
    if (!m.text || m.text.length < 2) return false;
    if (seen.has(m.text)) return false;
    seen.add(m.text); return true;
  });
  return { messages, pageContext };
}

// ── Intelligent Code-Preserving Compression (local) ───────────────────────────
const GREETING_PATTERNS = [
  /^(hi|hello|hey|greetings|howdy|sup|good (morning|afternoon|evening|day))[\s!.,]*$/i,
  /^(hi|hello|hey)!\s*(how can i (help|assist) you( today)?\??)[\s!.,]*$/i,
  /^(how can i (help|assist) you( today)?\??)[\s!.,]*$/i,
  /^(thanks|thank you|thx|ty|awesome|great|ok|okay|got it|understood)[\s!.,]*$/i
];

function isTrivialGreeting(text) {
  const clean = (text || "").trim().toLowerCase();
  if (clean.length > 80) return false;
  return GREETING_PATTERNS.some(r => r.test(clean));
}

function extractCodeAndProse(text) {
  const codeBlocks = [];
  // Preserve fenced markdown code blocks ```...``` intact
  let prose = (text || "").replace(/```([a-zA-Z0-9_\-#+]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push({ lang: lang || "", code: code.trim() });
    return `\n{{CODE_BLOCK_${idx}}}\n`;
  });

  // If no fenced code blocks but contains indented code or public/class/function/def
  if (codeBlocks.length === 0 && /\b(public|private|class|def|function|const|let|var|import|return)\b/.test(text) && text.includes("\n")) {
    const lines = text.split("\n");
    const codeLines = [];
    const proseLines = [];
    let inCode = false;

    lines.forEach(l => {
      if (/^\s*(public|private|class|def|function|const|let|var|import|return|\{|\}|while|for|if)\b/.test(l) || /^\s{4,}/.test(l)) {
        inCode = true;
        codeLines.push(l);
      } else if (inCode && l.trim() === "") {
        codeLines.push(l);
      } else {
        inCode = false;
        proseLines.push(l);
      }
    });

    if (codeLines.length >= 3) {
      codeBlocks.push({ lang: "", code: codeLines.join("\n").trim() });
      prose = proseLines.join("\n") + "\n{{CODE_BLOCK_0}}\n";
    }
  }

  return { prose, codeBlocks };
}

function restoreCodeBlocks(text, codeBlocks) {
  return text.replace(/\{\{CODE_BLOCK_(\d+)\}\}/g, (_, idx) => {
    const b = codeBlocks[Number(idx)];
    if (!b) return "";
    return `\n\`\`\`${b.lang}\n${b.code}\n\`\`\`\n`;
  });
}

function reduceSmart(text) {
  let s = stripFiller(text);
  const { prose, codeBlocks } = extractCodeAndProse(s);

  let cleanProse = prose
    .split("\n")
    .map(line => stripFiller(line.trim()))
    .filter(line => line.length > 0)
    .join("\n");

  let restored = restoreCodeBlocks(cleanProse, codeBlocks);
  return cleanChatText(restored);
}

function reduceAggressive(text) {
  let s = stripFiller(text);
  const { prose, codeBlocks } = extractCodeAndProse(s);

  let proseLines = prose
    .split("\n")
    .map(line => stripFiller(line.trim()))
    .filter(line => line.length > 0 && !isTrivialGreeting(line));

  let condensedProse = proseLines
    .slice(0, 4)
    .map(l => l.startsWith("-") || l.startsWith("•") ? l : "• " + l)
    .join("\n");

  let restored = restoreCodeBlocks(condensedProse, codeBlocks);
  return cleanChatText(restored);
}

function compress(msgs, mode) {
  if (mode === "context") return formatFullChat(msgs);
  if (mode === "raw") {
    return msgs.map(m => `[${m.role.toUpperCase()}]\n${cleanChatText(m.text)}`).join("\n\n---\n\n");
  }

  // Filter out pure greeting turns (e.g. "Hi" / "Hi! How can I help?")
  const meaningfulMsgs = msgs.filter(m => !isTrivialGreeting(m.text));
  const activeMsgs = meaningfulMsgs.length > 0 ? meaningfulMsgs : msgs;

  if (mode === "user-only") {
    return activeMsgs.filter(m => m.role === "human").map((m, i) => `Q${i + 1}: ${m.text.trim()}`).join("\n\n");
  }

  if (mode === "smart") {
    return activeMsgs.map(m => {
      const reduced = reduceSmart(m.text);
      return `${roleIcon(m.role)}${reduced}`;
    }).join("\n\n");
  }

  if (mode === "aggressive") {
    return "[Compressed Summary]\n" + activeMsgs.map(m => {
      const reduced = reduceAggressive(m.text);
      return `${roleTag(m.role)} ${reduced}`;
    }).join("\n\n");
  }

  return "";
}

function roleIcon(role) { return role === "human" ? "👤 " : role === "assistant" ? "🤖 " : "❔ "; }
function roleTag(role) { return role === "human" ? "U:" : role === "assistant" ? "A:" : "?:"; }

const $aiPrompt = document.getElementById("aiPrompt");
const $btnWaitAi = document.getElementById("btnWaitAi");
const $btnSendCurrent = document.getElementById("btnSendCurrent");
let isAiCompressing = false;

const FILLERS = [
  /^(sure[,!]?\s*)/i, /^(of course[,!]?\s*)/i, /^(certainly[,!]?\s*)/i,
  /^(absolutely[,!]?\s*)/i, /^(great question[!.]?\s*)/i,
  /^(buddy[,.]?\s*)/i,
  /^(i'?d be (happy|glad) to[^.]*\.\s*)/i,
  /(let me know if you (have|need|want)[^.]*[.!]?\s*)$/i,
  /(hope this helps?[^.]*[.!]?\s*)$/i,
  /(feel free to (ask|reach out)[^.]*[.!]?\s*)$/i,
  /(don'?t hesitate[^.]*[.!]?\s*)$/i
];

function stripFiller(t) {
  let s = t || "";
  for (const r of FILLERS) s = s.replace(r, "");
  return s.trim();
}

function cleanChatText(t) {
  return (t || "").replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function formatFullChat(msgs) {
  const page = state.pageContext || {};
  const header = [
    "# Full Chat Context",
    page.title ? `Title: ${page.title}` : "",
    page.url ? `Source: ${page.url}` : "",
    `Messages: ${msgs.length}`,
    "",
    "## Transcript"
  ].filter(line => line !== "").join("\n");

  const transcript = msgs.map((m, i) => {
    const role = m.role === "human" ? "User" : m.role === "assistant" ? "Assistant" : "Unknown";
    return `### ${i + 1}. ${role}\n${cleanChatText(m.text)}`;
  }).join("\n\n");

  return `${header}\n\n${transcript}`.trim();
}

function estTok(t) { return Math.ceil((t || "").length / 4); }

function renderCompressed() {
  const c = compress(state.rawMessages, state.mode);
  state.compressed = c;
  $preview.textContent = c || "(empty)";

  const orig = estTok(state.rawMessages.map(m => m.text).join(" "));
  const comp = estTok(c);
  const saved = Math.max(0, orig - comp);
  const pct = orig > 0 ? Math.round(saved / orig * 100) : 0;
  $stats.style.display = "flex";
  $tOrig.textContent = orig.toLocaleString();
  $tComp.textContent = comp.toLocaleString();
  $tSaved.textContent = `${saved.toLocaleString()} (${pct}%)`;
}

// ── AI COMPRESS via the selected provider ──────────────────────────────────────
$btnAI.addEventListener("click", async () => {
  if (!state.rawMessages.length) { showToast("Extract first!"); return; }

  const d = await chrome.storage.local.get(["providerSettings", "selectedProvider", "orPrompt"]);
  const providerId = d.selectedProvider && PROVIDERS[d.selectedProvider] ? d.selectedProvider : "openrouter";
  const saved = (d.providerSettings || {})[providerId] || {};
  const key = saved.key;
  if (!key) { showToast(`Add a ${PROVIDERS[providerId].label} key in Settings`); return; }

  const model = saved.model || PROVIDERS[providerId].models[0];
  const customPrompt = d.orPrompt || "";

  // Always feed the FULL accurate conversation transcript (not pre-truncated local mode output)
  const fullTranscript = state.rawMessages.map((m, i) => {
    const role = m.role === "human" ? "User" : m.role === "assistant" ? "Assistant" : "Participant";
    return `### ${role}:\n${cleanChatText(m.text)}`;
  }).join("\n\n");

  const systemPrompt = customPrompt ||
    `You are ChatBridge, an expert AI context compressor. Your job is to compress a conversation transcript between a User and an AI into a high-accuracy, high-density Engineering Context & Decision Handoff for another AI model to seamlessly continue the work.

Analyze the entire conversation narrative accurately and output a structured brief formatted exactly as:

[AI Context & Decision Handoff]
• Goal & Problem: <State the exact problem, user requirements, constraints, and objective>
• Decisions & Alternatives Evaluated: <Narrate what was done, what options were proposed, what was accepted, and what was REJECTED and why>
• Working Implementation & Code: <Include all key code blocks, algorithms, commands, or data structures with exact syntax. Do not truncate, omit, or alter logic>
• Current Status & Next Move: <State where the conversation left off and the exact immediate next task/question for the receiving AI model>

Rules:
1. ACCURACY & FIDELITY: Never hallucinate, never alter variable names, and never drop critical algorithmic logic or syntax.
2. NARRATIVE STORY: Clearly document the "why" — if an approach failed or was rejected in the chat, record it so the next AI does not repeat the mistake.
3. NO FILLER: Strip greetings, pleasantries, apologies, and meta-commentary.
4. Output plain text with standard markdown code blocks only.`;

  setLoading($btnAI, true, '<span class="stepno">2</span>✦ AI Compress', 'Summarizing…');
  isAiCompressing = true;
  try {
    const result = await chrome.runtime.sendMessage({
      action: "aiCompress",
      provider: providerId,
      key,
      model,
      systemPrompt,
      rawText: fullTranscript
    });
    if (!result || !result.success) throw new Error(result?.error || "Unknown response");
    const summary = result.summary;

    state.compressed = summary;
    $preview.textContent = summary;

    const orig = estTok(fullTranscript);
    const comp = estTok(summary);
    const saved = Math.max(0, orig - comp);
    const pct = orig > 0 ? Math.round(saved / orig * 100) : 0;
    $stats.style.display = "flex";
    $tOrig.textContent = orig.toLocaleString();
    $tComp.textContent = comp.toLocaleString();
    $tSaved.textContent = `${saved.toLocaleString()} (${pct}%)`;
    $btnSend.disabled = false;
    $aiPrompt.classList.add("hidden");
    showToast(`✦ AI compressed! This is the way. (${pct}% saved)`);
  } catch (e) {
    showToast("❌ Error: " + e.message.slice(0, 50));
  } finally {
    isAiCompressing = false;
    setLoading($btnAI, false, '<span class="stepno">2</span>✦ AI Compress');
  }
});

const SW_QUOTES = {
  extract: [
    "The Force is strong with this transcript 📜",
    "Help me, Obi-Wan Kenobi. You're my only hope ✨",
    "I've got a good feeling about this! 🟢",
    "A fine addition to my collection! 🔍"
  ],
  compress: [
    "This is the way. ✨",
    "Never tell me the odds! 🎯",
    "Do or do not, there is no try. 🪐",
    "These aren't the tokens you're looking for 👋",
    "Mind tricks worked! Useless tokens vaporized ⚡"
  ],
  send: [
    "Punch it, Chewie! 🚀",
    "Hyperspace jump complete! 🛸",
    "Making the Kessel Run in less than 12 parsecs 🌌",
    "Great shot, kid! That was one in a million 🎯",
    "Stay on target… Context delivered! 📡"
  ],
  copy: [
    "These ARE the tokens you're looking for 📋✨",
    "The context will be with you, always 🌌",
    "Your focus determines your reality. Copied! ⚔️",
    "Power! Unlimited power! ⚡"
  ],
  easterEgg: [
    "⚔️ Kyber Crystal Activated! May the Force be with your tokens!",
    "⚔️ I am one with the Force, and the Force is with me!",
    "⚔️ The Force will be with you. Always.",
    "⚔️ You underestimate my token efficiency!"
  ]
};

function getSWQuote(category) {
  const list = SW_QUOTES[category] || SW_QUOTES.compress;
  return list[Math.floor(Math.random() * list.length)];
}

// ── SEND ACTION HELPER ────────────────────────────────────────────────────────
async function executeSend() {
  if (!state.compressed) return;
  setLoading($btnSend, true, '<span class="stepno">3</span>Send →', 'Sending…');

  if (state.target === "clipboard") {
    try { await navigator.clipboard.writeText(state.compressed); }
    catch (_) {
      const ta = Object.assign(document.createElement("textarea"), { value: state.compressed });
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
    }
    showToast(`📋 ${getSWQuote("copy")}`);
    setLoading($btnSend, false, '<span class="stepno">3</span>Send →');
    return;
  }

  const text = state.compressed;
  const url = TARGET_URLS[state.target];
  let existingTabId = null;
  try {
    if (currentTab?.url && getTargetForHost(new URL(currentTab.url).hostname) === state.target) {
      existingTabId = currentTab.id;
    }
  } catch (_) { }
  try {
    showToast(existingTabId ? "⏳ Pasting into this tab…" : `⏳ Hyperspace jump to ${state.target}…`);
    const result = await chrome.runtime.sendMessage({ action: "openAndInject", url, text, existingTabId });
    showToast(result?.success ? `🚀 ${getSWQuote("send")} (${state.target})` : "⚠️ Opened, but paste failed");
  } catch (_) {
    showToast("⚠️ Auto-paste failed — use Copy mode");
  }
  setLoading($btnSend, false, '<span class="stepno">3</span>Send →');
}

// ── SEND ──────────────────────────────────────────────────────────────────────
$btnSend.addEventListener("click", () => {
  if (isAiCompressing) {
    $aiPrompt.classList.remove("hidden");
    return;
  }
  executeSend();
});

$btnWaitAi.addEventListener("click", () => {
  $aiPrompt.classList.add("hidden");
  showToast("⏳ Stay on target… Waiting for AI summary");
});

$btnSendCurrent.addEventListener("click", () => {
  $aiPrompt.classList.add("hidden");
  executeSend();
});

// ── Easter Egg: Kyber Crystal Lightsaber Glow ────────────────────────────────
let logoClickCount = 0;
let logoClickTimer = null;
const $logoEl = document.querySelector(".logo");
if ($logoEl) {
  $logoEl.style.cursor = "pointer";
  $logoEl.addEventListener("click", () => {
    logoClickCount++;
    clearTimeout(logoClickTimer);
    logoClickTimer = setTimeout(() => { logoClickCount = 0; }, 1200);
    if (logoClickCount >= 4) {
      logoClickCount = 0;
      $logoEl.classList.toggle("kyber-glow");
      const active = $logoEl.classList.contains("kyber-glow");
      showToast(active ? getSWQuote("easterEgg") : "🌌 Returned from Hyperspace");
    }
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function setLoading(btn, on, label, loadingText) {
  btn.disabled = on;
  btn.classList.toggle("loading", on);
  if (on) {
    btn.innerHTML = `<span class="spin"></span>${loadingText || "…"}`;
  } else if (label) {
    btn.innerHTML = label;
  }
}
function showToast(msg) {
  $toast.textContent = msg;
  $toast.classList.add("show");
  setTimeout(() => $toast.classList.remove("show"), 3000);
}
