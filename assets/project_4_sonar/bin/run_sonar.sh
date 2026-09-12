#!/bin/bash
set -e

# get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ask the user for their ESP32 board
read -p "Enter your ESP32 Port (e.g., /dev/ttyACM0): " PORT

# compile the code with USB CDC enabled (ESP32-C3)
arduino-cli compile \
  --fqbn esp32:esp32:esp32c3:CDCOnBoot=cdc \
  --build-property "compiler.cpp.extra_flags=-Iinclude" \
  "$PROJECT_ROOT"

# upload the code to the board
arduino-cli upload \
  -p "$PORT" \
  --fqbn esp32:esp32:esp32c3 \
  "$PROJECT_ROOT"

# open the Serial Monitor
arduino-cli monitor \
  -p "$PORT" \
  --config baudrate=115200