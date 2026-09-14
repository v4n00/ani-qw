package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/anacrolix/torrent"
	"github.com/anacrolix/torrent/bencode"
	"github.com/anacrolix/torrent/metainfo"
)

func localClient(t *testing.T, dir string) *torrent.Client {
	t.Helper()
	cfg := torrent.NewDefaultClientConfig()
	cfg.DataDir = dir
	cfg.ListenHost = func(string) string { return "127.0.0.1" }
	cfg.ListenPort = 0
	cfg.DisableIPv6 = true
	cfg.DisableUTP = true
	cfg.NoDHT = true
	cfg.DisableTrackers = true
	cfg.DisablePEX = true
	cfg.NoDefaultPortForwarding = true
	cfg.Seed = true
	c, err := torrent.NewClient(cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { c.Close() })
	return c
}

func TestLocalTorrentSeekingAndMPV(t *testing.T) {
	if os.Getenv("ANI_QW_INTEGRATION") != "1" {
		t.Skip("set ANI_QW_INTEGRATION=1 to exercise local sockets, ffmpeg and mpv")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Second)
	defer cancel()
	dir := t.TempDir()
	video := filepath.Join(dir, "test.mkv")
	cmd := exec.CommandContext(ctx, "ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24", "-t", "5", "-c:v", "mpeg4", video)
	if b, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("test video: %v %s", err, b)
	}
	source, err := os.ReadFile(video)
	if err != nil {
		t.Fatal(err)
	}
	info := metainfo.Info{PieceLength: 16 * 1024}
	if err = info.BuildFromFilePath(video); err != nil {
		t.Fatal(err)
	}
	encoded, err := bencode.Marshal(info)
	if err != nil {
		t.Fatal(err)
	}
	mi := &metainfo.MetaInfo{InfoBytes: encoded}
	seed := localClient(t, dir)
	st, err := seed.AddTorrent(mi)
	if err != nil {
		t.Fatal(err)
	}
	if err = st.VerifyDataContext(ctx); err != nil {
		t.Fatal(err)
	}
	leecher := localClient(t, t.TempDir())
	lt, err := leecher.AddTorrent(mi)
	if err != nil {
		t.Fatal(err)
	}
	lt.AddPeers([]torrent.PeerInfo{{Addr: seed.ListenAddrs()[0], Trusted: true}})
	f := lt.Files()[0]
	server := httptest.NewServer(streamHandler(f, "test-token"))
	defer server.Close()
	for _, pair := range [][2]int{{len(source) - 2000, len(source) - 1}, {0, 2047}, {len(source) / 2, len(source)/2 + 2047}} {
		req, _ := http.NewRequestWithContext(ctx, "GET", server.URL+"/test-token/video", nil)
		req.Header.Set("Range", fmt.Sprintf("bytes=%d-%d", pair[0], pair[1]))
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		b, err := io.ReadAll(res.Body)
		res.Body.Close()
		if err != nil {
			t.Fatal(err)
		}
		if res.StatusCode != 206 || !bytes.Equal(b, source[pair[0]:pair[1]+1]) {
			t.Fatalf("incorrect seek range %v status %d", pair, res.StatusCode)
		}
	}
	res, err := http.Get(server.URL + "/wrong/video")
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 404 {
		t.Fatal("tokenless stream accessible")
	}
	// Real mpv reads the torrent HTTP stream; null outputs need no desktop session.
	ipc := filepath.Join(t.TempDir(), "mpv.sock")
	mpv := exec.CommandContext(ctx, "mpv", "--no-config", "--vo=null", "--ao=null", "--input-ipc-server="+ipc, "--", server.URL+"/test-token/video")
	if err = mpv.Start(); err != nil {
		t.Fatal(err)
	}
	defer mpv.Process.Kill()
	var conn net.Conn
	for i := 0; i < 100; i++ {
		conn, err = net.Dial("unix", ipc)
		if err == nil {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if conn == nil {
		t.Fatal("mpv IPC unavailable")
	}
	defer conn.Close()
	updates := make(chan playbackUpdate, 32)
	go observeMPV(conn, updates)
	done := make(chan error, 1)
	go func() { done <- mpv.Wait() }()
	gotPosition, gotDuration := false, false
	for {
		select {
		case u := <-updates:
			if u.Name == "time-pos" && u.Number > 0 {
				gotPosition = true
			}
			if u.Name == "duration" && u.Number > 0 {
				gotDuration = true
			}
			if gotPosition && gotDuration {
				json.NewEncoder(conn).Encode(map[string]any{"command": []any{"seek", 1, "absolute"}})
				if err := <-done; err != nil {
					t.Fatal(err)
				}
				return
			}
		case err := <-done:
			t.Fatalf("mpv exited before observation: %v", err)
		case <-ctx.Done():
			t.Fatal(ctx.Err())
		}
	}
}
