package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"os"
	"path/filepath"
	"sync"
	"syscall"
	"time"
)

type Completion struct {
	Rewatch    bool   `json:"rewatch,omitempty"`
	RepeatBase int    `json:"repeatBase,omitempty"`
	ID         string `json:"id"`
	UserID     int    `json:"userId"`
	MediaID    int    `json:"mediaId"`
	Episode    int    `json:"episode"`
	SessionID  string `json:"sessionId"`
}
type State struct {
	Seeding       bool    `json:"seeding"`
	Rewatch       bool    `json:"rewatch,omitempty"`
	UserID        int     `json:"userId"`
	Hash          string  `json:"hash,omitempty"`
	FileIndex     int     `json:"fileIndex"`
	SessionID     string  `json:"sessionId"`
	Media         Media   `json:"media"`
	Episode       int     `json:"episode"`
	Phase         string  `json:"phase"`
	EndReason     string  `json:"endReason,omitempty"`
	Filename      string  `json:"filename,omitempty"`
	Downloaded    int64   `json:"downloaded"`
	Size          int64   `json:"size"`
	Percent       float64 `json:"percent"`
	DownloadSpeed int64   `json:"downloadSpeed"`
	UploadSpeed   int64   `json:"uploadSpeed"`
	Peers         int     `json:"peers"`
	Seeds         int     `json:"seeds"`
	Position      float64 `json:"position"`
	Duration      float64 `json:"duration"`
	Warning       string  `json:"warning,omitempty"`
}
type peer struct {
	conn net.Conn
	mu   sync.Mutex
}

func (p *peer) send(m Message) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.conn.SetWriteDeadline(time.Now().Add(3 * time.Second))
	if writeFrame(p.conn, m) != nil {
		p.conn.Close()
	}
}

type worker struct {
	p       paths
	mu      sync.Mutex
	peers   map[*peer]bool
	state   State
	pending []Completion
	cancel  context.CancelFunc
	jobs    map[*peer]*job
	lastUse time.Time
	playMu  sync.Mutex
	playFn  func(context.Context, string, Request) error
}

type job struct{ cancel context.CancelFunc }

