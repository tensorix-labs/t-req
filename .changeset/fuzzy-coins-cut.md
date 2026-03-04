---
"@t-req/app": patch
"t-req-vscode": patch
---

- Enable syntax highlighting in the TUI response panel for JSON, HTML, and YAML responses (including JSON detection fallback when content-type is missing).
- Improve footer keybind label spacing in the TUI status bar.

---

## "t-req-vscode": patch

- Add hover tooltips for `{{variable}}` references in `.http` files.
- Show resolved values and source attribution (file variable, config, or profile) directly in hover content.
- Improve hover handling for resolver expressions and undefined variables with clearer messaging.
