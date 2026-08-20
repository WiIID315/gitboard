package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
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
