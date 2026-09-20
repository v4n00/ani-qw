package main

import (
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/5rahim/habari"
)

type Release struct {
	Name        string `json:"name"`
	Hash        string `json:"hash"`
	Link        string `json:"link"`
	DownloadURL string `json:"downloadUrl"`
	Size        string `json:"size"`
	Seeders     int    `json:"seeders"`
	Leechers    int    `json:"leechers"`
	Resolution  string `json:"resolution"`
}

var httpClient = &http.Client{Timeout: 20 * time.Second}
var hashPattern = regexp.MustCompile(`^[a-fA-F0-9]{40}$`)
var partPattern = regexp.MustCompile(`(?i)\b(?:part|cour)\s*(\d+)\b`)
var pathSeasonPattern = regexp.MustCompile(`(?i)(?:\bseason[ ._-]*|\bs)(\d{1,2})(?:\b|e\d)`)
var samplePattern = regexp.MustCompile(`(?i)(?:^|[\s._\-\[\]])(?:sample|ncop|nced|creditless)(?:$|[\s._\-\[\]])`)

func parseRSS(r io.Reader) ([]Release, error) {
	var feed struct {
		Channel struct {
			Items []struct {
				Title    string `xml:"title"`
				Hash     string `xml:"infoHash"`
				Link     string `xml:"guid"`
				Download string `xml:"link"`
				Size     string `xml:"size"`
				Seeders  int    `xml:"seeders"`
				Leechers int    `xml:"leechers"`
			} `xml:"item"`
		} `xml:"channel"`
	}
	if err := xml.NewDecoder(io.LimitReader(r, 4*1024*1024)).Decode(&feed); err != nil {
		return nil, err
	}
	out := []Release{}
	for _, i := range feed.Channel.Items {
		if !hashPattern.MatchString(i.Hash) || i.Title == "" {
			continue
		}
		m := habari.Parse(i.Title)
		out = append(out, Release{i.Title, strings.ToLower(i.Hash), i.Link, i.Download, i.Size, i.Seeders, i.Leechers, m.VideoResolution})
	}
	return out, nil
}
func searchNyaa(ctx context.Context, m Media, ep int, query string) ([]Release, error) {
	queries := searchQueries(m, ep, query)
	seen := map[string]bool{}
	out := []Release{}
	success := false
	var lastErr error
	// Search aliases concurrently, bounded to three requests. Keep query order
	// when merging so seed-count ties are deterministic.
	type result struct {
		items []Release
		err   error
	}
	results := make([]result, len(queries))
	slots := make(chan struct{}, 3)
	var wg sync.WaitGroup
	for i, q := range queries {
		wg.Add(1)
		go func(i int, q string) {
			defer wg.Done()
			select {
			case slots <- struct{}{}:
				defer func() { <-slots }()
			case <-ctx.Done():
				results[i].err = ctx.Err()
				return
			}
			results[i].items, results[i].err = fetchNyaa(ctx, q)
		}(i, q)
	}
	wg.Wait()
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	for _, result := range results {
		if result.err != nil {
			lastErr = result.err
			continue
		}
		success = true
		for _, item := range result.items {
			if !seen[item.Hash] {
				seen[item.Hash] = true
				out = append(out, item)
			}
		}
	}
	if !success {
		if lastErr == nil {
			lastErr = errors.New("no search title provided")
		}
		return nil, lastErr
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Seeders > out[j].Seeders })
	if len(out) > 150 {
		out = out[:150]
	}
	return out, nil
}
func fetchNyaa(ctx context.Context, query string) ([]Release, error) {
	u := "https://nyaa.si/?" + url.Values{"page": {"rss"}, "q": {query}, "c": {"1_2"}, "f": {"0"}, "s": {"seeders"}, "o": {"desc"}}.Encode()
	req, err := http.NewRequestWithContext(ctx, "GET", u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Ani-QW/0.1")
	res, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return nil, fmt.Errorf("Nyaa returned HTTP %d; retry or edit the search", res.StatusCode)
	}
	return parseRSS(res.Body)
}
func normalized(s string) string {
	return strings.Join(strings.FieldsFunc(strings.ToLower(s), func(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsNumber(r) }), " ")
}
func sameTitle(a, b string) bool {
	a = normalized(a)
	b = normalized(b)
	if a == b && a != "" {
		return true
	}
	// Deliberately conservative: subtitles are not interchangeable with seasons.
	return false
}
func season(meta *habari.Metadata) string {
	if len(meta.SeasonNumber) > 0 {
		return strings.TrimLeft(meta.SeasonNumber[0], "0")
	}
	return ""
}
func part(s string) string {
	m := partPattern.FindStringSubmatch(s)
	if len(m) > 1 {
		return m[1]
	}
	return ""
}

// Habari does not identify roman seasons (e.g. "Clevatess II"). Only
// interpret a terminal numeral in the main title, never numbers in subtitles.
var romanSeasonPattern = regexp.MustCompile(`(?i)\s+(VIII|VII|VI|IV|III|II|IX|V|X)$`)
var romanSeasons = map[string]string{"II": "2", "III": "3", "IV": "4", "V": "5", "VI": "6", "VII": "7", "VIII": "8", "IX": "9", "X": "10"}

