package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

type Settings struct {
	Seeding        bool `json:"seeding"`
	CacheGiB       int  `json:"cacheGiB"`
	WatchedPercent int  `json:"watchedPercent"`
}

func readSettings(dir string) (Settings, error) {
	s := Settings{CacheGiB: 20, WatchedPercent: 80, Seeding: true}
	b, err := os.ReadFile(filepath.Join(dir, "settings.json"))
	if os.IsNotExist(err) {
		return s, nil
	}
	if err != nil {
		return s, err
	}
	if err = json.Unmarshal(b, &s); err != nil {
		return s, err
	}
	if s.CacheGiB < 1 || s.CacheGiB > 1024 {
		return s, errors.New("cache size must be between 1 and 1024 GiB")
	}
	if s.WatchedPercent < 1 || s.WatchedPercent > 99 {
		return s, errors.New("watched percentage must be between 1 and 99")
	}
	return s, nil
}
func (w *worker) settings(value *int, watched ...*int) (Settings, error) {
	var percent *int
	if len(watched) > 0 {
		percent = watched[0]
	}
	return w.savePreferences(Request{CacheGiB: value, WatchedPercent: percent})
}

func (w *worker) savePreferences(r Request) (Settings, error) {
	value, percent := r.CacheGiB, r.WatchedPercent
	// Serialize eviction with playback so active data is never removed.
	w.mu.Lock()
	defer w.mu.Unlock()
	s, err := readSettings(w.p.State)
	if err != nil {
		return s, err
	}
	if value == nil && percent == nil && r.Seeding == nil {
		return s, nil
	}
	if value != nil && (*value < 1 || *value > 1024) {
		return s, errors.New("cache size must be between 1 and 1024 GiB")
	}
	if value != nil {
		s.CacheGiB = *value
	}
	if percent != nil {
		if *percent < 1 || *percent > 99 {
			return s, errors.New("watched percentage must be between 1 and 99")
		}
		s.WatchedPercent = *percent
	}
	if r.Seeding != nil {
		s.Seeding = *r.Seeding
	}
	if err = atomicJSON(filepath.Join(w.p.State, "settings.json"), s); err != nil {
		return s, err
	}
	// Cleanup after playback uses the new setting; idle cleanup is safe only
	// when the playback lock confirms that all readers have closed.
	if w.cancel == nil && w.playMu.TryLock() {
		defer w.playMu.Unlock()
		err = evictCache(w.p.Cache, int64(s.CacheGiB)<<30)
	}
	return s, err
}
