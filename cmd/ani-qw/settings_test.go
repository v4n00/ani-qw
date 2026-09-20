package main

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestCacheSettingsPersistence(t *testing.T) {
	w := &worker{p: paths{State: t.TempDir(), Cache: t.TempDir()}}
	s, err := w.settings(nil)
	if err != nil || s.CacheGiB != 20 {
		t.Fatalf("default: %+v %v", s, err)
	}
	n := 50
	s, err = w.settings(&n)
	if err != nil || s.CacheGiB != 50 {
		t.Fatalf("save: %+v %v", s, err)
	}
	other := &worker{p: w.p}
	s, err = other.settings(nil)
	if err != nil || s.CacheGiB != 50 {
		t.Fatalf("reload: %+v %v", s, err)
	}
	for _, invalid := range []int{0, -1, 1025} {
		if _, err = w.settings(&invalid); err == nil {
			t.Fatal("accepted invalid cache size")
		}
	}
	s, _ = other.settings(nil)
	if s.CacheGiB != 50 {
		t.Fatal("invalid update changed persisted preference")
	}
}

func TestSeedingPreferencesAtomic(t *testing.T) {
	w := &worker{p: paths{State: t.TempDir(), Cache: t.TempDir()}}
	original, err := w.settings(nil)
	if err != nil || !original.Seeding {
		t.Fatalf("expected legacy default sharing: %+v %v", original, err)
	}
	seed := false
	cache, percent := 30, 90
	if _, err = w.savePreferences(Request{CacheGiB: &cache, WatchedPercent: &percent, Seeding: &seed}); err != nil {
		t.Fatal(err)
	}
	s, err := w.settings(nil)
	if err != nil || s.Seeding || s.CacheGiB != 30 || s.WatchedPercent != 90 {
		t.Fatalf("%+v %v", s, err)
	}
	percent = 100
	seed = true
	cache = 40
	if _, err = w.savePreferences(Request{CacheGiB: &cache, WatchedPercent: &percent, Seeding: &seed}); err == nil {
		t.Fatal("accepted invalid percentage")
	}
	s, _ = w.settings(nil)
	if s.Seeding || s.CacheGiB != 30 || s.WatchedPercent != 90 {
		t.Fatalf("partial write: %+v", s)
	}
}

func TestNoRetentionProtectsActiveData(t *testing.T) {
	w := &worker{p: paths{State: t.TempDir(), Cache: t.TempDir()}}
	hash := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	dir := filepath.Join(w.p.Cache, hash)
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "video.mkv"), []byte("video"), 0600); err != nil {
		t.Fatal(err)
	}
	stateFile := filepath.Join(w.p.State, "resume.json")
	os.WriteFile(stateFile, []byte("{}"), 0600)
	keep := false
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	_ = ctx
	w.cancel = cancel
	s, err := w.savePreferences(Request{KeepVideo: &keep})
	if err != nil || s.KeepVideo || s.cacheLimit() != 0 {
		t.Fatalf("%+v %v", s, err)
	}
	if _, err = os.Stat(dir); err != nil {
		t.Fatal("active cache removed")
	}
	w.cancel = nil
	if _, err = w.savePreferences(Request{KeepVideo: &keep}); err != nil {
		t.Fatal(err)
	}
	if _, err = os.Stat(dir); !os.IsNotExist(err) {
		t.Fatal("inactive video retained")
	}
	if _, err = os.Stat(stateFile); err != nil {
		t.Fatal("resume state removed")
	}
	s, _ = readSettings(w.p.State)
	if s.KeepVideo {
		t.Fatal("retention preference not persisted")
	}
}
