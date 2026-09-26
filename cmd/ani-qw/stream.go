package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/anacrolix/torrent"
	"github.com/anacrolix/torrent/metainfo"
)

type fileChoice struct {
	Index     int    `json:"index"`
	Name      string `json:"name"`
	Size      int64  `json:"size"`
	Suggested bool   `json:"suggested"`
}

func torrentClient(dir string, seed ...bool) (*torrent.Client, error) {
	cfg := torrent.NewDefaultClientConfig()
	cfg.DataDir = dir
	cfg.ListenPort = 0
	cfg.NoDefaultPortForwarding = true
	cfg.Seed = len(seed) > 0 && seed[0]
	cfg.NoUpload = !cfg.Seed
	return torrent.NewClient(cfg)
}
func loadTorrent(ctx context.Context, c *torrent.Client, r Release) (*torrent.Torrent, error) {
	if !hashPattern.MatchString(r.Hash) {
		return nil, errors.New("invalid info hash")
	}
	var t *torrent.Torrent
	var err error
	// Only Nyaa's torrent download route is accepted, never arbitrary URLs.
	u, e := url.Parse(r.DownloadURL)
	if e == nil && u.Scheme == "https" && u.Host == "nyaa.si" && strings.HasPrefix(u.Path, "/download/") && strings.HasSuffix(u.Path, ".torrent") {
		req, _ := http.NewRequestWithContext(ctx, "GET", u.String(), nil)
		client := *httpClient
		client.CheckRedirect = func(req *http.Request, via []*http.Request) error { return http.ErrUseLastResponse }
		if res, e := client.Do(req); e == nil {
			if res.StatusCode == 200 {
				if mi, e := metainfo.Load(io.LimitReader(res.Body, 8<<20)); e == nil && mi.HashInfoBytes().HexString() == strings.ToLower(r.Hash) {
					t, err = c.AddTorrent(mi)
				}
			}
			res.Body.Close()
		}
	}
	if t == nil {
		t, err = c.AddMagnet("magnet:?xt=urn:btih:" + r.Hash + "&dn=" + url.QueryEscape(r.Name))
	}
	if err != nil {
		return nil, err
	}
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-time.After(60 * time.Second):
		return nil, errors.New("torrent metadata unavailable after 60 seconds; choose a better-seeded release")
	case <-t.GotInfo():
	}
	for _, f := range t.Files() {
		if !safeTorrentPath(f.Path()) {
			t.Drop()
			return nil, errors.New("torrent contains an unsafe file path")
		}
		f.SetPriority(torrent.PiecePriorityNone)
	}
	return t, nil
}
func safeTorrentPath(s string) bool {
	if filepath.IsAbs(s) || strings.Contains(s, "\\") {
		return false
	}
	for _, p := range strings.Split(s, "/") {
		if p == ".." {
			return false
		}
	}
	return s != ""
}
func inspectFiles(ctx context.Context, p paths, r Request) (any, error) {
	if r.Torrent == nil {
		return nil, errors.New("select a torrent first")
	}
	dir, err := os.MkdirTemp(p.Runtime, "inspect-")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(dir)
	c, err := torrentClient(dir)
	if err != nil {
		return nil, err
	}
	defer c.Close()
	t, err := loadTorrent(ctx, c, *r.Torrent)
	if err != nil {
		return nil, err
	}
	names := []string{}
	for _, f := range t.Files() {
		names = append(names, f.Path())
	}
	best := matchingFile(names, r.Media, r.Episode)
	out := []fileChoice{}
	for i, f := range t.Files() {
		if videoFile(f.Path()) {
			out = append(out, fileChoice{i, f.Path(), f.Length(), i == best})
		}
	}
	if len(out) == 0 {
		return nil, errors.New("torrent contains no playable video files")
	}
	return out, nil
}

