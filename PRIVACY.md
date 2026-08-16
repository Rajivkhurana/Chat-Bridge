# Privacy Policy — ChatBridge

**Last updated:** 2026-08-11

ChatBridge ("the extension") is a browser extension that reads the conversation on
an AI chat page you're currently viewing, compresses it, and sends it to another
supported AI chat site (or your clipboard). This document explains exactly what
data the extension touches and where it goes.

## What the extension does with your data

- **Chat extraction happens locally, in your browser.** When you click "Extract,"
  the extension reads the visible conversation text from the current tab
  (Claude, ChatGPT, Gemini, or Perplexity) using standard DOM access. This text
  never leaves your device unless you explicitly choose an action that sends it
  somewhere (see below).
- **Local compression (Full Chat / Smart / Aggressive / User Only / Raw modes)**
  runs entirely on your device. No network request is made for these modes.
- **AI Compress (optional)** sends the extracted conversation text to the AI
  provider you select in Settings (OpenRouter, NVIDIA, Groq, Together AI,
  Fireworks, DeepInfra, Mistral, or OpenAI), using the API key you provide, so
  that provider's model can generate a summary. That request goes **directly
  from your browser to that provider's API** — it does not pass through any
  server operated by us.
- **Sending the result** either copies it to your clipboard or opens the target
  chat site (ChatGPT, Claude, or Gemini) in a new tab and pastes the text into
  its input box. Nothing is transmitted anywhere except the site you chose to
  open.

## What we store

- **API keys and model preferences** you enter in Settings are stored using
  `chrome.storage.local`, which keeps data only on your own device. We do not
  operate any backend server, and we never receive, log, or have access to
  your keys, your conversations, or any compressed output.
- **No accounts, no analytics, no tracking.** The extension does not use
  cookies, analytics SDKs, or any third-party tracking of any kind.

## Third parties involved

When you use AI Compress, your extracted conversation text and your API key
are sent directly to the third-party AI provider you selected, subject to
**that provider's own privacy policy and terms**:

- OpenRouter — https://openrouter.ai
- NVIDIA NIM — https://build.nvidia.com
- Groq — https://groq.com
- Together AI — https://www.together.ai
- Fireworks AI — https://fireworks.ai
- DeepInfra — https://deepinfra.com
- Mistral AI — https://mistral.ai
- OpenAI — https://openai.com

We are not affiliated with any of these providers and are not responsible for
how they handle data once your browser sends it to them.

## Permissions

The extension requests the following browser permissions, used only as
described:

| Permission | Why it's needed |
|---|---|
| `activeTab` / `scripting` | Read the chat conversation on the current tab, and paste compressed text into a target chat site's input box, only when you click a button. |
| `storage` | Save your provider selection, API keys, and preferences locally. |
| `tabs` | Open a new tab for the AI site you choose to send to. |
| `clipboardWrite` | Copy the compressed output when you choose "Copy" as the target. |
| Host permissions (claude.ai, chatgpt.com, gemini.google.com, perplexity.ai, and the AI provider APIs listed above) | Required to read/paste on those chat sites and to call the provider API you selected. |

## Your choices

- AI Compress is entirely optional — the extension is fully usable with the
  local compression modes and no API key at all.
- You can delete any stored key or setting at any time from the Settings tab,
  or by clearing the extension's storage via your browser's extension
  management page.

## Changes to this policy

If this policy changes, the "Last updated" date above will be revised. Since
the extension does not collect contact information from users, we recommend
checking this file periodically if you have concerns.

## Contact

Questions about this policy: **email**
