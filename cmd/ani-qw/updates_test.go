package main

import (
	"io"
	"net/http"
	"strings"
	"testing"
)

type updateTransport func(*http.Request) (*http.Response, error)

func (f updateTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestUpdateReleaseValidation(t *testing.T) {
	for _, tc := range []struct {
		name, body string
		status     int
		valid      bool
	}{
		{"published", `{"tag_name":"v0.2.0"}`, 200, true},
		{"prerelease", `{"tag_name":"v0.2.0","prerelease":true}`, 200, false},
		{"draft", `{"tag_name":"v0.2.0","draft":true}`, 200, false},
		{"unsafe", `{"tag_name":"../../bad"}`, 200, false},
		{"invalid", `not json`, 200, false},
		{"rate limit", "", 429, false},
		{"not found", "", 404, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			client := &http.Client{Transport: updateTransport(func(r *http.Request) (*http.Response, error) {
				return &http.Response{StatusCode: tc.status, Body: io.NopCloser(strings.NewReader(tc.body)), Header: make(http.Header)}, nil
			})}
			release, err := fetchRelease(client, "https://api.github.com/repos/v4n00/ani-qw/releases/latest")
			if (err == nil) != tc.valid {
				t.Fatalf("unexpected result: %+v %v", release, err)
			}
			if tc.valid && release.URL != "https://github.com/v4n00/ani-qw/releases/tag/v0.2.0" {
				t.Fatal(release)
			}
		})
	}
}