func (w *worker) play(ctx context.Context, sid string, r Request) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	if r.Torrent == nil {
		items, err := searchNyaa(ctx, r.Media, r.Episode, "")
		if err != nil {
			return err
		}
		prefs, err := readSettings(w.p.State)
		if err != nil {
			return err
		}
		r.Torrent = preferredRelease(items, r.Media, r.Episode, prefs)
		if r.Torrent == nil {
			return errManual
		}
	}
	if _, err := exec.LookPath("mpv"); err != nil {
		return errors.New("mpv was not found; install mpv and retry")
	}
	w.update(sid, func(s *State) { s.Phase = "metadata" })
	dir := filepath.Join(w.p.Cache, strings.ToLower(r.Torrent.Hash))
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	os.Chtimes(dir, time.Now(), time.Now())
	prefs, err := readSettings(w.p.State)
	if err != nil {
		return err
	}
	w.update(sid, func(s *State) { s.Seeding = prefs.Seeding })
	c, err := torrentClient(dir, prefs.Seeding)
	if err != nil {
		return err
	}
	defer c.Close()
	t, err := loadTorrent(ctx, c, *r.Torrent)
	if err != nil {
		return err
	}
	names := []string{}
	for _, f := range t.Files() {
		names = append(names, f.Path())
	}
	index := matchingFile(names, r.Media, r.Episode)
	if r.FileIndex != nil {
		index = *r.FileIndex
	}
	if index < 0 || index >= len(names) || !videoFile(names[index]) {
		return errManual
	}
	f := t.Files()[index]
	w.update(sid, func(s *State) {
		s.Phase = "verifying"
		s.Filename = f.Path()
		s.Size = f.Length()
		s.Hash = r.Torrent.Hash
		s.FileIndex = index
	})
	// The library hashes existing pieces; apparent file length is never trusted.
	if err = t.VerifyDataContext(ctx); err != nil {
		return err
	}
	f.SetPriority(torrent.PiecePriorityNormal)
	// Initial windows follow Seanime's GPL-3.0 torrentutil strategy:
	// first 8 MiB urgent, next 24 MiB read-ahead, final 4 MiB for container indexes.
	pieceLength := t.Info().PieceLength
	for index := f.BeginPieceIndex(); index < f.EndPieceIndex(); index++ {
		offset := int64(index)*pieceLength - f.Offset()
		priority := torrent.PiecePriorityNormal
		switch {
		case offset < 8<<20:
			priority = torrent.PiecePriorityNow
		case offset < 32<<20:
			priority = torrent.PiecePriorityReadahead
		case offset+pieceLength > f.Length()-4<<20:
			priority = torrent.PiecePriorityHigh
		}
		t.Piece(index).SetPriority(priority)
	}
	l, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return err
	}
	token := randomID()
	server := &http.Server{Handler: streamHandler(f, token), ReadHeaderTimeout: 5 * time.Second}
	defer server.Close()
	go server.Serve(l)
	ipc := filepath.Join(w.p.Runtime, "mpv-"+sid[:8]+".sock")
	defer os.Remove(ipc)
	streamURL := "http://" + l.Addr().String() + "/" + token + "/video"
	start := playbackStart(w.p.State, r)
	title := r.Media.Title + fmt.Sprintf(" · Episode %d", r.Episode)
	cmd := exec.CommandContext(ctx, "mpv", "--force-media-title="+title, fmt.Sprintf("--start=%.3f", start), "--input-ipc-server="+ipc, "--force-window=yes", "--idle=no", "--keep-open=no", "--title="+r.Media.Title+fmt.Sprintf(" · Episode %d", r.Episode), "--", streamURL)
	cmd.Stderr = os.Stderr
	if err = cmd.Start(); err != nil {
		return fmt.Errorf("could not launch mpv: %w", err)
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	w.update(sid, func(s *State) { s.Phase = "buffering" })
	var conn net.Conn
	for i := 0; i < 100; i++ {
		conn, err = net.DialTimeout("unix", ipc, 100*time.Millisecond)
		if err == nil {
			break
		}
		select {
		case e := <-done:
			return fmt.Errorf("mpv exited before its IPC connection was ready: %v", e)
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(100 * time.Millisecond):
		}
	}
	if conn == nil {
		cmd.Process.Kill()
		<-done
		return errors.New("mpv IPC did not become available")
	}
	defer conn.Close()
	updates := make(chan playbackUpdate, 32)
	go observeMPV(conn, updates)
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	pos := start
	var duration float64
	paused, buffering := false, true
	started := false
	completed := false
	defer func() {
		if err := saveResume(w.p.State, r, pos, completed); err != nil {
			log.Print("save resume: ", err)
		}
	}()
	var disconnectedAt time.Time
	var prevDown, prevUp, lastBytes int64
	lastProgress := time.Now()
	lastResumeSave := time.Now()
	for {
		select {
		case err := <-done:
			if err != nil && ctx.Err() == nil {
				return fmt.Errorf("mpv playback failed: %w", err)
			}
			w.update(sid, func(s *State) { s.Warning = "" })
			return ctx.Err()
		case <-ctx.Done():
			<-done
			return ctx.Err()
		case u, ok := <-updates:
			if !ok {
				updates = nil
				disconnectedAt = time.Now()
				continue
			}
			switch u.Name {
			case "time-pos":
				pos = u.Number
				started = started || pos > start
			case "duration":
				duration = u.Number
			case "pause":
				paused = u.Bool
			case "paused-for-cache":
				buffering = u.Bool
			}
			if !completed && duration > 0 && pos/duration >= float64(prefs.WatchedPercent)/100 && r.UserID > 0 {
				cc := Completion{ID: randomID(), UserID: r.UserID, MediaID: r.Media.ID, Episode: r.Episode, SessionID: sid, Rewatch: r.Rewatch, RepeatBase: r.RepeatBase}
				if err := w.complete(cc); err != nil {
					w.update(sid, func(s *State) { s.Warning = "Could not save watch progress: " + err.Error() })
				} else {
					completed = true
					if err := saveResume(w.p.State, r, pos, true); err != nil {
						log.Print("clear resume: ", err)
					}
					w.broadcast("completion", cc)
				}
			}
		case <-ticker.C:
			if time.Since(lastResumeSave) >= 5*time.Second {
				lastResumeSave = time.Now()
				if err := saveResume(w.p.State, r, pos, completed); err != nil {
					log.Print("save resume: ", err)
				}
			}
			stats := t.Stats()
			down, up := stats.BytesReadData.Int64(), stats.BytesWrittenData.Int64()
			n := f.BytesCompleted()
			if n != lastBytes {
				lastBytes = n
				lastProgress = time.Now()
			}
			warning := ""
			if updates == nil && !completed && time.Since(disconnectedAt) > 2*time.Second {
				warning = "mpv monitoring disconnected. Watch progress may need a manual update."
			}
			if buffering && time.Since(lastProgress) > 45*time.Second && n < f.Length() {
				warning = "Buffering stalled. Try a better-seeded torrent."
			}
			var disk syscall.Statfs_t
			if syscall.Statfs(dir, &disk) == nil && disk.Bavail*uint64(disk.Bsize) < 64<<20 && n < f.Length() {
				cmd.Process.Kill()
				<-done
				return errors.New("disk space exhausted; free space in the cache filesystem and retry")
			}
			w.update(sid, func(s *State) {
				s.Phase = "playing"
				if paused {
					s.Phase = "paused"
				}
				if buffering || !started {
					s.Phase = "buffering"
				}
				s.Position = pos
				s.Duration = duration
				s.Downloaded = n
				s.Size = f.Length()
				if s.Size > 0 {
					s.Percent = 100 * float64(n) / float64(s.Size)
				}
				s.DownloadSpeed = max(0, down-prevDown)
				s.UploadSpeed = max(0, up-prevUp)
				s.Peers = stats.ActivePeers
				s.Seeds = stats.ConnectedSeeders
				s.Warning = warning
			})
			prevDown, prevUp = down, up
		}
	}
}

