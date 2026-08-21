package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type App struct {
	ctx context.Context
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

type Repository struct {
	ID              int64     `json:"id"`
	Name            string    `json:"name"`
	FullName        string    `json:"full_name"`
	Private         bool      `json:"private"`
	StargazersCount int       `json:"stargazers_count"`
	PushedAt        time.Time `json:"pushed_at"`
}

type BatchResult struct {
	FullName string `json:"full_name"`
	Success  bool   `json:"success"`
	Error    string `json:"error,omitempty"`
}

type DeviceCodeResponse struct {
	DeviceCode      string `json:"device_code"`
	UserCode        string `json:"user_code"`
	VerificationURI string `json:"verification_uri"`
	ExpiresIn       int    `json:"expires_in"`
	Interval        int    `json:"interval"`
}

type AccessTokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	Scope       string `json:"scope"`
	Error       string `json:"error"`
}

const GitHubClientID = "Ov23lidYZ0a2acqiml2g"

func (a *App) InitiateDeviceFlow() (*DeviceCodeResponse, error) {
	data := url.Values{}
	data.Set("client_id", GitHubClientID)
	data.Set("scope", "repo")

	req, err := http.NewRequest("POST", "https://github.com/login/device/code", strings.NewReader(data.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("github device flow error: %s", resp.Status)
	}

	var dr DeviceCodeResponse
	if err := json.NewDecoder(resp.Body).Decode(&dr); err != nil {
		return nil, err
	}
	return &dr, nil
}

func (a *App) PollForToken(deviceCode string, interval int) (string, error) {
	if interval < 5 {
		interval = 5
	}

	data := url.Values{}
	data.Set("client_id", GitHubClientID)
	data.Set("device_code", deviceCode)
	data.Set("grant_type", "urn:ietf:params:oauth:grant-type:device_code")

	client := &http.Client{Timeout: 10 * time.Second}
	ticker := time.NewTicker(time.Duration(interval) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-a.ctx.Done():
			return "", fmt.Errorf("authentication cancelled")
		case <-ticker.C:
			req, err := http.NewRequest("POST", "https://github.com/login/oauth/access_token", strings.NewReader(data.Encode()))
			if err != nil {
				return "", err
			}
			req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
			req.Header.Set("Accept", "application/json")

			resp, err := client.Do(req)
			if err != nil {
				return "", err
			}

			var tokenResp AccessTokenResponse
			err = json.NewDecoder(resp.Body).Decode(&tokenResp)
			resp.Body.Close()
			if err != nil {
				return "", err
			}

			switch tokenResp.Error {
			case "":
				if tokenResp.AccessToken != "" {
					return tokenResp.AccessToken, nil
				}
			case "authorization_pending":
				continue
			case "slow_down":
				ticker.Reset(time.Duration(interval+5) * time.Second)
				continue
			case "expired_token":
				return "", fmt.Errorf("device code expired, please try again")
			case "access_denied":
				return "", fmt.Errorf("authorization was cancelled by user")
			default:
				return "", fmt.Errorf("oauth error: %s", tokenResp.Error)
			}
		}
	}
}

// FetchRepos gets all repos owned by the authenticated user
func (a *App) FetchRepos(token string) ([]Repository, error) {
	url := "https://api.github.com/user/repos?per_page=100&affiliation=owner&sort=updated"
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("github api returned: %s", resp.Status)
	}

	var repos []Repository
	if err := json.NewDecoder(resp.Body).Decode(&repos); err != nil {
		return nil, err
	}
	return repos, nil
}

// SetVisibilityBatch updates repos concurrently (4 at a time)
func (a *App) SetVisibilityBatch(token string, repoNames []string, makePrivate bool) []BatchResult {
	results := make([]BatchResult, len(repoNames))
	var wg sync.WaitGroup
	semaphore := make(chan struct{}, 4)

	for i, fullName := range repoNames {
		wg.Add(1)
		go func(idx int, repo string) {
			defer wg.Done()
			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			payload, _ := json.Marshal(map[string]bool{"private": makePrivate})
			url := "https://api.github.com/repos/" + repo
			req, _ := http.NewRequest("PATCH", url, bytes.NewBuffer(payload))

			req.Header.Set("Authorization", "Bearer "+token)
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Accept", "application/vnd.github+json")

			client := &http.Client{Timeout: 10 * time.Second}
			resp, err := client.Do(req)
			if err != nil {
				results[idx] = BatchResult{FullName: repo, Success: false, Error: err.Error()}
				return
			}
			defer resp.Body.Close()

			if resp.StatusCode != http.StatusOK {
				results[idx] = BatchResult{FullName: repo, Success: false, Error: resp.Status}
				return
			}

			results[idx] = BatchResult{FullName: repo, Success: true}
		}(i, fullName)
	}

	wg.Wait()
	return results
}
