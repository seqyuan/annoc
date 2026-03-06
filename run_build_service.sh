#!/bin/bash

echo "Building application..."
npm run build

if [ $? -ne 0 ]; then
  echo "Build failed!"
  exit 1
fi

echo "Starting server with nohup..."
nohup node server.js > server.log 2>&1 &
