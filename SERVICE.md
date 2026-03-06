# Service Management

This document describes how to manage the AnnoC production service.

## Scripts

### `run_build_service.sh`
Builds the application and starts the production server.

```bash
./run_build_service.sh
```

This script:
1. Runs `npm run build` to create production build
2. Starts Node.js server with `nohup`
3. Creates `server.pid` file for process tracking
4. Logs output to `server.log`

### `stop_service.sh`
Stops the running server gracefully.

```bash
./stop_service.sh
```

This script:
1. Reads PID from `server.pid`
2. Attempts graceful shutdown with `kill`
3. Force kills if necessary with `kill -9`
4. Cleans up `server.pid` file

### `check_service.sh`
Checks the current status of the service.

```bash
./check_service.sh
```

Shows:
- Running status
- Process ID and details
- Port 3000 listening status
- Last 10 lines of server log

### `clear-cloudflare-cache.sh`
Clears Cloudflare cache after deployment.

```bash
export CF_ZONE_ID="your_zone_id"
export CF_API_TOKEN="your_api_token"
./clear-cloudflare-cache.sh
```

## Typical Workflow

```bash
# Build and start
./run_build_service.sh

# Check status
./check_service.sh

# Stop when needed
./stop_service.sh
```

## Files Generated

- `server.pid` - Process ID file (auto-managed)
- `server.log` - Server output log (auto-managed)
- `*.out`, `*.sh.o`, `*.sh.e` - Runtime logs (ignored by git)
