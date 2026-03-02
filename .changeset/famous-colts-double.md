---
"@t-req/app": patch
---

- **Startup Auto-Update**: Automatic update checks with optional auto-upgrade for `treq open`, `tui`, and `web` commands
  - 24-hour check caching in `~/.treq/auto-update.json`
  - 24-hour backoff for failed upgrade attempts
  - CLI flags: `--auto-update` / `--no-auto-update` (default: enabled)
  - Environment variable: `TREQ_AUTO_UPDATE`
  - TUI toast notifications for update states
 Fixes
- **TUI Modal**: Fixed list overflow issues in picker modals with proper scrollbox constraints and centralized scroll index logic
