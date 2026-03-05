---
"@t-req/sdk": patch
"@t-req/core": patch
"@t-req/app": patch
---

Add profile propagation through script and test runners. 

Scripts and tests now automatically inherit the active workspace configuration profile when executed. This enables seamless use of profile-specific variables across nested execution contexts without manual configuration.
When running scripts or tests, the active profile is passed via the `TREQ_PROFILE` environment variable. Spawned clients automatically use this profile for variable resolution when no explicit profile is configured, ensuring consistent behavior whether triggered from the dashboard, CLI, or programmatically.
