#!/bin/bash

echo "===== AnnoC Service Status ====="
echo ""

if [ ! -f server.pid ]; then
  echo "Status: NOT RUNNING"
  echo "PID file not found."
  exit 0
fi

PID=$(cat server.pid)

if ps -p $PID > /dev/null 2>&1; then
  echo "Status: RUNNING"
  echo "PID: $PID"
  echo ""
  echo "Process info:"
  ps -p $PID -o pid,ppid,cmd,%mem,%cpu,etime
  echo ""
  echo "Listening on port 3000:"
  lsof -i :3000 2>/dev/null || netstat -tuln 2>/dev/null | grep :3000 || echo "Port info not available"
  echo ""
  echo "Log file: server.log (last 10 lines)"
  echo "---"
  tail -n 10 server.log 2>/dev/null || echo "No log file found"
else
  echo "Status: NOT RUNNING"
  echo "PID file exists but process $PID is not running."
  echo "Cleaning up stale PID file..."
  rm server.pid
fi