// Each HTTP request gets an independent seekable reader. Its moving readahead
// window prioritizes pieces around the requested range, including seeks.
func streamHandler(f *torrent.File, token string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/"+token+"/video" {
			http.NotFound(w, r)
			return
		}
		if r.Method != "GET" && r.Method != "HEAD" {
			w.WriteHeader(405)
			return
		}
		reader := f.NewReader()
		defer reader.Close()
		reader.SetContext(r.Context())
		reader.SetReadahead(8 << 20)
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		http.ServeContent(w, r, filepath.Base(f.Path()), time.Time{}, reader)
	})
}

type playbackUpdate struct {
	Name   string
	Number float64
	Bool   bool
}

func observeMPV(conn net.Conn, out chan<- playbackUpdate) {
	defer close(out)
	enc := json.NewEncoder(conn)
	for i, name := range []string{"time-pos", "duration", "pause", "paused-for-cache"} {
		if enc.Encode(map[string]any{"command": []any{"observe_property", i + 1, name}}) != nil {
			return
		}
	}
	scanner := bufio.NewScanner(conn)
	scanner.Buffer(make([]byte, 4096), maxMessage)
	for scanner.Scan() {
		var e struct {
			Event string          `json:"event"`
			Name  string          `json:"name"`
			Data  json.RawMessage `json:"data"`
		}
		if json.Unmarshal(scanner.Bytes(), &e) != nil || e.Event != "property-change" {
			continue
		}
		u := playbackUpdate{Name: e.Name}
		json.Unmarshal(e.Data, &u.Number)
		json.Unmarshal(e.Data, &u.Bool)
		select {
		case out <- u:
		default:
		}
	}
}

var cacheMu sync.Mutex

func evictCache(root string, limit int64) error {
	cacheMu.Lock()
	defer cacheMu.Unlock()
	type entry struct {
		path string
		size int64
		used time.Time
	}
	entries := []entry{}
	var total int64
	dirs, err := os.ReadDir(root)
	if err != nil {
		return err
	}
	for _, d := range dirs {
		if !d.IsDir() || !hashPattern.MatchString(d.Name()) {
			continue
		}
		p := filepath.Join(root, d.Name())
		info, err := d.Info()
		if err != nil {
			return err
		}
		var size int64
		if err = filepath.WalkDir(p, func(path string, d os.DirEntry, e error) error {
			if e != nil {
				return e
			}
			if d.Type()&os.ModeSymlink != 0 {
				return nil
			}
			if !d.IsDir() {
				fi, e := d.Info()
				if e != nil {
					return e
				}
				if st, ok := fi.Sys().(*syscall.Stat_t); ok {
					size += st.Blocks * 512
				} else {
					size += fi.Size()
				}
			}
			return nil
		}); err != nil {
			return err
		}
		total += size
		entries = append(entries, entry{p, size, info.ModTime()})
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].used.Before(entries[j].used) })
	for _, e := range entries {
		if limit > 0 && total <= limit {
			break
		}
		if err := os.RemoveAll(e.path); err != nil {
			return err
		}
		total -= e.size
	}
	return nil
}
