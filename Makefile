export GOMODCACHE := $(CURDIR)/.cache/go/mod
export GOCACHE := $(CURDIR)/.cache/go/build
NODE ?= node

.PHONY: build test test-go test-js integration doctor notices
build:
	go build -tags nosqlite -trimpath -o bin/ani-qw ./cmd/ani-qw
test: test-go test-js
test-go:
	go test -tags nosqlite -race ./cmd/ani-qw
test-js:
	$(NODE) --test tests/*.test.js
integration:
	ANI_QW_INTEGRATION=1 go test -tags nosqlite -race -run TestLocalTorrentSeekingAndMPV -v ./cmd/ani-qw
doctor: build
	./bin/ani-qw doctor
notices:
	python3 scripts/collect_notices.py
