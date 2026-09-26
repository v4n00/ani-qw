package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

func doctor(args []string) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	config := os.Getenv("XDG_CONFIG_HOME")
	if config == "" {
		config = filepath.Join(home, ".config")
	}
	return doctorAt(args, home, config)
}

func doctorAt(args []string, home, config string) error {
	browser := "chromium"
	if len(args) > 0 {
		browser = args[0]
	}
	profiles := map[string]string{"firefox": "firefox", "chromium": "chromium", "google-chrome": "google-chrome", "brave-origin": "BraveSoftware/Brave-Origin", "brave": "BraveSoftware/Brave-Browser", "vivaldi": "vivaldi", "vivaldi-snapshot": "vivaldi-snapshot", "google-chrome-beta": "google-chrome-beta", "google-chrome-unstable": "google-chrome-unstable"}
	profile, ok := profiles[browser]
	if !ok {
		return errors.New("browser must be firefox, chromium, google-chrome, google-chrome-beta, google-chrome-unstable, brave, brave-origin, vivaldi, or vivaldi-snapshot")
	}
	manifest := filepath.Join(config, profile, "NativeMessagingHosts", hostName+".json")
	if browser == "firefox" {
		manifest = filepath.Join(home, ".mozilla/native-messaging-hosts", hostName+".json")
	}
	binary := filepath.Join(home, ".local", "bin", "ani-qw")
	failed := false
	check := func(label string, err error) {
		if err != nil {
			failed = true
			fmt.Printf("FAIL %s: %v\n", label, err)
		} else {
			fmt.Printf("OK   %s\n", label)
		}
	}
	_, err := exec.LookPath("mpv")
	check("mpv", err)
	b, err := os.ReadFile(manifest)
	if err == nil {
		var m struct {
			Name, Path, Type string
			Origins          []string `json:"allowed_origins"`
			Extensions       []string `json:"allowed_extensions"`
		}
		err = json.Unmarshal(b, &m)
		if err == nil && (m.Name != hostName || m.Path != binary || m.Type != "stdio" || (browser != "firefox" && (len(m.Origins) != 1 || m.Origins[0] != extensionOrigin())) || (browser == "firefox" && (len(m.Extensions) != 1 || m.Extensions[0] != firefoxExtensionID))) {
			err = errors.New("manifest does not match this installation")
		}
	}
	check("native host registration", err)
	p, err := appPaths()
	check("application directories", err)
	if err == nil {
		for _, d := range []string{p.Runtime, p.Cache, p.State} {
			f, e := os.CreateTemp(d, ".doctor-")
			if e == nil {
				f.Close()
				os.Remove(f.Name())
			}
			check("writable "+d, e)
		}
		c, e := connectWorker(p)
		if e == nil {
			defer c.Close()
			c.SetDeadline(time.Now().Add(5 * time.Second))
			e = writeFrame(c, Request{Version: 1, ID: "doctor", Command: "state"})
			if e == nil {
				var m Message
				e = readFrame(c, &m)
				if e == nil && (m.Version != 1 || m.Event != "result") {
					e = errors.New("protocol handshake failed")
				}
			}
		}
		check("worker protocol v1", e)
	}
	id := extensionID
	if browser == "firefox" {
		id = firefoxExtensionID
	}
	fmt.Printf("Expected extension ID: %s\n", id)
	if failed {
		return errors.New("resolve the failures above before playback")
	}
	return nil
}
