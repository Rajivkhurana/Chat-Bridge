// background.js

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "openAndInject") {
    openAndInject(msg.url, msg.text, msg.existingTabId)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (msg.action === "aiCompress") {
    aiCompress(msg.provider, msg.key, msg.model, msg.systemPrompt, msg.rawText)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  return false;
});

async function openAndInject(url, text, existingTabId) {
  let tab = existingTabId ? await chrome.tabs.update(existingTabId, { url, active: true }).catch(() => null) : null;
  if (!tab) tab = await chrome.tabs.create({ url, active: true });
  await waitForTabComplete(tab.id);

  for (let attempt = 0; attempt < 12; attempt++) {
    await sleep(attempt === 0 ? 1200 : 1500);
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: pasteIntoAiEditor,
      args: [text]
    });

    if (result?.result?.success) {
      return { success: true, tabId: tab.id };
    }
  }

  return { success: false, error: "Could not find the chat input — the page may still be loading, or its layout changed. Try Copy mode instead." };
}

function waitForTabComplete(tabId) {
  return new Promise(resolve => {
    chrome.tabs.get(tabId, tab => {
      if (tab?.status === "complete") {
        resolve();
        return;
      }

      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function pasteIntoAiEditor(text) {
  const host = location.hostname;
  const selectors = getEditorSelectors(host);
  const editor = findEditor(selectors);

  if (!editor) return { success: false };

  editor.focus();
  setSelectionToEnd(editor);

  const inserted = document.execCommand("insertText", false, text);
  if (!inserted) setEditorValue(editor, text);

  dispatchEditorEvents(editor);
  return { success: true };

  function getEditorSelectors(hostname) {
    if (hostname.includes("chatgpt.com") || hostname.includes("openai.com")) {
      return [
        "#prompt-textarea",
        "[data-testid='prompt-textarea']",
        "textarea",
        "[contenteditable='true']"
      ];
    }

    if (hostname.includes("claude.ai")) {
      return [
        "[data-testid='chat-input'] [contenteditable='true']",
        ".ProseMirror[contenteditable='true']",
        "[contenteditable='true']",
        "textarea"
      ];
    }

    if (hostname.includes("gemini.google.com")) {
      return [
        "rich-textarea [contenteditable='true']",
        ".ql-editor[contenteditable='true']",
        "[contenteditable='true']",
        "textarea"
      ];
    }

    if (hostname.includes("perplexity.ai")) {
      return [
        "textarea[placeholder]",
        "#ask-input",
        "[contenteditable='true']",
        "textarea"
      ];
    }

    return ["#prompt-textarea", "[contenteditable='true']", "textarea"];
  }

  function findEditor(selectorList) {
    for (const selector of selectorList) {
      const matches = [...document.querySelectorAll(selector)];
      const visible = matches.find(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && !el.disabled && !el.readOnly;
      });
      if (visible) return visible;
    }
    return null;
  }

  function setSelectionToEnd(el) {
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      el.selectionStart = el.value.length;
      el.selectionEnd = el.value.length;
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function setEditorValue(el, value) {
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      const proto = el.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(el, value);
      else el.value = value;
      return;
    }

    el.textContent = value;
  }

  function dispatchEditorEvents(el) {
    ["beforeinput", "input", "change", "keyup"].forEach(type => {
      el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
    });
  }
}

// All of these expose an OpenAI-compatible /chat/completions endpoint, so one
// request shape works for all of them — only the base URL and label differ.
const PROVIDER_ENDPOINTS = {
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  nvidia: "https://integrate.api.nvidia.com/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  together: "https://api.together.xyz/v1/chat/completions",
  fireworks: "https://api.fireworks.ai/inference/v1/chat/completions",
  deepinfra: "https://api.deepinfra.com/v1/openai/chat/completions",
  mistral: "https://api.mistral.ai/v1/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions"
};

async function aiCompress(provider, key, model, systemPrompt, rawText) {
  const endpoint = PROVIDER_ENDPOINTS[provider];
  if (!endpoint) throw new Error(`Unknown provider: ${provider}`);

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${key}`
  };
  if (provider === "openrouter") headers["HTTP-Referer"] = "https://chatbridge.ext";

  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Compress this conversation:\n\n${rawText}` }
        ],
        max_tokens: 600
      })
    });
  } catch (_e) {
    throw new Error("Network error — check your connection and try again");
  }

  let data;
  try {
    data = await res.json();
  } catch (_e) {
    throw new Error(`OpenRouter returned an unreadable response (HTTP ${res.status})`);
  }

  if (data.error) throw new Error(data.error.message || "OpenRouter rejected the request");
  if (!res.ok) {
    if (res.status === 401) throw new Error("Invalid API key — check Settings");
    if (res.status === 429) throw new Error("Rate limited by OpenRouter — wait a moment and retry");
    throw new Error(`OpenRouter error (HTTP ${res.status})`);
  }

  const summary = data.choices?.[0]?.message?.content?.trim();
  if (!summary) throw new Error("Empty response from model — try a different model in Settings");
  return { success: true, summary };
}
