package main

import (
	"context"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

type rssTransport func(*http.Request) (*http.Response, error)

func (f rssTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestSearchConcurrencyAndCancellation(t *testing.T) {
	original := httpClient
	defer func() { httpClient = original }()
	var mu sync.Mutex
	active, peak := 0, 0
	httpClient = &http.Client{Transport: rssTransport(func(r *http.Request) (*http.Response, error) {
		mu.Lock()
		active++
		peak = max(peak, active)
		mu.Unlock()
		defer func() { mu.Lock(); active--; mu.Unlock() }()
		select {
		case <-r.Context().Done():
			return nil, r.Context().Err()
		case <-time.After(20 * time.Millisecond):
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`<rss><channel></channel></rss>`)), Header: make(http.Header)}, nil
	})}
	m := Media{Title: "Example: Long Subtitle", Titles: []string{"Another: Other Subtitle"}, Format: "TV"}
	if _, err := searchNyaa(context.Background(), m, 1, ""); err != nil {
		t.Fatal(err)
	}
	if peak < 2 || peak > 3 {
		t.Fatalf("expected 2–3 concurrent searches, got %d", peak)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := searchNyaa(ctx, m, 1, ""); err != context.Canceled {
		t.Fatalf("cancellation lost: %v", err)
	}
}

func TestSequelReleaseFixtures(t *testing.T) {
	for _, tc := range []struct {
		file    string
		media   Media
		episode int
		group   string
	}{
		{"clevatess-live.xml", Media{Title: "Clevatess II: Majuu no Ou to Itsuwari no Yuusha Denshou", Titles: []string{"Clevatess Season 2", "Clevatess II: Majuu no Ou to Akago to Kabane no Yuusha 2nd Season"}, Format: "TV", Status: "RELEASING"}, 10, "Erai-raws"},
		{"hell-mode-live.xml", Media{Title: "Hell Mode: Yarikomi-zuki no Gamer wa Haisettei no Isekai de Musou Suru 2nd Season", Titles: []string{"HELL MODE: The Hardcore Gamer Dominates in Another World with Garbage Balancing Season 2"}, Format: "TV", Status: "RELEASING"}, 11, "SubsPlease"},
	} {
		t.Run(tc.file, func(t *testing.T) {
			f, err := os.Open("testdata/" + tc.file)
			if err != nil {
				t.Fatal(err)
			}
			defer f.Close()
			items, err := parseRSS(f)
			if err != nil {
				t.Fatal(err)
			}
			found := false
			for _, r := range items {
				if credible(r, tc.media, tc.episode) && strings.Contains(r.Name, tc.group) {
					found = true
				}
			}
			if !found {
				t.Fatal("expected release was not automatically eligible")
			}
			if mediaSeason(tc.media) != "2" {
				t.Fatal("season aliases not recognized")
			}
			if matchingFile([]string{"S01/episode - 10.mkv", "S02/episode - 10.mkv"}, tc.media, 10) != 1 {
				t.Fatal("wrong batch season")
			}
			queries := searchQueries(tc.media, tc.episode, "")
			if len(queries) == 0 || strings.Contains(queries[0], ":") || !strings.Contains(queries[0], "|E") {
				t.Fatalf("bad queries: %v", queries)
			}
		})
	}
	m := Media{Title: "Clevatess II: Majuu no Ou to Itsuwari no Yuusha Denshou", Format: "TV"}
	for _, name := range []string{"[Group] Clevatess - 10 [1080p]", "[Group] Clevatess S03 - 10 [1080p]", "[Group] Clevatess II - 22 [1080p]", "[Group] Clevatess II: Different Story - 10 [1080p]"} {
		if credible(Release{Name: name, Seeders: 10, Resolution: "1080p"}, m, 10) {
			t.Errorf("unsafe match: %s", name)
		}
	}
}

func TestRSSAndMatching(t *testing.T) {
	f, err := os.Open("testdata/nyaa.xml")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	items, err := parseRSS(f)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 5 {
		t.Fatalf("got %d releases", len(items))
	}
	m := Media{ID: 1, Title: "Example Show", Format: "TV", Status: "RELEASING", Episodes: 12}
	for i, want := range []bool{true, false, false, false, true} {
		if got := credible(items[i], m, 3); got != want {
			t.Errorf("%s: credible=%v want %v", items[i].Name, got, want)
		}
	}
	if items[0].Seeders != 42 || items[0].Resolution != "1080p" {
		t.Fatalf("bad parse: %+v", items[0])
	}
	if !credible(items[1], Media{Title: "Example Show Season 2", Format: "TV"}, 3) {
		t.Error("explicit season 2 should match")
	}
}
func TestFileSelection(t *testing.T) {
	m := Media{Title: "Example Show", Format: "TV"}
	for _, tc := range []struct {
		names         []string
		episode, want int
	}{
		{[]string{"Example Show - 02.mkv", "Example Show - 03.mkv", "sample.mkv", "readme.txt"}, 3, 1},
		{[]string{"Example Show - 103.mkv"}, 3, -1},
		{[]string{"S01/Example Show - 03.mkv", "S02/Example Show - 03.mkv"}, 3, 0},
		{[]string{"Example Show - 03.mkv", "Example Show - 03.mp4"}, 3, -1},
		{[]string{"Example Show - 03 sample.mkv", "readme.txt"}, 3, -1},
		{[]string{"S02/Example Show - 03.mkv"}, 3, -1},
	} {
		if got := matchingFile(tc.names, m, tc.episode); got != tc.want {
			t.Errorf("%v: got %d want %d", tc.names, got, tc.want)
		}
	}
	if got := matchingFile([]string{"Movie.mkv", "sample.mkv"}, Media{Format: "MOVIE"}, 1); got != 0 {
		t.Fatal(got)
	}
	if got := matchingFile([]string{"S01/Example Show - 03.mkv", "S02/Example Show - 03.mkv"}, Media{Title: "Example Show Season 2", Format: "TV"}, 3); got != 1 {
		t.Errorf("season 2 selected file %d", got)
	}
}
func TestSafePaths(t *testing.T) {
	for _, s := range []string{"../bad", "/absolute", "a/../../bad", "a\\bad"} {
		if safeTorrentPath(s) {
			t.Errorf("accepted %s", s)
		}
	}
	if !safeTorrentPath("show/03.mkv") {
		t.Fatal("rejected normal path")
	}
}