func titleIdentity(title string) (string, string) {
	meta := habari.Parse(title)
	name, sn := meta.Title, season(meta)
	main, subtitle, colon := strings.Cut(name, ":")
	if match := romanSeasonPattern.FindStringSubmatch(strings.TrimSpace(main)); len(match) > 0 {
		roman := romanSeasons[strings.ToUpper(match[1])]
		if sn != "" && sn != roman {
			return name, "ambiguous"
		}
		sn = roman
		main = romanSeasonPattern.ReplaceAllString(strings.TrimSpace(main), "")
		name = main
		if colon {
			name += ":" + subtitle
		}
	}
	return name, sn
}
func mediaSeason(m Media) string {
	expected := ""
	for _, title := range append([]string{m.Title}, m.Titles...) {
		_, sn := titleIdentity(title)
		if sn == "" {
			continue
		}
		if expected != "" && expected != sn {
			return "ambiguous"
		}
		expected = sn
	}
	if expected == "" {
		return "1"
	}
	return expected
}
func releaseTitleMatches(release, title string) bool {
	if sameTitle(release, title) {
		return true
	}
	// A release may omit AniList's subtitle, but two distinct subtitles
	// must never become interchangeable merely because their franchise agrees.
	base, _, hasSubtitle := strings.Cut(title, ":")
	return hasSubtitle && !strings.Contains(release, ":") && len(normalized(base)) >= 4 && sameTitle(release, base)
}
func searchQueries(m Media, ep int, custom string) []string {
	if strings.TrimSpace(custom) != "" {
		return []string{strings.TrimSpace(custom)}
	}
	out := []string{}
	seen := map[string]bool{}
	add := func(title string) {
		title = normalized(title)
		if title == "" || seen[title] || len(out) >= 4 {
			return
		}
		seen[title] = true
		if m.Format != "MOVIE" {
			title += fmt.Sprintf(" (%02d|E%02d|EP%02d|EP%d|S%sE%02d)", ep, ep, ep, ep, fmt.Sprintf("%02s", mediaSeason(m)), ep)
		}
		out = append(out, title)
	}
	for _, title := range append([]string{m.Title}, m.Titles...) {
		name, _ := titleIdentity(title)
		if normalized(name) == "" {
			name = title
		}
		base, _, subtitle := strings.Cut(name, ":")
		if !subtitle || len([]rune(normalized(base))) >= 4 {
			add(base)
		}
		add(name)
	}
	if m.Status == "FINISHED" && m.Format != "MOVIE" {
		name, _ := titleIdentity(m.Title)
		if normalized(name) == "" {
			name = m.Title
		}
		base, _, subtitle := strings.Cut(name, ":")
		if subtitle && len([]rune(normalized(base))) < 4 {
			base = name
		}
		out = append(out, normalized(base)+" (batch|complete)")
	}
	return out
}
func credible(r Release, m Media, ep int) bool {
	if r.Seeders < 1 || r.Resolution != "1080p" {
		return false
	}
	rm := habari.Parse(r.Name)
	for _, sn := range rm.SeasonNumber {
		if strings.TrimLeft(sn, "0") != season(rm) {
			return false
		}
	}
	releaseName, rs := titleIdentity(r.Name)
	expected := mediaSeason(m)
	if rs == "" {
		rs = "1"
	}
	if expected == "ambiguous" || rs != expected {
		return false
	}
	matched := false
	for _, title := range append([]string{m.Title}, m.Titles...) {
		titleName, _ := titleIdentity(title)
		if releaseTitleMatches(releaseName, titleName) && part(r.Name) == part(title) {
			matched = true
			break
		}
	}
	if !matched {
		return false
	}
	if m.Format == "MOVIE" {
		return len(rm.EpisodeNumber) == 0 || (len(rm.EpisodeNumber) == 1 && rm.EpisodeNumber[0] == "1")
	}
	if len(rm.EpisodeNumber) == 1 {
		n, _ := strconv.Atoi(rm.EpisodeNumber[0])
		return n == ep
	}
	if len(rm.EpisodeNumber) > 1 {
		first, _ := strconv.Atoi(rm.EpisodeNumber[0])
		last, _ := strconv.Atoi(rm.EpisodeNumber[len(rm.EpisodeNumber)-1])
		return first <= ep && last >= ep
	}
	return m.Status == "FINISHED" && (strings.Contains(strings.ToLower(r.Name), "batch") || strings.Contains(strings.ToLower(r.Name), "complete"))
}
func videoFile(name string) bool {
	if samplePattern.MatchString(filepath.Base(name)) {
		return false
	}
	switch strings.ToLower(filepath.Ext(name)) {
	case ".mkv", ".mp4", ".webm", ".avi", ".m4v", ".ts":
		return true
	}
	return false
}
func matchingFile(names []string, m Media, ep int) int {
	eligible := []int{}
	matches := []int{}
	expectedSeason := mediaSeason(m)
	if expectedSeason == "" {
		expectedSeason = "1"
	}
	for i, name := range names {
		if !videoFile(name) {
			continue
		}
		wrongSeason := false
		for _, match := range pathSeasonPattern.FindAllStringSubmatch(name, -1) {
			s := strings.TrimLeft(match[1], "0")
			if s != expectedSeason {
				wrongSeason = true
			}
		}
		if wrongSeason {
			continue
		}
		eligible = append(eligible, i)
		meta := habari.Parse(filepath.Base(name))
		if len(meta.EpisodeNumber) == 1 {
			n, _ := strconv.Atoi(meta.EpisodeNumber[0])
			if n == ep {
				matches = append(matches, i)
			}
		}
	}
	if m.Format == "MOVIE" && len(eligible) == 1 {
		return eligible[0]
	}
	if len(matches) == 1 {
		return matches[0]
	}
	return -1
}
