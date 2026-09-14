package main

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
)

type resumePoint struct {
	Position   float64 `json:"position"`
	Rewatch    bool    `json:"rewatch"`
	RepeatBase int     `json:"repeatBase"`
}

func resumeFile(dir string, r Request) string {
	return filepath.Join(dir, fmt.Sprintf("resume-%d-%d-%d.json", r.UserID, r.Media.ID, r.Episode))
}
func readResume(dir string, r Request) float64 {
	b, err := os.ReadFile(resumeFile(dir, r))
	if err != nil {
		return 0
	}
	var p resumePoint
	if json.Unmarshal(b, &p) != nil || math.IsNaN(p.Position) || math.IsInf(p.Position, 0) || p.Position < 0 || p.Rewatch != r.Rewatch || p.RepeatBase != r.RepeatBase {
		return 0
	}
	return p.Position
}
func saveResume(dir string, r Request, pos float64, completed bool) error {
	path := resumeFile(dir, r)
	if completed {
		err := os.Remove(path)
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	if pos <= 0 || math.IsNaN(pos) || math.IsInf(pos, 0) {
		return nil
	}
	return atomicJSON(path, resumePoint{pos, r.Rewatch, r.RepeatBase})
}
