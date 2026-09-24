package main

import (
	"encoding/binary"
	"encoding/json"
	"errors"
	"io"
)

const maxMessage = 900 * 1024

type Media struct {
	ID       int      `json:"id"`
	Title    string   `json:"title"`
	Titles   []string `json:"titles"`
	Format   string   `json:"format"`
	Status   string   `json:"status"`
	Episodes int      `json:"episodes"`
}
type Request struct {
	StartOver      bool     `json:"startOver,omitempty"`
	KeepVideo      *bool    `json:"keepVideo,omitempty"`
	Seeding        *bool    `json:"seeding,omitempty"`
	WatchedPercent *int     `json:"watchedPercent,omitempty"`
	Rewatch        bool     `json:"rewatch,omitempty"`
	RepeatBase     int      `json:"repeatBase,omitempty"`
	CacheGiB       *int     `json:"cacheGiB,omitempty"`
	Version        int      `json:"v"`
	ID             string   `json:"id"`
	Command        string   `json:"command"`
	SessionID      string   `json:"sessionId,omitempty"`
	Media          Media    `json:"media"`
	Episode        int      `json:"episode"`
	UserID         int      `json:"userId"`
	Query          string   `json:"query"`
	Torrent        *Release `json:"torrent,omitempty"`
	FileIndex      *int     `json:"fileIndex,omitempty"`
	CompletionID   string   `json:"completionId,omitempty"`
}
type Message struct {
	Version int    `json:"v"`
	ID      string `json:"id,omitempty"`
	Event   string `json:"event"`
	Data    any    `json:"data,omitempty"`
	Error   string `json:"error,omitempty"`
	Code    string `json:"code,omitempty"`
}

func readFrame(r io.Reader, v any) error {
	var n uint32
	if err := binary.Read(r, binary.NativeEndian, &n); err != nil {
		return err
	}
	if n == 0 || n > maxMessage {
		return errors.New("native message exceeds size limit")
	}
	b := make([]byte, n)
	if _, err := io.ReadFull(r, b); err != nil {
		return err
	}
	return json.Unmarshal(b, v)
}
func writeFrame(w io.Writer, v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	if len(b) > maxMessage {
		return errors.New("response exceeds size limit")
	}
	frame := make([]byte, 4+len(b))
	binary.NativeEndian.PutUint32(frame, uint32(len(b)))
	copy(frame[4:], b)
	for len(frame) > 0 {
		n, err := w.Write(frame)
		if err != nil {
			return err
		}
		if n == 0 {
			return io.ErrShortWrite
		}
		frame = frame[n:]
	}
	return nil
}
