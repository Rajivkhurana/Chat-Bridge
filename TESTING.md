# ChatBridge — Test Plan

Four passes to run before every release: validation, regression, migration,
and a manual UAT script on the real sites. Static review, code-level fixes,
and a scripted live run (mock DOM + real `popup.js`/`background.js`) are
already done — see the conversation history / QA log for that evidence. This
document is what's left for a human to run on the real thing.

---

## 1. Validation testing

Checks that the extension refuses to do the wrong thing, rather than failing
silently or doing it anyway.

| # | Scenario | Expected result |
|---|----------|------------------|
| V1 | Open popup with no chat extracted yet | AI Compress and Send are disabled; hovering AI Compress shows "Extract a chat first" |
| V2 | Extract a chat, no API key saved for the **currently selected** provider | AI Compress stays **disabled** — even if some *other* provider has a saved key. Hover shows "Add a `<Provider>` key in Settings" |
| V3 | Save Settings with the key field empty | Save is rejected with a toast ("Add your `<Provider>` API key before saving"); focus returns to the key field; nothing is written to storage |
| V4 | Save a key, switch the provider dropdown to a different provider *without* saving | AI Compress state on the Main tab does **not** change until Save is clicked — it must reflect the last *saved* provider, not whatever's showing in the dropdown |
| V5 | Save a key with leading/trailing whitespace | Whitespace is trimmed before it's stored and before it's sent as a Bearer token |
| V6 | Leave Model Name blank and use AI Compress | Falls back to the provider's first default model, no error |
| V7 | Click Extract on a page with no recognizable conversation | Toast: "Nothing found — try scrolling the chat fully loaded"; Send stays disabled |
| V8 | Click AI Compress while it's disabled (keyboard or forced click) | No request is sent — disabled buttons are inert at the browser level, not just styled |

**V2–V4 were a real gap** (AI Compress used to enable itself off "does *any*
provider* have a key," not "does the *selected* one") — fixed in
`popup.js` (`hasSelectedProviderKey`, `updateAiButtonState`). Confirm V2–V4
explicitly after any change near provider/settings handling.

---

## 2. Regression checklist

One line per fix made this cycle. Re-run all of these after *any* future
change to `popup.js`, `popup.html`, or `background.js` — a change to one
often has a side effect on another (e.g. the AI Compress fix above touched
the same button state that Extract also manages).

- [ ] AI Compress runs on the **mode-compressed** text (Smart/Aggressive/etc.), not the raw dump
- [ ] AI Compress is disabled until both "chat extracted" *and* "selected provider has a key" are true
- [ ] Send To auto-shifts off the site you're currently on; sending to that same site reuses the tab instead of opening a duplicate
- [ ] Perplexity appears as a send target and pastes into its input correctly
- [ ] Output Mode cards are keyboard-operable (Tab + Enter/Space selects them, `aria-pressed` updates)
- [ ] API key field has a working show/hide (👁) toggle
- [ ] Default Output Mode is **Smart**, not Full Chat
- [ ] Toast never covers the Extract / AI Compress / Send row, at any message length
- [ ] Disabled buttons render visibly flat/grey, not just dimmed

---

## 3. Migration / version-upgrade testing

Chrome and Firefox auto-update an installed extension in place — existing
users' `chrome.storage.local` data has to survive that, untouched by any code
you ship later.

| # | Scenario | Expected result |
|---|----------|------------------|
| M1 | Install the current version, save a key + model + custom prompt for **two** different providers, then reload the unpacked extension (simulating an update) | Both providers' settings are still there; the dropdown still shows the last-selected one |
| M2 | Simulate an old stored object missing a field a newer version expects (e.g. no `orPrompt` key at all) | Popup loads without throwing; falls back to the built-in default prompt — already covered by the `||`/`?.` fallbacks throughout `popup.js`, but worth a manual confirmation after schema changes |
| M3 | After any `manifest.json` edit | Diff against `manifest.firefox.json` — the two must stay in sync on everything except the `background` key and `browser_specific_settings` |
| M4 | Bump `version` in `manifest.json` | Confirm it was bumped in `manifest.firefox.json` too |

---

## 4. UAT script (manual, on real sites — do this before submitting)

This is the one pass that needs a human logged into real accounts. Run it
top to bottom; check off each line.

**Setup**
- [ ] Load unpacked in Chrome, pin the icon
- [ ] Load unpacked in Firefox via `manifest.firefox.json` if you ship there too

**Per site — claude.ai, chatgpt.com, gemini.google.com, perplexity.ai:**
- [ ] Open a real conversation with at least 4–5 turns
- [ ] Click the icon → status dot goes green, correct site name shown
- [ ] Extract → correct number of messages, correct human/assistant roles, no duplicated text
- [ ] Cycle through all five Output Modes → preview updates each time, stats (orig/compressed/saved) look sane
- [ ] Send To a *different* site → new tab opens, text lands in that site's message box, ready to submit (don't have to actually send it)
- [ ] Send To the *same* site you're on → reuses the current tab instead of opening a second one
- [ ] Copy mode → paste into a scratch text field, confirm it matches the preview

**AI Compress, with a real key:**
- [ ] Add a real key for one real provider in Settings, save
- [ ] Extract a chat, click AI Compress → real summary comes back, stats update, Send enables
- [ ] Switch provider in Settings without saving → back on Main, AI Compress state doesn't change yet
- [ ] Save the new provider (with its key) → AI Compress now reflects that provider

**Edge cases**
- [ ] A very short chat (1 message) → still extracts and sends correctly
- [ ] A very long chat (50+ messages) → Extract doesn't hang; preview scrolls instead of breaking layout
- [ ] Revoke/clear the saved key, confirm AI Compress disables again immediately after Save

**Sign-off**
- [ ] All boxes above checked, on all four sites
- [ ] No console errors in the popup's devtools during any of the above
