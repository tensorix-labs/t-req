#!/usr/bin/env python3
"""
Example: Python Subprocess Plugin

This plugin demonstrates the subprocess plugin protocol:
- NDJSON communication over stdin/stdout
- Protocol initialization and capability declaration
- Custom resolvers ($env, $timestamp, $uuid)
- Hook implementation (request.before)
- Event subscription

Usage in treq.config.ts:
```typescript
import { defineConfig } from '@t-req/core';

export default defineConfig({
  plugins: [
    {
      command: ['python3', './examples/plugins/treq_plugin_env.py'],
      config: { prefix: 'TREQ_' }
    },
  ],
});
```

Or in treq.jsonc:
```jsonc
{
  "plugins": [
    {
      "command": ["python3", "./examples/plugins/treq_plugin_env.py"],
      "config": { "prefix": "TREQ_" }
    }
  ]
}
```

Usage in .http files:
```http
GET {{baseUrl}}/api/data
X-Request-ID: {{$uuid()}}
X-Timestamp: {{$timestamp()}}
X-Api-Key: {{$env('API_KEY')}}
```
"""

import json
import os
import sys
import uuid
from datetime import datetime, timezone

# Configuration (set during init)
config = {"prefix": ""}

def log_debug(message: str):
    """Log to stderr for debugging (won't interfere with protocol)."""
    print(f"[treq-plugin-env] {message}", file=sys.stderr, flush=True)


def handle_init(msg: dict) -> dict:
    """Handle initialization request."""
    global config

    # Store configuration
    if msg.get("config"):
        config.update(msg["config"])

    log_debug(f"Initialized with config: {config}")

    return {
        "name": "treq-plugin-env",
        "version": "1.0.0",
        "protocolVersion": 1,
        "capabilities": ["resolvers", "hooks"],
        "resolvers": ["$env", "$timestamp", "$uuid", "$randomInt"],
        "hooks": ["request.before"],
        "permissions": ["env"]
    }


def handle_resolver(msg: dict) -> dict:
    """Handle resolver requests."""
    name = msg.get("name", "")
    args = msg.get("args", [])

    if name == "$env":
        # Get environment variable, optionally with prefix
        if not args:
            return {"value": ""}

        var_name = args[0]
        prefix = config.get("prefix", "")
        full_name = f"{prefix}{var_name}" if prefix else var_name

        value = os.environ.get(full_name, "")
        log_debug(f"$env({var_name}) -> {full_name} = {'***' if value else '(empty)'}")
        return {"value": value}

    elif name == "$timestamp":
        # Get current timestamp in ISO format or custom format
        fmt = args[0] if args else "iso"

        now = datetime.now(timezone.utc)

        if fmt == "iso":
            value = now.isoformat()
        elif fmt == "unix":
            value = str(int(now.timestamp()))
        elif fmt == "unix_ms":
            value = str(int(now.timestamp() * 1000))
        else:
            # Custom strftime format
            value = now.strftime(fmt)

        log_debug(f"$timestamp({fmt}) -> {value}")
        return {"value": value}

    elif name == "$uuid":
        # Generate a UUID
        version = args[0] if args else "4"

        if version == "4":
            value = str(uuid.uuid4())
        elif version == "1":
            value = str(uuid.uuid1())
        else:
            value = str(uuid.uuid4())

        log_debug(f"$uuid({version}) -> {value}")
        return {"value": value}

    elif name == "$randomInt":
        # Generate a random integer in range
        import random

        min_val = int(args[0]) if len(args) > 0 else 0
        max_val = int(args[1]) if len(args) > 1 else 1000000

        value = str(random.randint(min_val, max_val))
        log_debug(f"$randomInt({min_val}, {max_val}) -> {value}")
        return {"value": value}

    else:
        log_debug(f"Unknown resolver: {name}")
        return {"value": ""}


def handle_hook(msg: dict) -> dict:
    """Handle hook requests."""
    hook_name = msg.get("name", "")
    input_data = msg.get("input", {})
    output_data = msg.get("output", {})

    if hook_name == "request.before":
        # Add custom headers to every request
        request = output_data.get("request", {})
        headers = request.get("headers", {})

        # Add a correlation ID if not present
        if "X-Correlation-ID" not in headers:
            headers["X-Correlation-ID"] = str(uuid.uuid4())

        # Add plugin identification header
        headers["X-Plugin"] = "treq-plugin-env/1.0.0"

        request["headers"] = headers
        output_data["request"] = request

        log_debug(f"request.before: added correlation ID")
        return {"output": output_data}

    # For other hooks, return unchanged output
    return {"output": output_data}


def handle_event(msg: dict):
    """Handle event notifications (fire-and-forget)."""
    event = msg.get("event", {})
    event_type = event.get("type", "")

    # Just log events for debugging
    if event_type == "fetchStarted":
        log_debug(f"Event: {event.get('method')} {event.get('url')}")
    elif event_type == "fetchFinished":
        log_debug(f"Event: {event.get('method')} {event.get('url')} -> {event.get('status')}")
    elif event_type == "error":
        log_debug(f"Event: Error - {event.get('message')}")


def main():
    """Main loop: read NDJSON from stdin, write responses to stdout."""
    log_debug("Plugin starting...")

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            msg = json.loads(line)
        except json.JSONDecodeError as e:
            log_debug(f"JSON parse error: {e}")
            continue

        msg_type = msg.get("type", "")
        msg_id = msg.get("id", "")

        try:
            if msg_type == "init":
                result = handle_init(msg)
                response = {"id": msg_id, "type": "response", "result": result}

            elif msg_type == "resolver":
                result = handle_resolver(msg)
                response = {"id": msg_id, "type": "response", "result": result}

            elif msg_type == "hook":
                result = handle_hook(msg)
                response = {"id": msg_id, "type": "response", "result": result}

            elif msg_type == "event":
                handle_event(msg)
                continue  # Events don't send a response

            elif msg_type == "shutdown":
                log_debug("Shutdown received, exiting...")
                break

            else:
                response = {
                    "id": msg_id,
                    "type": "error",
                    "error": {"message": f"Unknown message type: {msg_type}"}
                }

            # Write response as NDJSON
            print(json.dumps(response), flush=True)

        except Exception as e:
            log_debug(f"Error handling message: {e}")
            response = {
                "id": msg_id,
                "type": "error",
                "error": {"message": str(e)}
            }
            print(json.dumps(response), flush=True)

    log_debug("Plugin exiting")


if __name__ == "__main__":
    main()
