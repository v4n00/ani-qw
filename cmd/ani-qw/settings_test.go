package main

import "testing"

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
