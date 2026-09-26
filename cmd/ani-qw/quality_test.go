package main

import "testing"

func TestQualityPreferences(t *testing.T) {
	m := Media{Title: "Example Show", Format: "TV"}
	items := []Release{
		{Name: "[Other] Example Show - 03 [1080p]", Resolution: "1080p", Seeders: 50},
		{Name: "[Preferred] Example Show - 03 [720p]", Resolution: "720p", Seeders: 20},
		{Name: "[Preferred] Example Show - 03 [1080p]", Resolution: "1080p", Seeders: 5},
		{Name: "[Preferred] Different Show - 03 [1080p]", Resolution: "1080p", Seeders: 900},
		{Name: "[Preferred] Example Show - 03 [1080p]", Resolution: "1080p", Seeders: 0},
	}
	for _, tc := range []struct {
		quality, group string
		want           int
	}{{"1080p", "", 0}, {"720p", "", 1}, {"auto", "", 0}, {"1080p", "Preferred", 2}, {"720p", "Preferred", 1}, {"1080p", "Missing", 0}} {
		got := preferredRelease(items, m, 3, Settings{Resolution: tc.quality, PreferredGroup: tc.group})
		if got == nil || *got != items[tc.want] {
			t.Fatalf("%+v: got %+v", tc, got)
		}
	}
	if preferredRelease(items[:1], m, 3, Settings{Resolution: "720p"}) != nil {
		t.Fatal("must request manual selection when preferred resolution is absent")
	}
	if got := preferredRelease(items[1:2], m, 3, Settings{Resolution: "auto"}); got == nil {
		t.Fatal("Auto must fall back to 720p")
	}
}
func TestQualitySettingsPersist(t *testing.T) {
	w := &worker{p: paths{State: t.TempDir(), Cache: t.TempDir()}}
	resolution, group := "720p", " Preferred "
	if _, err := w.savePreferences(Request{Resolution: &resolution, PreferredGroup: &group}); err != nil {
		t.Fatal(err)
	}
	got, err := readSettings(w.p.State)
	if err != nil || got.Resolution != "720p" || got.PreferredGroup != "Preferred" {
		t.Fatalf("%+v %v", got, err)
	}
	resolution = "bad"
	if _, err = w.savePreferences(Request{Resolution: &resolution}); err == nil {
		t.Fatal("invalid resolution accepted")
	}
	got, _ = readSettings(w.p.State)
	if got.Resolution != "720p" {
		t.Fatal("invalid settings persisted")
	}
}
func TestNativeInvocation(t *testing.T) {
	for _, args := range [][]string{{extensionOrigin()}, {"/home/test/.mozilla/native-messaging-hosts/" + hostName + ".json", firefoxExtensionID}} {
		if !nativeInvocation(args) {
			t.Fatalf("rejected %v", args)
		}
	}
	for _, args := range [][]string{{"/tmp/other.json", firefoxExtensionID}, {"relative/" + hostName + ".json", firefoxExtensionID}, {"/tmp/" + hostName + ".json", "wrong-id"}, {"chrome-extension://wrong/"}, nil} {
		if nativeInvocation(args) {
			t.Fatalf("accepted %v", args)
		}
	}
}
