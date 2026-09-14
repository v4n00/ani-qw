package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

func installation(mode string, args []string) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	config := os.Getenv("XDG_CONFIG_HOME")
	if config == "" {
		config = filepath.Join(home, ".config")
	}
	return installationAt(mode, args, home, config)
}

func installationAt(mode string, args []string, home, config string) error {
	var err error
	browser := "chromium"
	if len(args) > 0 {
		browser = args[0]
	}
	profiles := map[string]string{"chromium": "chromium", "google-chrome": "google-chrome", "brave-origin": "BraveSoftware/Brave-Origin", "brave": "BraveSoftware/Brave-Browser", "vivaldi": "vivaldi", "vivaldi-snapshot": "vivaldi-snapshot", "google-chrome-beta": "google-chrome-beta", "google-chrome-unstable": "google-chrome-unstable"}
	profile, ok := profiles[browser]
	if !ok {
		return errors.New("browser must be chromium, google-chrome, google-chrome-beta, google-chrome-unstable, brave, brave-origin, vivaldi, or vivaldi-snapshot")
	}
	manifest := filepath.Join(config, profile, "NativeMessagingHosts", hostName+".json")
	binary := filepath.Join(home, ".local", "bin", "ani-qw")
	switch mode {
	case "install":
		exe, err := os.Executable()
		if err != nil {
			return err
		}
		if err = os.MkdirAll(filepath.Dir(binary), 0755); err != nil {
			return err
		}
		if exe != binary {
			src, err := os.Open(exe)
			if err != nil {
				return err
			}
			defer src.Close()
			dst, err := os.CreateTemp(filepath.Dir(binary), ".ani-qw-")
			if err != nil {
				return err
			}
			defer os.Remove(dst.Name())
			if _, err = io.Copy(dst, src); err != nil {
				dst.Close()
				return err
			}
			if err = dst.Chmod(0755); err != nil {
				dst.Close()
				return err
			}
			if err = dst.Close(); err != nil {
				return err
			}
			if err = os.Rename(dst.Name(), binary); err != nil {
				return err
			}
		}
		if err = os.MkdirAll(filepath.Dir(manifest), 0700); err != nil {
			return err
		}
		if err = atomicJSON(manifest, map[string]any{"name": hostName, "description": "Ani-QW mpv streaming helper", "path": binary, "type": "stdio", "allowed_origins": []string{extensionOrigin()}}); err != nil {
			return err
		}
		fmt.Printf("Installed %s\nNative host: %s\nLoad the project's extension/ directory in chrome://extensions.\nExtension ID: %s\nOpen extension settings and use Get AniList token to connect.\n", binary, manifest, extensionID)
	case "uninstall":
		// Remove only our own registrations and executable; preserve user data.
		if err = os.Remove(manifest); err != nil && !os.IsNotExist(err) {
			return err
		}
		registered := false
		for _, p := range profiles {
			if _, e := os.Stat(filepath.Join(config, p, "NativeMessagingHosts", hostName+".json")); e == nil {
				registered = true
			}
		}
		if !registered {
			if err = os.Remove(binary); err != nil && !os.IsNotExist(err) {
				return err
			}
		}
		fmt.Println("Removed native host registration. Remove Ani-QW in chrome://extensions. Cache and saved completion records were retained.")
	case "doctor":
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
			}
			err = json.Unmarshal(b, &m)
			if err == nil && (m.Name != hostName || m.Path != binary || m.Type != "stdio" || len(m.Origins) != 1 || m.Origins[0] != extensionOrigin()) {
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
		fmt.Printf("Expected extension ID: %s\n", extensionID)
		if failed {
			return errors.New("resolve the failures above before playback")
		}
	}
	return nil
}
