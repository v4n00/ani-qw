package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestInstallUninstallIsolated(t *testing.T) {
	home := t.TempDir()
	config := filepath.Join(home, "config")
	for _, browser := range []string{"chromium", "brave-origin"} {
		if err := installationAt("install", []string{browser}, home, config); err != nil {
			t.Fatal(err)
		}
	}
	manifest := filepath.Join(config, "BraveSoftware/Brave-Origin/NativeMessagingHosts", hostName+".json")
	b, err := os.ReadFile(manifest)
	if err != nil {
		t.Fatal(err)
	}
	var m struct {
		Path    string
		Origins []string `json:"allowed_origins"`
	}
	if err = json.Unmarshal(b, &m); err != nil {
		t.Fatal(err)
	}
	if m.Path != filepath.Join(home, ".local/bin/ani-qw") || len(m.Origins) != 1 || m.Origins[0] != extensionOrigin() {
		t.Fatal("incorrect native registration")
	}
	if err = installationAt("uninstall", []string{"brave-origin"}, home, config); err != nil {
		t.Fatal(err)
	}
	if _, err = os.Stat(m.Path); err != nil {
		t.Fatal("removed binary still registered by Chromium")
	}
	if err = installationAt("uninstall", []string{"chromium"}, home, config); err != nil {
		t.Fatal(err)
	}
	if _, err = os.Stat(m.Path); !os.IsNotExist(err) {
		t.Fatal("binary not removed after last registration")
	}
}

func TestAdditionalBrowserRegistrations(t *testing.T) {
	for name, profile := range map[string]string{"brave": "BraveSoftware/Brave-Browser", "vivaldi": "vivaldi", "vivaldi-snapshot": "vivaldi-snapshot", "google-chrome-beta": "google-chrome-beta", "google-chrome-unstable": "google-chrome-unstable"} {
		t.Run(name, func(t *testing.T) {
			root := t.TempDir()
			config := filepath.Join(root, "config")
			if err := installationAt("install", []string{name}, root, config); err != nil {
				t.Fatal(err)
			}
			if _, err := os.Stat(filepath.Join(config, profile, "NativeMessagingHosts", hostName+".json")); err != nil {
				t.Fatal(err)
			}
			if err := installationAt("uninstall", []string{name}, root, config); err != nil {
				t.Fatal(err)
			}
		})
	}
}
