# Security Policy

## Supported Versions

| Package | Version | Supported |
|---------|---------|-----------|
| @t-req/core | 0.2.x | :white_check_mark: |
| @t-req/app | 0.3.x | :white_check_mark: |

## Security Model

### Overview

t-req is an HTTP request tool that runs locally on your machine. It parses `.http` files and executes requests against URLs you specify. It also provides a local server and optional web dashboard for development workflows.

### No Sandbox

t-req does **not** sandbox request execution or command resolvers. The configuration system (`treq.json`) exists to customize behavior, not to provide security isolation.

If you need true isolation, run t-req inside a Docker container or VM.

### Server Mode

The `treq serve` command starts a local HTTP server for multi-language access to t-req functionality.

- Binds to `localhost` by default
- Intended for local development only
- **Do not expose to the public internet** — it is not hardened for public access

### Web Dashboard

The web dashboard (`treq open --web`) is a development tool for visual debugging.

- Connects to the local server only
- Not designed for production or public deployment

### Command Resolvers

t-req can execute command resolvers defined in your configuration. These run through whitelisted interpreters only (`node`, `bun`, `tsx`, `python`, `ruby`, `go`, `sh`, `bash`) with execution timeouts and output limits.

Resolvers execute **your** scripts with **your** environment — they are not sandboxed.

### Out of Scope

The following are **not** considered vulnerabilities:

| Category | Rationale |
|----------|-----------|
| HTTP request destinations | You control what URLs your `.http` files target |
| `.http` file contents | User-authored files are user responsibility |
| Command resolver behavior | Resolvers run your scripts in your environment |
| Config file modifications | Users control their own `treq.config.ts` |
| Environment variable exposure | Resolvers inherit your environment by design |

---

## Reporting a Vulnerability

We take security seriously. If you believe you have found a security vulnerability, please report it responsibly.

### How to Report

**Email**: [security@tensorixlabs.com](mailto:security@tensorixlabs.com)

Or use GitHub Security Advisories: [Report a Vulnerability](https://github.com/tensorix-labs/t-req/security/advisories/new)

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- (Optional) Suggested fix or mitigation

### Our Commitment

- **Acknowledge** your report within 48 hours
- **Assess** severity and provide an estimated timeline
- **Keep you informed** of progress toward a fix
- **Credit** you in the advisory (unless you prefer anonymity)

Please do not disclose the vulnerability publicly until we have had a chance to address it.

---

## Operational Guidance

### Keep Dependencies Updated

Use a supported version of Node.js (v18+) or Bun. Keep t-req packages updated to receive security fixes.

### Protect Sensitive Data

`.http` files may contain secrets (API keys, tokens). Use environment variables and `.env` files instead of hardcoding credentials:

```http
GET https://api.example.com/data
Authorization: Bearer {{TOKEN}}
```

### Local Server Security

When using `treq serve`:

- Do not bind to `0.0.0.0` or expose ports publicly
- Use behind a firewall or VPN if remote access is needed
- Consider running in a container for additional isolation
