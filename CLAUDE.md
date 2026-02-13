# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**speed-cloudflare-mcp** is a TypeScript MCP server that gives AI models access to real network diagnostics via Cloudflare's speed testing infrastructure. It exposes 7 tools over stdio transport: latency, download, upload, packet loss, comprehensive speed test, connection info, and server discovery.

## Development Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript (tsc)
npm run dev          # Watch mode
npm test             # Run 191 unit tests (jest)
npm run lint         # ESLint
npm run format       # Prettier
npm start            # Run the MCP server
```

### Testing the MCP server via stdio

```bash
# List all tools
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n' | node dist/index.js 2>/dev/null

# Call a tool
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_connection_info","arguments":{}}}\n' | node dist/index.js 2>/dev/null
```

## Architecture

### Source layout

```
src/
├── index.ts                  # Entry point, installs WebRTC polyfill
├── server.ts                 # MCP server with lifecycle management
├── clients/cloudflare.ts     # Cloudflare speedtest + trace API client
├── tools/                    # 7 MCP tools, all extend BaseTool
│   ├── base-tool.ts          # Shared: validation, rate limiting, error formatting
│   └── index.ts              # ToolRegistry — registers all tools with MCP server
├── services/
│   ├── rate-limiter.ts       # Token bucket rate limiting per operation type
│   └── server-discovery.ts   # Server list with 5-min cache TTL
├── utils/
│   ├── webrtc-polyfill.ts    # Node.js WebRTC + Performance API polyfill
│   ├── http.ts               # HTTP client with retry + timeout
│   ├── logger.ts             # JSON structured logging to stderr
│   └── geo.ts                # Haversine distance calculations
├── types/                    # TypeScript interfaces (tools.ts, speedtest.ts, etc.)
└── config/                   # Server + API configuration
```

### Key technical details

- **WebRTC polyfill** (`src/utils/webrtc-polyfill.ts`): The `@cloudflare/speedtest` library needs WebRTC for packet loss tests and Performance API for bandwidth calculation (`transferSize`). The polyfill installs `@roamhq/wrtc` globals and returns `transferSize=0` to trigger the library's built-in estimation fallback (`numBytes * 1.005`).
- **Trace API**: Connection info comes from `https://1.1.1.1/cdn-cgi/trace`, not the speedtest library. Returns key=value pairs parsed with `indexOf('=')` to handle values containing `=`.
- **Rate limiting**: Token bucket in `RateLimiter` service, not in the Cloudflare client. Tools call `checkRateLimit()` via `BaseTool`.
- **Error handling**: Stack traces are never exposed to clients. Unavailable fields are `null`, never fake strings.
- **Timers**: All `setTimeout` calls use `.unref()` to prevent blocking process exit.

### Tools (7 total)

| Tool | Type | Source |
|------|------|--------|
| `test_latency` | Speed test | `tools/latency-test.ts` |
| `test_download_speed` | Speed test | `tools/download-test.ts` |
| `test_upload_speed` | Speed test | `tools/upload-test.ts` |
| `test_packet_loss` | Speed test | `tools/packet-loss-test.ts` |
| `run_speed_test` | Speed test | `tools/speed-test.ts` |
| `get_connection_info` | Info | `tools/connection-info.ts` |
| `get_server_info` | Info | `tools/server-info.ts` |

### Test structure

Tests live in `src/__tests__/` mirroring the source layout. All tool tests mock `@cloudflare/speedtest`, `RateLimiter`, and `CloudflareSpeedTestClient`. 16 test suites, 191 tests.

## Guidelines

- Tools return only what the Cloudflare API actually provides — no fake/hardcoded measurements
- Error responses must never include stack traces or internal details
- All nullable fields use `null`, not placeholder strings like "Not available"
- Connection info uses the trace API (`1.1.1.1/cdn-cgi/trace`), not the speedtest library
- Rate limiting lives in `RateLimiter` service, not duplicated in clients
- All timers must call `.unref()` to avoid blocking process exit
