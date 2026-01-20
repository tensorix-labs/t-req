// t-req Go Client Example
//
// This example demonstrates how to interact with the t-req server from Go.
// No special SDK required - just standard HTTP requests!
//
// Start the server:
//   treq serve
//
// Then run this script:
//   go run go_client.go

package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

const baseURL = "http://127.0.0.1:4096"

// Types for API responses

type HealthResponse struct {
	Healthy bool   `json:"healthy"`
	Version string `json:"version"`
}

type ParsedRequestInfo struct {
	Index       int               `json:"index"`
	Name        string            `json:"name,omitempty"`
	Method      string            `json:"method"`
	URL         string            `json:"url"`
	Headers     map[string]string `json:"headers"`
	HasBody     bool              `json:"hasBody"`
	HasFormData bool              `json:"hasFormData"`
	HasBodyFile bool              `json:"hasBodyFile"`
}

type ParseResponse struct {
	Requests []struct {
		Request     *ParsedRequestInfo `json:"request,omitempty"`
		Diagnostics []interface{}      `json:"diagnostics"`
	} `json:"requests"`
	Diagnostics []interface{} `json:"diagnostics"`
}

type ExecuteResponse struct {
	RunID   string `json:"runId"`
	Request struct {
		Index  int    `json:"index"`
		Name   string `json:"name,omitempty"`
		Method string `json:"method"`
		URL    string `json:"url"`
	} `json:"request"`
	Response struct {
		Status     int    `json:"status"`
		StatusText string `json:"statusText"`
		Headers    []struct {
			Name  string `json:"name"`
			Value string `json:"value"`
		} `json:"headers"`
		BodyMode  string `json:"bodyMode"`
		Body      string `json:"body,omitempty"`
		Encoding  string `json:"encoding"`
		Truncated bool   `json:"truncated"`
		BodyBytes int    `json:"bodyBytes"`
	} `json:"response"`
	Timing struct {
		StartTime  int64 `json:"startTime"`
		EndTime    int64 `json:"endTime"`
		DurationMs int64 `json:"durationMs"`
	} `json:"timing"`
}

type CreateSessionResponse struct {
	SessionID string `json:"sessionId"`
}

type SessionState struct {
	SessionID       string                 `json:"sessionId"`
	Variables       map[string]interface{} `json:"variables"`
	CookieCount     int                    `json:"cookieCount"`
	CreatedAt       int64                  `json:"createdAt"`
	LastUsedAt      int64                  `json:"lastUsedAt"`
	SnapshotVersion int                    `json:"snapshotVersion"`
}

// Client functions

func healthCheck() (*HealthResponse, error) {
	resp, err := http.Get(baseURL + "/health")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var health HealthResponse
	if err := json.NewDecoder(resp.Body).Decode(&health); err != nil {
		return nil, err
	}
	return &health, nil
}

func parseHTTPContent(content string) (*ParseResponse, error) {
	payload := map[string]string{"content": content}
	body, _ := json.Marshal(payload)

	resp, err := http.Post(baseURL+"/parse", "application/json", bytes.NewBuffer(body))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result ParseResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return &result, nil
}

func executeRequest(content string, variables map[string]interface{}) (*ExecuteResponse, error) {
	payload := map[string]interface{}{"content": content}
	if variables != nil {
		payload["variables"] = variables
	}
	body, _ := json.Marshal(payload)

	resp, err := http.Post(baseURL+"/execute", "application/json", bytes.NewBuffer(body))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result ExecuteResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return &result, nil
}

func createSession(variables map[string]interface{}) (string, error) {
	payload := map[string]interface{}{}
	if variables != nil {
		payload["variables"] = variables
	}
	body, _ := json.Marshal(payload)

	resp, err := http.Post(baseURL+"/session", "application/json", bytes.NewBuffer(body))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var result CreateSessionResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	return result.SessionID, nil
}

