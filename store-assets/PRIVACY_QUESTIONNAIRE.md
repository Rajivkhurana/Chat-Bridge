# Chrome Web Store — Privacy Practices Tab

Draft answers for the Developer Dashboard's "Privacy practices" form. Copy each
section into its matching field. Based on the actual permissions in
`manifest.json` and what `background.js`/`popup.js` do — update this if the
code changes.

---

## Single purpose description

> ChatBridge reads the AI chat conversation currently open in the active tab,
> compresses it (locally, or optionally via an AI model using the user's own
> API key), and inserts the result into a new chat on another AI site or the
> clipboard. Its single purpose is moving conversation context between AI
> chat services.

---

## Permission justifications

**activeTab**
> Used only when the user clicks the extension icon or an action inside the
> popup. Grants temporary access to read the currently open tab's URL (to
> detect which AI site is open) and its page content (to extract the
> conversation). Never accesses tabs the user hasn't actively interacted with.

**scripting**
> Used to inject a read-only content script into the active tab that extracts
> the visible conversation text, and to insert the compressed result into the
> message box of a destination AI site after the user clicks Send. No script
> is injected without an explicit user action (Extract or Send).

**storage**
> Used to save the user's settings locally: which AI provider they've chosen
> for optional AI compression, their model name, their own API key for that
> provider, and an optional custom prompt. Stored only in `chrome.storage.local`
> on the user's device — never synced to a remote server we control.

**tabs**
> Used to read the active tab's URL (to show which AI site is detected) and to
> open a new tab when the user chooses to send the result to ChatGPT, Claude,
> Gemini, or Perplexity. Does not enumerate or monitor tabs the user hasn't
> directed the extension to act on.

**clipboardWrite**
> Used only for the "Copy" send option, so the compressed conversation can be
> copied to the clipboard for the user to paste manually.

**Host permissions — claude.ai, chatgpt.com, chat.openai.com,
gemini.google.com, perplexity.ai**
> Required to run the extraction and paste-injection content scripts on these
> specific chat sites. No other sites are touched.

**Host permissions — openrouter.ai, api.groq.com, api.together.xyz,
api.fireworks.ai, api.deepinfra.com, api.mistral.ai, api.openai.com,
integrate.api.nvidia.com**
> Required only for the optional "AI Compress" feature. When the user supplies
> their own API key for one of these providers and clicks AI Compress, the
> extracted conversation is sent directly from the user's browser to that
> provider's own API — never to a server operated by us. This only happens if
> the user has configured a key; the feature is otherwise inactive.

---

## Data usage disclosure

**Data collected:** Website content (the visible text of the AI conversation
the user chooses to extract).

**Not collected:** personally identifiable information, health info, financial
info, authentication credentials, location, web history, or user activity
tracking of any kind. The extension does not have analytics, telemetry, or a
backend server.

**Certifications you should be able to check honestly, based on this code:**
- ✅ Does not sell or transfer user data to third parties outside approved use
  cases (the only transfer is the conversation text sent to whichever AI
  provider API the user explicitly configured and invoked — a use case the
  user directly initiates and controls).
- ✅ Does not use or transfer user data for purposes unrelated to the item's
  single purpose.
- ✅ Does not use or transfer user data to determine creditworthiness or for
  lending purposes.

---

## Notes before submitting

- Point the listing's privacy policy link at `PRIVACY.md` (already in this
  repo) — it covers the same ground in more detail for end users.
- If you add a new AI provider or a new destination site later, remember to
  update the host-permission justifications above to match.
