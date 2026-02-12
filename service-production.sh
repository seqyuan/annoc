#!/bin/bash
# Production service script for serving built files via HTTP with COOP/COEP headers
# This is suitable for Cloudflare proxy access

cd /Volumes/data/github/seqyuan/annocluster

# Check if build directory exists
if [ ! -d "build" ]; then
    echo "Error: build directory not found. Please run 'npm run build' first."
    exit 1
fi

# Kill any existing process on port 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null

# Start Node.js HTTP server with COOP/COEP headers
# Required for SharedArrayBuffer support
nohup node server.js > nohup-server.out 2>&1 &

echo "Production server started on http://0.0.0.0:3000"
echo "Logs: nohup-server.out"
echo "PID: $!"
