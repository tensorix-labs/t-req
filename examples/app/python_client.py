#!/usr/bin/env python3
"""
t-req Python Client Example

This example demonstrates how to interact with the t-req server from Python.
No special SDK required - just standard HTTP requests!

Prerequisites:
  pip install requests sseclient-py

Start the server:
  treq serve

Then run this script:
  python python_client.py
"""

import json
import requests
from typing import Optional, Dict, Any

BASE_URL = "http://127.0.0.1:4096"


def health_check() -> Dict[str, Any]:
    """Check server health and get version information."""
    response = requests.get(f"{BASE_URL}/health")
    response.raise_for_status()
    return response.json()


def parse_http_content(content: str) -> Dict[str, Any]:
    """Parse .http file content without executing."""
    response = requests.post(
        f"{BASE_URL}/parse",
        json={"content": content}
    )
    response.raise_for_status()
    return response.json()


def execute_request(
    content: str,
    variables: Optional[Dict[str, Any]] = None,
    session_id: Optional[str] = None,
    request_name: Optional[str] = None,
    request_index: Optional[int] = None,
    timeout_ms: Optional[int] = None
) -> Dict[str, Any]:
    """Execute an HTTP request from .http content."""
    payload = {"content": content}

    if variables:
        payload["variables"] = variables
    if session_id:
        payload["sessionId"] = session_id
    if request_name:
        payload["requestName"] = request_name
    if request_index is not None:
        payload["requestIndex"] = request_index
    if timeout_ms:
        payload["timeoutMs"] = timeout_ms

    response = requests.post(
        f"{BASE_URL}/execute",
        json=payload
    )
    response.raise_for_status()
    return response.json()


def create_session(variables: Optional[Dict[str, Any]] = None) -> str:
    """Create a new session and return the session ID."""
    payload = {}
    if variables:
        payload["variables"] = variables

    response = requests.post(
        f"{BASE_URL}/session",
        json=payload
    )
    response.raise_for_status()
    return response.json()["sessionId"]


def get_session(session_id: str) -> Dict[str, Any]:
    """Get session state."""
    response = requests.get(f"{BASE_URL}/session/{session_id}")
    response.raise_for_status()
    return response.json()


def update_session_variables(
    session_id: str,
    variables: Dict[str, Any],
    mode: str = "merge"
) -> Dict[str, Any]:
    """Update session variables."""
    response = requests.put(
        f"{BASE_URL}/session/{session_id}/variables",
        json={"variables": variables, "mode": mode}
    )
    response.raise_for_status()
    return response.json()


def delete_session(session_id: str) -> None:
    """Delete a session."""
    response = requests.delete(f"{BASE_URL}/session/{session_id}")
    response.raise_for_status()


def subscribe_to_events(session_id: Optional[str] = None):
    """
    Subscribe to server events via SSE.

    Usage:
        for event in subscribe_to_events():
            print(event)
    """
    try:
        import sseclient
    except ImportError:
        raise ImportError("Please install sseclient-py: pip install sseclient-py")

    url = f"{BASE_URL}/event"
    if session_id:
        url += f"?sessionId={session_id}"

    response = requests.get(url, stream=True)
    client = sseclient.SSEClient(response)

    for event in client.events():
        yield {
            "event": event.event,
            "data": json.loads(event.data) if event.data else None,
            "id": event.id
        }


# Example usage
if __name__ == "__main__":
    print("=== t-req Python Client Example ===\n")

    # 1. Health check
    print("1. Health check:")
    health = health_check()
    print(f"   Healthy: {health['healthy']}")
    print(f"   Version: {health['version']}\n")

    # 2. Parse a simple request
    print("2. Parse request:")
    http_content = """
GET https://jsonplaceholder.typicode.com/posts/1
Accept: application/json
"""
    parsed = parse_http_content(http_content)
    print(f"   Found {len(parsed['requests'])} request(s)")
    if parsed['requests']:
        req = parsed['requests'][0]['request']
        print(f"   Method: {req['method']}, URL: {req['url']}\n")

    # 3. Execute a request
    print("3. Execute request:")
    result = execute_request(http_content)
    print(f"   Status: {result['response']['status']} {result['response']['statusText']}")
    print(f"   Duration: {result['timing']['durationMs']}ms")
    print(f"   Body size: {result['response']['bodyBytes']} bytes\n")

    # 4. Use sessions for stateful requests
    print("4. Session management:")
    session_id = create_session({"baseUrl": "https://jsonplaceholder.typicode.com"})
    print(f"   Created session: {session_id}")

    session_state = get_session(session_id)
    print(f"   Session variables: {session_state['variables']}")

    update_session_variables(session_id, {"token": "abc123"})
    session_state = get_session(session_id)
    print(f"   After update: {session_state['variables']}")

    delete_session(session_id)
    print("   Session deleted\n")

    # 5. Execute with variables
    print("5. Execute with variables:")
    http_with_vars = """
GET {{baseUrl}}/users/{{userId}}
Accept: application/json
"""
    result = execute_request(
        http_with_vars,
        variables={
            "baseUrl": "https://jsonplaceholder.typicode.com",
            "userId": "1"
        }
    )
    print(f"   Status: {result['response']['status']}")
    print(f"   Request URL: {result['request']['url']}\n")

    print("=== Done ===")
