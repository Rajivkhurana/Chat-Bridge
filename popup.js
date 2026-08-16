// popup.js v2

const TARGET_URLS = {
  chatgpt:"https://chatgpt.com/",
  claude:"https://claude.ai/new",
  gemini:"https://gemini.google.com/app",
  perplexity:"https://www.perplexity.ai/"
};

// Every provider here exposes an OpenAI-compatible /chat/completions endpoint
// (actual request lives in background.js — this is just UI metadata).
const PROVIDERS = {
  openrouter: { label:"OpenRouter", keyPlaceholder:"sk-or-v1-…", helpUrl:"https://openrouter.ai",
    models:["mistralai/mistral-7b-instruct","google/gemma-3-4b-it:free","meta-llama/llama-3.1-8b-instruct","anthropic/claude-3-haiku","openai/gpt-4o-mini"] },
  nvidia: { label:"NVIDIA NIM", keyPlaceholder:"nvapi-…", helpUrl:"https://build.nvidia.com",
    models:["meta/llama-3.1-8b-instruct","meta/llama-3.1-70b-instruct","mistralai/mistral-7b-instruct-v0.3","nvidia/nemotron-4-340b-instruct"] },
  groq: { label:"Groq", keyPlaceholder:"gsk_…", helpUrl:"https://console.groq.com/keys",
    models:["llama-3.1-8b-instant","llama-3.3-70b-versatile","mixtral-8x7b-32768","gemma2-9b-it"] },
  together: { label:"Together AI", keyPlaceholder:"…", helpUrl:"https://api.together.ai",
    models:["meta-llama/Llama-3.1-8B-Instruct-Turbo","mistralai/Mixtral-8x7B-Instruct-v0.1","Qwen/Qwen2.5-7B-Instruct-Turbo"] },
  fireworks: { label:"Fireworks AI", keyPlaceholder:"fw_…", helpUrl:"https://fireworks.ai",
    models:["accounts/fireworks/models/llama-v3p1-8b-instruct","accounts/fireworks/models/mixtral-8x7b-instruct"] },
  deepinfra: { label:"DeepInfra", keyPlaceholder:"…", helpUrl:"https://deepinfra.com",
    models:["meta-llama/Meta-Llama-3.1-8B-Instruct","mistralai/Mistral-7B-Instruct-v0.3"] },
  mistral: { label:"Mistral AI", keyPlaceholder:"…", helpUrl:"https://console.mistral.ai",
    models:["mistral-small-latest","mistral-large-latest","open-mistral-nemo"] },
  openai: { label:"OpenAI", keyPlaceholder:"sk-…", helpUrl:"https://platform.openai.com/api-keys",
    models:["gpt-4o-mini","gpt-4o","gpt-4.1-mini"] }
};

let state = { mode:"smart", target:"chatgpt", rawMessages:[], pageContext:null, compressed:"" };
let providerSettings = {}; // { [providerId]: { key, model } }

const $dot       = document.getElementById("dot");
const $stxt      = document.getElementById("stxt");
const $preview   = document.getElementById("preview");
const $stats     = document.getElementById("stats");
const $tOrig     = document.getElementById("tOrig");
const $tComp     = document.getElementById("tComp");
const $tSaved    = document.getElementById("tSaved");
const $btnExtract= document.getElementById("btnExtract");
const $btnAI     = document.getElementById("btnAI");
const $btnSend   = document.getElementById("btnSend");
const $toast     = document.getElementById("toast");
const $orProvider= document.getElementById("orProvider");
const $orKey     = document.getElementById("orKey");
const $orKeyLabel= document.getElementById("orKeyLabel");
const $orKeyHint = document.getElementById("orKeyHint");
const $orModel   = document.getElementById("orModel");
const $modelOpts = document.getElementById("modelOptions");
const $orPrompt  = document.getElementById("orPrompt");

let currentTab = null;

// ── Tabs ──────────────────────────────────────────────────────────────────────
document.querySelectorAll(".tab").forEach(t => {
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
    t.classList.add("active");
    document.querySelectorAll(".panel").forEach(p=>p.classList.add("hidden"));
    document.getElementById("panel-"+t.dataset.panel).classList.remove("hidden");
  });
});

