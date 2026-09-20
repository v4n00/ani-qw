package main

import (
	"os"
	"strings"
	"testing"
)

func TestRezeroAlternateTitleSeason(t *testing.T) {
	m := Media{ID: 189046, Title: "Re:Zero kara Hajimeru Isekai Seikatsu 4th Season", Titles: []string{"Re:ZERO -Starting Life in Another World- Season 4", "Re:ゼロから始める異世界生活 4th season", "Re:ZERO รีเซทชีวิต ฝ่าวิกฤตต่างโลก ซีซั่น 4", "Re:ZERO – Жизнь с нуля в альтернативном мире 4"}, Format: "TV", Status: "RELEASING"}
	f, err := os.Open("testdata/rezero-live.xml")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	rs, err := parseRSS(f)
	if err != nil {
		t.Fatal(err)
	}
	for _, q := range searchQueries(m, 16, "") {
		if strings.HasPrefix(q, "re (") {
			t.Fatalf("overly broad query: %s", q)
		}
	}
	found := false
	for _, r := range rs {
		if strings.Contains(r.Name, "[AnoZu]") && strings.Contains(r.Name, "S04E16") {
			found = true
			if !credible(r, m, 16) {
				t.Fatalf("matching release rejected: %s", r.Name)
			}
			first := r
			first.Name = strings.ReplaceAll(first.Name, "S04E16", "S04E01")
			if !credible(first, m, 1) {
				t.Fatalf("first episode rejected: %s", first.Name)
			}
			r.Name = strings.ReplaceAll(r.Name, "S04E16", "S03E16")
			if credible(r, m, 16) {
				t.Fatal("conflicting season accepted")
			}
		}
	}
	if !found {
		t.Fatal("fixture missing target release")
	}
}

func TestShortTitlesRemainSearchable(t *testing.T) {
	for _, title := range []string{"Air", "86"} {
		if len(searchQueries(Media{Title: title, Format: "TV"}, 1, "")) == 0 {
			t.Fatalf("short real title omitted: %s", title)
		}
	}
	queries := searchQueries(Media{Title: "Re:Zero kara Hajimeru Isekai Seikatsu 4th Season", Format: "TV", Status: "FINISHED"}, 1, "")
	for _, q := range queries {
		if strings.HasPrefix(q, "re (") {
			t.Fatalf("broad batch query: %s", q)
		}
	}
}
