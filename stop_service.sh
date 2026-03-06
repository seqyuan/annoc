#!/bin/bash

if [ ! -f server.pid ]; then
  echo "Error: server.pid file not found!"
  echo "Server may not be running or was not started with run_build_service.sh"
  exit 1
fi

PID=$(cat server.pid)

if ps -p $PID > /dev/null 2>&1; then
  echo "Stopping server (PID: $PID)..."
  kill $PID

  # Wait for process to terminate
  sleep 2

  if ps -p $PID > /dev/null 2>&1; then
    echo "Process still running, force killing..."
    kill -9 $PID
  fi

  rm server.pid
  echo "Server stopped successfully!"
else
  echo "Process with PID $PID is not running."
  rm server.pid
fi