func runWorker() error {
	p, err := appPaths()
	if err != nil {
		return err
	}
	lock, err := os.OpenFile(filepath.Join(p.Runtime, "worker.lock"), os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return err
	}
	defer lock.Close()
	if err = syscall.Flock(int(lock.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		return nil
	}
	// Recover temporary video left by an interrupted no-retention session.
	prefs, err := readSettings(p.State)
	if err != nil {
		return err
	}
	if !prefs.KeepVideo {
		if err := evictCache(p.Cache, 0); err != nil {
			return err
		}
	}
	socket := filepath.Join(p.Runtime, "worker.sock")
	os.Remove(socket)
	l, err := net.Listen("unix", socket)
	if err != nil {
		return err
	}
	defer l.Close()
	defer os.Remove(socket)
	w := &worker{p: p, peers: map[*peer]bool{}, jobs: map[*peer]*job{}, state: State{Phase: "idle"}, lastUse: time.Now()}
	if b, err := os.ReadFile(filepath.Join(p.State, "completions.json")); err == nil {
		if err = json.Unmarshal(b, &w.pending); err != nil {
			return fmt.Errorf("cannot read saved completion queue: %w", err)
		}
	}
	go func() {
		for range time.NewTicker(5 * time.Second).C {
			w.mu.Lock()
			idle := w.cancel == nil && len(w.jobs) == 0 && time.Since(w.lastUse) > 45*time.Second
			w.mu.Unlock()
			if idle {
				l.Close()
				return
			}
		}
	}()
	for {
		c, err := l.Accept()
		if err != nil {
			return nil
		}
		go w.serve(&peer{conn: c})
	}
}
func (w *worker) broadcast(event string, data any) {
	w.mu.Lock()
	ps := make([]*peer, 0, len(w.peers))
	for p := range w.peers {
		ps = append(ps, p)
	}
	w.mu.Unlock()
	for _, p := range ps {
		p.send(Message{Version: 1, Event: event, Data: data})
	}
}
func (w *worker) update(sid string, fn func(*State)) {
	w.mu.Lock()
	if w.state.SessionID != sid {
		w.mu.Unlock()
		return
	}
	fn(&w.state)
	s := w.state
	w.mu.Unlock()
	w.broadcast("state", s)
}
func (w *worker) serve(p *peer) {
	w.mu.Lock()
	w.peers[p] = true
	w.lastUse = time.Now()
	w.mu.Unlock()
	defer func() {
		p.conn.Close()
		w.mu.Lock()
		delete(w.peers, p)
		if c := w.jobs[p]; c != nil {
			c.cancel()
			delete(w.jobs, p)
		}
		w.lastUse = time.Now()
		w.mu.Unlock()
	}()
	for {
		var r Request
		if readFrame(p.conn, &r) != nil {
			return
		}
		if r.Version != 1 || r.ID == "" {
			p.send(Message{Version: 1, ID: r.ID, Event: "error", Error: "protocol mismatch; reinstall matching extension and helper"})
			continue
		}
		w.mu.Lock()
		w.lastUse = time.Now()
		w.mu.Unlock()
		switch r.Command {
		case "resume":
			if err := validate(r); err != nil {
				w.reply(p, r, nil, err)
			} else if r.UserID < 1 {
				w.reply(p, r, nil, errors.New("invalid user"))
			} else {
				w.reply(p, r, map[string]any{"position": readResume(w.p.State, r)}, nil)
			}
		case "updates":
			go func(r Request) { result, err := checkUpdates(); w.reply(p, r, result, err) }(r)
		case "settings":
			s, err := w.savePreferences(r)
			w.reply(p, r, s, err)
		case "state":
			w.mu.Lock()
			s := w.state
			q := append([]Completion{}, w.pending...)
			w.mu.Unlock()
			p.send(Message{Version: 1, ID: r.ID, Event: "result", Data: map[string]any{"state": s, "completions": q}})
		case "ack":
			err := w.ack(r.CompletionID, r.UserID)
			w.reply(p, r, nil, err)
		case "stop":
			w.mu.Lock()
			if r.SessionID != "" && r.SessionID != w.state.SessionID {
				w.mu.Unlock()
				w.reply(p, r, nil, errors.New("playback session changed; reconnect and stop the current session"))
				continue
			}
			if w.cancel != nil {
				w.state.Phase = "stopping"
				w.cancel()
			}
			w.mu.Unlock()
			w.reply(p, r, nil, nil)
		case "cancel":
			w.mu.Lock()
			if c := w.jobs[p]; c != nil {
				c.cancel()
			}
			w.mu.Unlock()
			w.reply(p, r, nil, nil)
		case "search", "files":
			if err := validate(r); err != nil {
				w.reply(p, r, nil, err)
				continue
			}
			w.mu.Lock()
			if c := w.jobs[p]; c != nil {
				c.cancel()
			}
			ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
			j := &job{cancel: cancel}
			w.jobs[p] = j
			w.mu.Unlock()
			go func(r Request) {
				defer cancel()
				defer func() {
					w.mu.Lock()
					if w.jobs[p] == j {
						delete(w.jobs, p)
					}
					w.lastUse = time.Now()
					w.mu.Unlock()
				}()
				var data any
				var err error
				if r.Command == "search" {
					data, err = searchNyaa(ctx, r.Media, r.Episode, r.Query)
				} else {
					data, err = inspectFiles(ctx, w.p, r)
				}
				w.reply(p, r, data, err)
			}(r)
		case "play":
			if err := validate(r); err != nil {
				w.reply(p, r, nil, err)
			} else {
				w.start(p, r)
			}
		default:
			w.reply(p, r, nil, errors.New("unknown command"))
		}
	}
}
func validate(r Request) error {
	if r.Media.ID < 1 || r.Episode < 1 || r.Episode > 100000 || len(r.Query) > 500 || len(r.Media.Titles) > 50 || len(r.Media.Title) > 500 {
		return errors.New("invalid media, episode, or search")
	}
	if r.Torrent != nil && !hashPattern.MatchString(r.Torrent.Hash) {
		return errors.New("invalid torrent info hash")
	}
	return nil
}
func (w *worker) reply(p *peer, r Request, data any, err error) {
	m := Message{Version: 1, ID: r.ID, Event: "result", Data: data}
	if err != nil {
		m.Event = "error"
		m.Error = err.Error()
		if errors.Is(err, errManual) {
			m.Code = "manual"
		}
	}
	p.send(m)
}

var errManual = errors.New("please select a torrent and episode file manually")

func (w *worker) start(p *peer, r Request) {
	w.mu.Lock()
	sameSelection := r.Torrent == nil || (r.Torrent.Hash == w.state.Hash && (r.FileIndex == nil || *r.FileIndex == w.state.FileIndex))
	if w.cancel != nil && w.state.Media.ID == r.Media.ID && w.state.Episode == r.Episode && w.state.UserID == r.UserID && sameSelection {
		s := w.state
		w.mu.Unlock()
		w.reply(p, r, s, nil)
		return
	}
	if w.cancel != nil {
		w.cancel()
	}
	ctx, cancel := context.WithCancel(context.Background())
	sid := randomID()
	w.cancel = cancel
	w.state = State{Rewatch: r.Rewatch, SessionID: sid, Media: r.Media, Episode: r.Episode, UserID: r.UserID, FileIndex: -1, Phase: "searching"}
	if r.Torrent != nil {
		w.state.Hash = r.Torrent.Hash
	}
	if r.FileIndex != nil {
		w.state.FileIndex = *r.FileIndex
	}
	s := w.state
	w.mu.Unlock()
	w.reply(p, r, s, nil)
	w.broadcast("state", s)
	go func() {
		w.playMu.Lock()
		defer w.playMu.Unlock()
		defer cancel()
		play := w.playFn
		if play == nil {
			play = w.play
		}
		err := play(ctx, sid, r)
		if err != nil && ctx.Err() == nil {
			code := "playback"
			if errors.Is(err, errManual) {
				code = "manual"
			}
			w.broadcast("failure", map[string]any{"sessionId": sid, "code": code, "message": err.Error()})
		}
		w.mu.Lock()
		current := w.state.SessionID == sid
		if current {
			w.cancel = nil
			w.state.Phase = "idle"
			w.state.DownloadSpeed = 0
			w.state.UploadSpeed = 0
			w.state.Peers = 0
			w.state.Seeds = 0
			w.state.EndReason = "closed"
			if ctx.Err() != nil {
				w.state.EndReason = "stopped"
			}
			w.state.Warning = ""
			if err != nil && ctx.Err() == nil {
				w.state.EndReason = "error"
				w.state.Warning = err.Error()
			}
			w.lastUse = time.Now()
		}
		s := w.state
		w.mu.Unlock()
		if current {
			w.broadcast("state", s)
		}
		settings, settingsErr := readSettings(w.p.State)
		if settingsErr != nil {
			log.Print(settingsErr)
			settings.CacheGiB = 20
			settings.KeepVideo = true
		}
		if err := evictCache(w.p.Cache, settings.cacheLimit()); err != nil {
			log.Print(err)
		}
	}()
}
func (w *worker) complete(c Completion) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	for _, old := range w.pending {
		if old.SessionID == c.SessionID {
			return nil
		}
	}
	q := append(append([]Completion{}, w.pending...), c)
	if err := atomicJSON(filepath.Join(w.p.State, "completions.json"), q); err != nil {
		return err
	}
	w.pending = q
	return nil
}
func (w *worker) ack(id string, user int) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	q := []Completion{}
	for _, c := range w.pending {
		if c.ID != id || c.UserID != user {
			q = append(q, c)
		}
	}
	if err := atomicJSON(filepath.Join(w.p.State, "completions.json"), q); err != nil {
		return err
	}
	w.pending = q
	return nil
}
