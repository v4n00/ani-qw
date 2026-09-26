package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
)

type Settings struct {
	Resolution     string `json:"resolution"`
	PreferredGroup string `json:"preferredGroup"`
	KeepVideo      bool   `json:"keepVideo"`
	Seeding        bool   `json:"seeding"`
	CacheGiB       int    `json:"cacheGiB"`
	WatchedPercent int    `json:"watchedPercent"`
}

func readSettings(dir string) (Settings, error) {
	s := Settings{Resolution: "1080p", CacheGiB: 20, WatchedPercent: 80, Seeding: true, KeepVideo: true}
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
	if err := validateQuality(s.Resolution, s.PreferredGroup); err != nil {
		return s, err
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
	if value == nil && percent == nil && r.Seeding == nil && r.KeepVideo == nil && r.Resolution == nil && r.PreferredGroup == nil {
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
	if r.KeepVideo != nil {
		s.KeepVideo = *r.KeepVideo
	}
	if r.Seeding != nil {
		s.Seeding = *r.Seeding
	}
	if r.Resolution != nil {
		s.Resolution = *r.Resolution
	}
	if r.PreferredGroup != nil {
		s.PreferredGroup = strings.TrimSpace(*r.PreferredGroup)
	}
	if err = validateQuality(s.Resolution, s.PreferredGroup); err != nil {
		return s, err
	}
	if err = atomicJSON(filepath.Join(w.p.State, "settings.json"), s); err != nil {
		return s, err
	}
	// Cleanup after playback uses the new setting; idle cleanup is safe only
	// when the playback lock confirms that all readers have closed.
	if w.cancel == nil && w.playMu.TryLock() {
		defer w.playMu.Unlock()
		err = evictCache(w.p.Cache, s.cacheLimit())
	}
	return s, err
}

func (s Settings) cacheLimit() int64 {
	if !s.KeepVideo {
		return 0
	}
	return int64(s.CacheGiB) << 30
}

func validateQuality(resolution, group string) error {
	if resolution != "auto" && resolution != "1080p" && resolution != "720p" {
		return errors.New("resolution must be auto, 1080p, or 720p")
	}
	if len(group) > 80 || strings.ContainsAny(group, "\r\n\x00") {
		return errors.New("preferred release group must be at most 80 characters on one line")
	}
	return nil
}
