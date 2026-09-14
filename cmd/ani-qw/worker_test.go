package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestProtocol(t *testing.T) {
	var b bytes.Buffer
	r := Request{Version: 1, ID: "request", Command: "state"}
	if err := writeFrame(&b, r); err != nil {
		t.Fatal(err)
	}
	var got Request
	if err := readFrame(&b, &got); err != nil {
		t.Fatal(err)
	}
	if got.ID != r.ID {
		t.Fatal(got)
	}
	binary.Write(&b, binary.NativeEndian, uint32(maxMessage+1))
	if readFrame(&b, &got) == nil {
		t.Fatal("accepted oversized frame")
	}
}
func testWorker(t *testing.T) *worker {
	t.Helper()
	return &worker{p: paths{State: t.TempDir(), Cache: t.TempDir(), Runtime: t.TempDir()}, peers: map[*peer]bool{}, jobs: map[*peer]*job{}, state: State{Phase: "idle"}, lastUse: time.Now()}
}
func TestCompletionPersistence(t *testing.T) {
	w := testWorker(t)
	c := Completion{ID: "c", SessionID: "s", UserID: 4, MediaID: 5, Episode: 6}
	if err := w.complete(c); err != nil {
		t.Fatal(err)
	}
	if err := w.complete(c); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(filepath.Join(w.p.State, "completions.json"))
	var q []Completion
	if err := json.Unmarshal(b, &q); err != nil {
		t.Fatal(err)
	}
	if len(q) != 1 {
		t.Fatal(q)
	}
	if err := w.ack("c", 99); err != nil {
		t.Fatal(err)
	}
	if len(w.pending) != 1 {
		t.Fatal("other account acknowledged completion")
	}
	if err := w.ack("c", 4); err != nil {
		t.Fatal(err)
	}
	if len(w.pending) != 0 {
		t.Fatal(w.pending)
	}
}
func TestDisconnectDoesNotCancelPlayback(t *testing.T) {
	w := testWorker(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	w.cancel = cancel
	a, b := net.Pipe()
	done := make(chan struct{})
	go func() { w.serve(&peer{conn: a}); close(done) }()
	writeFrame(b, Request{Version: 1, ID: "1", Command: "state"})
	var m Message
	if err := readFrame(b, &m); err != nil {
		t.Fatal(err)
	}
	b.Close()
	<-done
	if ctx.Err() != nil {
		t.Fatal("browser disconnect cancelled playback")
	}
	a, b = net.Pipe()
	go w.serve(&peer{conn: a})
	defer b.Close()
	writeFrame(b, Request{Version: 1, ID: "2", Command: "state"})
	if err := readFrame(b, &m); err != nil {
		t.Fatal(err)
	}
	if m.Event != "result" {
		t.Fatal(m)
	}
}
func TestDuplicatePlayIsIdempotent(t *testing.T) {
	w := testWorker(t)
	_, cancel := context.WithCancel(context.Background())
	defer cancel()
	w.cancel = cancel
	w.state = State{SessionID: "existing", Media: Media{ID: 3}, Episode: 4, Phase: "playing"}
	a, b := net.Pipe()
	defer a.Close()
	defer b.Close()
	go w.start(&peer{conn: a}, Request{Version: 1, ID: "x", Media: Media{ID: 3}, Episode: 4})
	var m Message
	if err := readFrame(b, &m); err != nil {
		t.Fatal(err)
	}
	if w.state.SessionID != "existing" {
		t.Fatal("duplicate replaced session")
	}
}
func TestCacheEviction(t *testing.T) {
	root := t.TempDir()
	old := filepath.Join(root, "1111111111111111111111111111111111111111")
	recent := filepath.Join(root, "2222222222222222222222222222222222222222")
	for _, p := range []string{old, recent} {
		os.Mkdir(p, 0700)
		os.WriteFile(filepath.Join(p, "video"), bytes.Repeat([]byte{1}, 8192), 0600)
	}
	os.Chtimes(old, time.Unix(1, 0), time.Unix(1, 0))
	if err := evictCache(root, 8192); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(old); !os.IsNotExist(err) {
		t.Fatal("old entry survived")
	}
	if _, err := os.Stat(recent); err != nil {
		t.Fatal("new entry removed")
	}
}

func TestPlaybackReplacementAndStop(t *testing.T) {
	w := testWorker(t)
	started := make(chan Request, 4)
	stopped := make(chan Request, 4)
	w.playFn = func(ctx context.Context, sid string, r Request) error {
		started <- r
		<-ctx.Done()
		stopped <- r
		return ctx.Err()
	}
	start := func(r Request) {
		t.Helper()
		a, b := net.Pipe()
		defer a.Close()
		defer b.Close()
		go w.start(&peer{conn: a}, r)
		var m Message
		if err := readFrame(b, &m); err != nil {
			t.Fatal(err)
		}
	}
	await := func(ch chan Request) Request {
		t.Helper()
		select {
		case r := <-ch:
			return r
		case <-time.After(3 * time.Second):
			t.Fatal("session transition timed out")
			return Request{}
		}
	}
	r := Request{Version: 1, ID: "1", Media: Media{ID: 1}, Episode: 1, UserID: 7}
	start(r)
	await(started)
	r.Episode = 2
	r.ID = "2"
	start(r)
	if old := await(stopped); old.Episode != 1 {
		t.Fatal("wrong session stopped")
	}
	if next := await(started); next.Episode != 2 {
		t.Fatal("replacement did not start")
	}
	// An explicit alternative torrent must replace playback even for the same episode.
	r.Torrent = &Release{Hash: "1111111111111111111111111111111111111111"}
	r.ID = "3"
	start(r)
	await(stopped)
	await(started)
	a, b := net.Pipe()
	go w.serve(&peer{conn: a})
	writeFrame(b, Request{Version: 1, ID: "stale-stop", Command: "stop", SessionID: "old-session"})
	var stale Message
	if err := readFrame(b, &stale); err != nil {
		t.Fatal(err)
	}
	if stale.Event != "error" {
		t.Fatal("stale Stop must report the changed session")
	}
	writeFrame(b, Request{Version: 1, ID: "stop", Command: "stop"})
	var m Message
	if err := readFrame(b, &m); err != nil {
		t.Fatal(err)
	}
	b.Close()
	await(stopped)
	w.playMu.Lock()
	w.playMu.Unlock()
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.cancel != nil || w.state.Phase != "idle" {
		t.Fatal("session did not finish cleanup")
	}
	if w.state.EndReason != "stopped" || w.state.DownloadSpeed != 0 || w.state.Peers != 0 {
		t.Fatal("stopped session retained live playback state")
	}
}