// ── Load saved settings ───────────────────────────────────────────────────────
let selectedProviderId = "openrouter";

chrome.storage.local.get(["providerSettings","selectedProvider","orPrompt"], (d) => {
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
  else $btnAI.title = "Summarizes the text shown in Preview (per the Output Mode selected above)";
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

  providerSettings[providerId] = { key, model: $orModel.value.trim() };
  selectedProviderId = providerId;
  chrome.storage.local.set({
    providerSettings,
    selectedProvider: providerId,
    orPrompt: $orPrompt.value.trim()
  });
  updateAiButtonState();
  showToast("✅ Settings saved!");
});

// ── Detect tab ────────────────────────────────────────────────────────────────
chrome.tabs.query({ active:true, currentWindow:true }, ([tab]) => {
  currentTab = tab;
  if (!tab?.url) return;
  try {
    const h = new URL(tab.url).hostname;
    const ok = ["claude.ai","chatgpt.com","openai.com","gemini.google.com","perplexity.ai"].some(x=>h.includes(x));
    if (ok) {
      $dot.classList.add("ok"); $stxt.innerHTML=`<b>${getFriendly(h)}</b> — ready`;
      const currentTarget = getTargetForHost(h);
      if (currentTarget === state.target) {
        const next = ["chatgpt","claude","gemini"].find(t => t !== currentTarget);
        if (next) {
          document.querySelectorAll(".tbtn").forEach(b=>b.classList.toggle("sel", b.dataset.target===next));
          state.target = next;
        }
      }
    }
    else { $stxt.innerHTML="Not an AI chat page"; }
  } catch(_){}
});

function getFriendly(h) {
  if (h.includes("claude"))    return "Claude";
  if (h.includes("chatgpt")||h.includes("openai")) return "ChatGPT";
  if (h.includes("gemini"))    return "Gemini";
  if (h.includes("perplexity"))return "Perplexity";
  return h;
}

function getTargetForHost(h) {
  if (h.includes("claude"))    return "claude";
  if (h.includes("chatgpt")||h.includes("openai")) return "chatgpt";
  if (h.includes("gemini"))    return "gemini";
  if (h.includes("perplexity"))return "perplexity";
  return null;
}

// ── Option pickers ────────────────────────────────────────────────────────────
function selectOpt(el) {
  document.querySelectorAll(".opt").forEach(o=>{
    o.classList.remove("sel");
    o.setAttribute("aria-pressed","false");
  });
  el.classList.add("sel");
  el.setAttribute("aria-pressed","true");
  state.mode=el.dataset.mode;
  if(state.rawMessages.length) renderCompressed();
}
document.querySelectorAll(".opt").forEach(el=>{
  el.addEventListener("click",()=>selectOpt(el));
  el.addEventListener("keydown",(e)=>{
    if (e.key==="Enter" || e.key===" ") { e.preventDefault(); selectOpt(el); }
  });
});
document.querySelectorAll(".tbtn").forEach(el=>{
  el.addEventListener("click",()=>{
    document.querySelectorAll(".tbtn").forEach(b=>b.classList.remove("sel"));
    el.classList.add("sel"); state.target=el.dataset.target;
  });
});

// ── EXTRACT ───────────────────────────────────────────────────────────────────
$btnExtract.addEventListener("click", async () => {
  if (!currentTab) { showToast("No active tab"); return; }
  setLoading($btnExtract, true);
  try {
    const results = await chrome.scripting.executeScript({
      target:{ tabId: currentTab.id },
      func: domExtract
    });
    const extracted = results?.[0]?.result ?? [];
    const messages = Array.isArray(extracted) ? extracted : (extracted.messages || []);
    state.pageContext = Array.isArray(extracted) ? null : (extracted.pageContext || null);
    state.rawMessages = messages;
    if (!messages.length) {
      showToast("⚠️ Nothing found — try scrolling the chat fully loaded");
    } else {
      renderCompressed();
      $btnSend.disabled = false;
      $btnSend.title = "";
      updateAiButtonState();
      const lowConfidence = messages.every(m => m.role === "unknown");
      showToast(lowConfidence
        ? `⚠️ Got ${messages.length} block(s), but couldn't tell user from AI — check the preview`
        : `✅ Got ${messages.length} message${messages.length>1?"s":""}`);
    }
  } catch(e) {
    $dot.className = "dot err";
    showToast("❌ Access denied — reload the tab then try again");
  }
  setLoading($btnExtract, false, '<span class="stepno">1</span>⬇ Extract');
});