func getSession(sessionID string) (*SessionState, error) {
	resp, err := http.Get(baseURL + "/session/" + sessionID)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var state SessionState
	if err := json.NewDecoder(resp.Body).Decode(&state); err != nil {
		return nil, err
	}
	return &state, nil
}

func deleteSession(sessionID string) error {
	req, _ := http.NewRequest("DELETE", baseURL+"/session/"+sessionID, nil)
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}

// SSE Event subscription
func subscribeToEvents(sessionID string, handler func(event, data string)) error {
	url := baseURL + "/event"
	if sessionID != "" {
		url += "?sessionId=" + sessionID
	}

	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	reader := bufio.NewReader(resp.Body)
	var currentEvent, currentData string

	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			if err == io.EOF {
				break
			}
			return err
		}

		line = strings.TrimSpace(line)

		if strings.HasPrefix(line, "event:") {
			currentEvent = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
		} else if strings.HasPrefix(line, "data:") {
			currentData = strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		} else if line == "" && currentEvent != "" {
			handler(currentEvent, currentData)
			currentEvent = ""
			currentData = ""
		}
	}
	return nil
}

func main() {
	fmt.Println("=== t-req Go Client Example ===")
	fmt.Println()

	// 1. Health check
	fmt.Println("1. Health check:")
	health, err := healthCheck()
	if err != nil {
		fmt.Printf("   Error: %v\n", err)
		return
	}
	fmt.Printf("   Healthy: %v\n", health.Healthy)
	fmt.Printf("   Version: %s\n", health.Version)
	fmt.Println()

	// 2. Parse a simple request
	fmt.Println("2. Parse request:")
	httpContent := `
GET https://jsonplaceholder.typicode.com/posts/1
Accept: application/json
`
	parsed, err := parseHTTPContent(httpContent)
	if err != nil {
		fmt.Printf("   Error: %v\n", err)
		return
	}
	fmt.Printf("   Found %d request(s)\n", len(parsed.Requests))
	if len(parsed.Requests) > 0 && parsed.Requests[0].Request != nil {
		req := parsed.Requests[0].Request
		fmt.Printf("   Method: %s, URL: %s\n", req.Method, req.URL)
	}
	fmt.Println()

	// 3. Execute a request
	fmt.Println("3. Execute request:")
	result, err := executeRequest(httpContent, nil)
	if err != nil {
		fmt.Printf("   Error: %v\n", err)
		return
	}
	fmt.Printf("   Status: %d %s\n", result.Response.Status, result.Response.StatusText)
	fmt.Printf("   Duration: %dms\n", result.Timing.DurationMs)
	fmt.Printf("   Body size: %d bytes\n", result.Response.BodyBytes)
	fmt.Println()

	// 4. Session management
	fmt.Println("4. Session management:")
	sessionID, err := createSession(map[string]interface{}{
		"baseUrl": "https://jsonplaceholder.typicode.com",
	})
	if err != nil {
		fmt.Printf("   Error: %v\n", err)
		return
	}
	fmt.Printf("   Created session: %s\n", sessionID)

	state, err := getSession(sessionID)
	if err != nil {
		fmt.Printf("   Error: %v\n", err)
		return
	}
	fmt.Printf("   Variables: %v\n", state.Variables)

	deleteSession(sessionID)
	fmt.Println("   Session deleted")
	fmt.Println()

	// 5. Execute with variables
	fmt.Println("5. Execute with variables:")
	httpWithVars := `
GET {{baseUrl}}/users/{{userId}}
Accept: application/json
`
	result, err = executeRequest(httpWithVars, map[string]interface{}{
		"baseUrl": "https://jsonplaceholder.typicode.com",
		"userId":  "1",
	})
	if err != nil {
		fmt.Printf("   Error: %v\n", err)
		return
	}
	fmt.Printf("   Status: %d\n", result.Response.Status)
	fmt.Printf("   Request URL: %s\n", result.Request.URL)
	fmt.Println()

	fmt.Println("=== Done ===")
}
