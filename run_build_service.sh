#!/bin/bash

echo "Building application..."
npm run build

if [ $? -ne 0 ]; then
  echo "Build failed!"
  exit 1
fi

echo "Starting server with nohup..."
nohup node server.js > server.log 2>&1 &
SERVER_PID=$!

echo $SERVER_PID > server.pid
echo "Server started with PID: $SERVER_PID"
echo "Log file: server.log"
echo ""
echo "Check status with: bash check_service.sh"
echo "Stop server with: bash stop_service.sh"