// ── DOM EXTRACTION (runs inside page) ─────────────────────────────────────────
function domExtract() {
  const msgs = [];
  const host = location.hostname;
  const pageContext = {
    title: document.title || "",
    url: location.href,
    host
  };

  // ════════════════════════════════════════════════
  //  CLAUDE.AI
  // ════════════════════════════════════════════════
  if (host.includes("claude.ai")) {
    // Strategy 1: data-testid attributes
    const byTestId = [
      ...document.querySelectorAll('[data-testid="user-message"]')
        .values()
    ].map(el=>({role:"human",el})).concat([
      ...document.querySelectorAll('[data-testid="assistant-message"]')
        .values()
    ].map(el=>({role:"assistant",el})));

    // Strategy 2: look for the turn wrapper divs and figure out role from icons/aria
    const byTurn = [];
    document.querySelectorAll('[class*="ChatMessage"],[class*="turn"],[class*="Turn"],[class*="Message"]').forEach(el=>{
      const cls = (el.className||"").toLowerCase();
      const aria = (el.getAttribute("aria-label")||"").toLowerCase();
      const role = (cls.includes("human")||cls.includes("user")||aria.includes("human")||aria.includes("you"))
        ? "human"
        : (cls.includes("assistant")||cls.includes("claude")||aria.includes("assistant")||aria.includes("claude"))
        ? "assistant" : null;
      if (role) byTurn.push({role, el});
    });

    // Strategy 3: content-editable siblings + prose blocks (most reliable fallback)
    const byProse = [];
    document.querySelectorAll('.font-claude-message, [class*="prose"], [class*="markdown"]').forEach(el=>{
      byProse.push({role:"assistant", el});
    });
    document.querySelectorAll('[class*="bg-bg-300"],[class*="rounded-3xl"],[class*="user-bubble"]').forEach(el=>{
      const t = el.innerText?.trim();
      if(t && t.length>2) byProse.push({role:"human",el});
    });

    // Pick the strategy with the most results
    const candidates = [byTestId, byTurn, byProse].sort((a,b)=>b.length-a.length);
    const best = candidates[0];

    if (best.length > 0) {
      // Filter out parent elements to avoid duplicate/nested text extraction
      const leaves = best.filter(i1 => !best.some(i2 => i1 !== i2 && i1.el.contains(i2.el)));
      // Sort by DOM order
      leaves.sort((a,b)=>a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
      const seen = new Set();
      for (const {role,el} of leaves) {
        const t = el.innerText?.trim();
        if (t && t.length>1 && !seen.has(t)) { seen.add(t); msgs.push({role,text:t}); }
      }
    }

    // FINAL FALLBACK: grab every text block from the main scroll area in DOM order.
    // Capped — this is a low-confidence guess, not a real parse, so it must not flood the popup.
    if (msgs.length === 0) {
      const scroll = document.querySelector('[class*="overflow-y-auto"],[class*="overflow-auto"],main');
      const root = scroll || document.body;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      const seen2 = new Set();
      let node;
      const FALLBACK_CAP = 150;
      while ((node = walker.nextNode()) && msgs.length < FALLBACK_CAP) {
        const tag = node.tagName?.toLowerCase();
        if (["script","style","svg","button","input","nav"].includes(tag)) continue;
        const childEls = node.children.length;
        const text = node.innerText?.trim() || "";
        if (text.length > 15 && childEls < 8 && !seen2.has(text)) {
          seen2.add(text);
          msgs.push({role:"unknown", text});
        }
      }
    }
  }

  // ════════════════════════════════════════════════
  //  CHATGPT
  // ════════════════════════════════════════════════
  else if (host.includes("chatgpt.com") || host.includes("openai.com")) {
    const items = [];
    document.querySelectorAll("[data-message-author-role]").forEach(el=>{
      const role = el.getAttribute("data-message-author-role")==="user"?"human":"assistant";
      items.push({role,el});
    });
    if (!items.length) {
      document.querySelectorAll("[class*='ConversationItem'],[class*='chat-message'],[class*='message-content']").forEach(el=>{
        items.push({role:"unknown",el});
      });
    }
    // Filter out parent elements to avoid duplicate/nested text extraction
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
    // Filter out parent elements to avoid duplicate/nested text extraction
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
    // Filter out parent elements to avoid duplicate/nested text extraction
    const leaves = items.filter(i1 => !items.some(i2 => i1 !== i2 && i1.el.contains(i2.el)));
    leaves.sort((a, b) => a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    leaves.forEach(({ role, el }) => {
      const text = el.innerText?.trim();
      if (text) msgs.push({ role, text });
    });
  }

  // Deduplicate & clean
  const seen = new Set();
  const messages = msgs.filter(m=>{
    if (!m.text || m.text.length<2) return false;
    if (seen.has(m.text)) return false;
    seen.add(m.text); return true;
  });
  return { messages, pageContext };
}

// ── Compression (local) ───────────────────────────────────────────────────────
function compress(msgs, mode) {
  if (mode==="context") {
    return formatFullChat(msgs);
  }
  if (mode==="raw")
    return msgs.map(m=>`[${m.role.toUpperCase()}]\n${cleanChatText(m.text)}`).join("\n\n---\n\n");
  if (mode==="user-only")
    return msgs.filter(m=>m.role==="human").map((m,i)=>`Q${i+1}: ${m.text}`).join("\n\n");
  if (mode==="smart")
    return msgs.map(m=>{
      let t = stripFiller(m.text);
      t = trunc(t,600);
      return roleIcon(m.role)+t;
    }).join("\n\n");
  if (mode==="aggressive")
    return "[Compressed]\n"+msgs.map(m=>{
      let t = stripFiller(stripMd(m.text));
      t = trunc(t,200);
      return roleTag(m.role)+" "+t;
    }).join("\n");
  return "";
}
function roleIcon(role){ return role==="human" ? "👤 " : role==="assistant" ? "🤖 " : "❔ "; }
function roleTag(role){ return role==="human" ? "U:" : role==="assistant" ? "A:" : "?:"; }

const FILLERS = [
  /^(sure[,!]?\s*)/i,/^(of course[,!]?\s*)/i,/^(certainly[,!]?\s*)/i,
  /^(absolutely[,!]?\s*)/i,/^(great question[!.]?\s*)/i,
  /^(i'?d be (happy|glad) to[^.]*\.\s*)/i,
  /(let me know if you (have|need|want)[^.]*[.!]?\s*)$/i,
  /(hope this helps?[^.]*[.!]?\s*)$/i,
  /(feel free to (ask|reach out)[^.]*[.!]?\s*)$/i,
  /(don'?t hesitate[^.]*[.!]?\s*)$/i
];
function stripFiller(t){let s=t;for(const r of FILLERS)s=s.replace(r,"");return s.trim();}
function stripMd(t) {
  return t
    .replace(/```[a-z]*\n([\s\S]*?)\n```/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/#+\s+(.*)/g, "$1")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}
function cleanChatText(t){return (t||"").replace(/\r\n/g,"\n").replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n").trim();}
function formatFullChat(msgs){
  const page = state.pageContext || {};
  const header = [
    "# Full Chat Context",
    page.title ? `Title: ${page.title}` : "",
    page.url ? `Source: ${page.url}` : "",
    `Messages: ${msgs.length}`,
    "",
    "## Transcript"
  ].filter(line => line !== "").join("\n");

  const transcript = msgs.map((m,i)=>{
    const role = m.role === "human" ? "User" : m.role === "assistant" ? "Assistant" : "Unknown";
    return `### ${i+1}. ${role}\n${cleanChatText(m.text)}`;
  }).join("\n\n");

  return `${header}\n\n${transcript}`.trim();
}
function trunc(t,n){return t.length<=n?t:t.slice(0,n).trimEnd()+"…";}
function estTok(t){return Math.ceil(t.length/4);}

function renderCompressed() {
  const c = compress(state.rawMessages, state.mode);
  state.compressed = c;
  $preview.textContent = c || "(empty)";

  const orig = estTok(state.rawMessages.map(m=>m.text).join(" "));
  const comp = estTok(c);
  const saved = Math.max(0, orig-comp);
  const pct = orig>0?Math.round(saved/orig*100):0;
  $stats.style.display="flex";
  $tOrig.textContent=orig.toLocaleString();
  $tComp.textContent=comp.toLocaleString();
  $tSaved.textContent=`${saved.toLocaleString()} (${pct}%)`;
}

// ── AI COMPRESS via the selected provider ──────────────────────────────────────
$btnAI.addEventListener("click", async () => {
  if (!state.rawMessages.length) { showToast("Extract first!"); return; }

  const d = await chrome.storage.local.get(["providerSettings","selectedProvider","orPrompt"]);
  const providerId = d.selectedProvider && PROVIDERS[d.selectedProvider] ? d.selectedProvider : "openrouter";
  const saved = (d.providerSettings || {})[providerId] || {};
  const key = saved.key;
  if (!key) { showToast(`Add a ${PROVIDERS[providerId].label} key in Settings`); return; }

  const model = saved.model || PROVIDERS[providerId].models[0];
  const customPrompt = d.orPrompt || "";

  const rawText = compress(state.rawMessages, state.mode);

  const systemPrompt = customPrompt ||
    `You compress AI chat conversations. Current date: ${new Date().toLocaleDateString()}. Output a concise context summary under 300 words. Keep all key facts, decisions, code snippets, and user goals. Remove greetings, filler phrases, and redundant explanations. Plain text only, no markdown headers.`;

  setLoading($btnAI, true);
  try {
    const result = await chrome.runtime.sendMessage({
      action: "aiCompress",
      provider: providerId,
      key,
      model,
      systemPrompt,
      rawText
    });
    if (!result || !result.success) throw new Error(result?.error || "Unknown response");
    const summary = result.summary;

    state.compressed = summary;
    $preview.textContent = summary;

    const orig = estTok(rawText);
    const comp = estTok(summary);
    const saved = Math.max(0,orig-comp);
    const pct = orig>0?Math.round(saved/orig*100):0;
    $stats.style.display="flex";
    $tOrig.textContent=orig.toLocaleString();
    $tComp.textContent=comp.toLocaleString();
    $tSaved.textContent=`${saved.toLocaleString()} (${pct}%)`;
    $btnSend.disabled=false;
    showToast(`✦ AI compressed! ${pct}% saved`);
  } catch(e) {
    showToast("❌ OpenRouter error: "+e.message.slice(0,50));
  }
  setLoading($btnAI, false, '<span class="stepno">2</span>✦ AI Compress');
});

// ── SEND ──────────────────────────────────────────────────────────────────────
$btnSend.addEventListener("click", async () => {
  if (!state.compressed) return;
  setLoading($btnSend, true);

  if (state.target==="clipboard") {
    try { await navigator.clipboard.writeText(state.compressed); }
    catch(_){
      const ta=Object.assign(document.createElement("textarea"),{value:state.compressed});
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
    }
    showToast("📋 Copied! Paste with Ctrl+V");
    setLoading($btnSend,false,'<span class="stepno">3</span>Send →');
    return;
  }

  const text = state.compressed;
  const url  = TARGET_URLS[state.target];
  let existingTabId = null;
  try {
    if (currentTab?.url && getTargetForHost(new URL(currentTab.url).hostname) === state.target) {
      existingTabId = currentTab.id;
    }
  } catch(_){}
  try {
    showToast(existingTabId ? "⏳ Pasting into this tab…" : "⏳ Opening "+state.target+"…");
    const result = await chrome.runtime.sendMessage({ action:"openAndInject", url, text, existingTabId });
    showToast(result?.success ? "🚀 Pasted into "+state.target+"!" : "⚠️ Opened, but paste failed");
  } catch(_) {
    showToast("⚠️ Auto-paste failed — use Copy mode");
  }
  setLoading($btnSend,false,'<span class="stepno">3</span>Send →');
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function setLoading(btn, on, label) {
  btn.disabled = on;
  btn.innerHTML = on ? '<span class="spin"></span>' : label;
}
function showToast(msg) {
  $toast.textContent=msg;
  $toast.classList.add("show");
  setTimeout(()=>$toast.classList.remove("show"),3000);
}
