package main

import "testing"

func TestResumeIsolationAndCompletion(t *testing.T) {
	dir := t.TempDir()
	r := Request{UserID: 1, Media: Media{ID: 2}, Episode: 3}
	if err := saveResume(dir, r, 127.5, false); err != nil {
		t.Fatal(err)
	}
	if got := readResume(dir, r); got != 127.5 {
		t.Fatal(got)
	}
	other := r
	other.UserID = 2
	if readResume(dir, other) != 0 {
		t.Fatal("cross-account resume")
	}
	other = r
	other.Rewatch = true
	if readResume(dir, other) != 0 {
		t.Fatal("new rewatch reused old pass")
	}
	if err := saveResume(dir, r, 127.5, true); err != nil {
		t.Fatal(err)
	}
	if readResume(dir, r) != 0 {
		t.Fatal("completed point retained")
	}
}
func TestWatchedSetting(t *testing.T) {
	w := &worker{p: paths{State: t.TempDir(), Cache: t.TempDir()}}
	p := 90
	s, err := w.settings(nil, &p)
	if err != nil || s.WatchedPercent != 90 {
		t.Fatal(s, err)
	}
	s, err = readSettings(w.p.State)
	if err != nil || s.WatchedPercent != 90 {
		t.Fatal(s, err)
	}
	for _, p := range []int{0, 100} {
		if _, err = w.settings(nil, &p); err == nil {
			t.Fatal("invalid percentage accepted")
		}
	}
}

func TestStartOverDoesNotDiscardResumeBeforePlayback(t *testing.T) {
	dir := t.TempDir()
	r := Request{UserID: 1, Media: Media{ID: 2}, Episode: 3}
	if err := saveResume(dir, r, 754, false); err != nil {
		t.Fatal(err)
	}
	if playbackStart(dir, r) != 754 {
		t.Fatal("resume not applied")
	}
	r.StartOver = true
	if playbackStart(dir, r) != 0 {
		t.Fatal("start over did not start at zero")
	}
	if readResume(dir, r) != 754 {
		t.Fatal("lookup/start over destroyed saved resume")
	}
	r.Episode++
	if readResume(dir, r) != 0 {
		t.Fatal("resume leaked to another episode")
	}
}
