// Ani-QW is licensed under GPL-3.0; see LICENSE and THIRD_PARTY.md.
package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"time"
)

const appVersion = "0.1.12"
const protocolVersion = 1
const hostName = "co.aniqw.player"

type paths struct{ Runtime, Cache, State string }

func appPaths() (paths, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return paths{}, err
	}
	xdg := func(key, fallback string) string {
		if s := os.Getenv(key); s != "" {
			return s
		}
		return fallback
	}
	p := paths{
		Runtime: filepath.Join(xdg("XDG_RUNTIME_DIR", filepath.Join(os.TempDir(), fmt.Sprintf("ani-qw-%d", os.Getuid()))), "ani-qw"),
		Cache:   filepath.Join(xdg("XDG_CACHE_HOME", filepath.Join(home, ".cache")), "ani-qw"),
		State:   filepath.Join(xdg("XDG_STATE_HOME", filepath.Join(home, ".local", "state")), "ani-qw"),
	}
	for _, d := range []string{p.Runtime, p.Cache, p.State} {
		if err := os.MkdirAll(d, 0700); err != nil {
			return p, err
		}
		fi, err := os.Lstat(d)
		if err != nil {
			return p, err
		}
		st, ok := fi.Sys().(*syscall.Stat_t)
		if !fi.IsDir() || fi.Mode()&os.ModeSymlink != 0 || !ok || st.Uid != uint32(os.Getuid()) {
			return p, fmt.Errorf("unsafe application directory: %s", d)
		}
		if err := os.Chmod(d, 0700); err != nil {
			return p, err
		}
	}
	return p, nil
}

func randomID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}
func atomicJSON(path string, value any) error {
	b, err := json.Marshal(value)
	if err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(path), ".pending-*")
	if err != nil {
		return err
	}
	name := f.Name()
	defer os.Remove(name)
	if _, err = f.Write(b); err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	return os.Rename(name, path)
}

func main() {
	log.SetOutput(os.Stderr)
	mode := "native"
	if len(os.Args) > 1 {
		mode = os.Args[1]
	}
	var err error
	switch mode {
	case "worker":
		err = runWorker()
	case "install", "uninstall", "doctor":
		err = installation(mode, os.Args[2:])
	case "version", "--version":
		fmt.Printf("Ani-QW %s protocol %d\n", appVersion, protocolVersion)
	case "native":
		err = runNative()
	default:
		// Chromium passes the calling extension origin as argv[1].
		if mode == extensionOrigin() {
			err = runNative()
		} else {
			err = errors.New("usage: ani-qw [native|worker|install|uninstall|doctor|version]")
		}
	}
	if err != nil {
		log.Print(err)
		os.Exit(1)
	}
}

func connectWorker(p paths) (net.Conn, error) {
	socket := filepath.Join(p.Runtime, "worker.sock")
	if c, err := net.DialTimeout("unix", socket, time.Second); err == nil {
		return c, nil
	}
	exe, err := os.Executable()
	if err != nil {
		return nil, err
	}
	f, err := os.OpenFile(filepath.Join(p.State, "worker.log"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	cmd := exec.Command(exe, "worker")
	cmd.Stdout = f
	cmd.Stderr = f
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	if err = cmd.Start(); err != nil {
		return nil, err
	}
	go cmd.Wait()
	for i := 0; i < 100; i++ {
		if c, err := net.DialTimeout("unix", socket, time.Second); err == nil {
			return c, nil
		}
		time.Sleep(50 * time.Millisecond)
	}
	return nil, errors.New("helper could not start; run ani-qw doctor and inspect worker.log")
}

func runNative() error {
	p, err := appPaths()
	if err != nil {
		return err
	}
	c, err := connectWorker(p)
	if err != nil {
		return err
	}
	defer c.Close()
	done := make(chan error, 2)
	go func() { _, err := io.Copy(os.Stdout, c); done <- err }()
	go func() { _, err := io.Copy(c, os.Stdin); done <- err }()
	return <-done
}
