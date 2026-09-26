package main

import "path/filepath"

const extensionID = "ibgjkjpggobbbdhphjohjahfliapkjdc"

func extensionOrigin() string { return "chrome-extension://" + extensionID + "/" }

const firefoxExtensionID = "ani-qw@v4n00.github.io"

func nativeInvocation(args []string) bool {
	if len(args) == 1 && args[0] == extensionOrigin() {
		return true
	}
	return len(args) == 2 && filepath.IsAbs(args[0]) && filepath.Base(args[0]) == hostName+".json" && args[1] == firefoxExtensionID
}
