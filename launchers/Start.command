#!/bin/bash
cd "$(dirname "$0")"
case "$(uname -m)" in
  arm64) bin=./StudyTutor-arm64 ;;
  *) bin=./StudyTutor-x64 ;;
esac
xattr -d com.apple.quarantine "$bin" 2>/dev/null
exec "$bin"
