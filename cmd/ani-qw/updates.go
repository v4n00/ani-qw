package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
)

type AppRelease struct {
	Version       string `json:"version"`
	URL           string `json:"url"`
	HelperVersion string `json:"helperVersion"`
}

var releaseCache struct {
	sync.Mutex
	until  time.Time
	result AppRelease
	err    error
}

func checkUpdates() (AppRelease, error) {
	releaseCache.Lock()
	defer releaseCache.Unlock()
	if time.Now().Before(releaseCache.until) {
		return releaseCache.result, releaseCache.err
	}
	r, err := fetchRelease(&http.Client{Timeout: 12 * time.Second}, "https://api.github.com/repos/v4n00/ani-qw/releases/latest")
	releaseCache.result, releaseCache.err = r, err
	releaseCache.until = time.Now().Add(time.Minute)
	return r, err
}
func fetchRelease(client *http.Client, endpoint string) (AppRelease, error) {
	req, err := http.NewRequest("GET", endpoint, nil)
	if err != nil {
		return AppRelease{}, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "Ani-QW/"+appVersion)
	resp, err := client.Do(req)
	if err != nil {
		return AppRelease{}, fmt.Errorf("could not check updates: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == 403 || resp.StatusCode == 429 {
		return AppRelease{}, fmt.Errorf("GitHub rate limit reached; try again later")
	}
	if resp.StatusCode == 404 {
		return AppRelease{}, fmt.Errorf("no published release is available yet")
	}
	if resp.StatusCode != 200 {
		return AppRelease{}, fmt.Errorf("update check failed (HTTP %d); try again later", resp.StatusCode)
	}
	var data struct {
		Tag        string `json:"tag_name"`
		Draft      bool   `json:"draft"`
		Prerelease bool   `json:"prerelease"`
	}
	if err = json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&data); err != nil {
		return AppRelease{}, fmt.Errorf("invalid release response: %w", err)
	}
	if data.Draft || data.Prerelease || !regexp.MustCompile(`^v[0-9]+\.[0-9]+\.[0-9]+$`).MatchString(data.Tag) {
		return AppRelease{}, fmt.Errorf("latest release has an unsupported version")
	}
	return AppRelease{Version: strings.TrimPrefix(data.Tag, "v"), URL: "https://github.com/v4n00/ani-qw/releases/tag/" + data.Tag, HelperVersion: appVersion}, nil
}
