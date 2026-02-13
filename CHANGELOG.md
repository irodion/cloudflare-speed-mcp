# Changelog

All notable changes to the speed-cloudflare-mcp project will be documented in this file.

## [Unreleased]

### Fixed — Production readiness overhaul

**WebRTC polyfill rewrite**
- Removed dangerous `Object.prototype` pollution that injected random fake data into all objects
- New safe polyfill: installs WebRTC globals from `@roamhq/wrtc`, wraps fetch for timing data, polyfills `performance.getEntriesByName` with `transferSize=0` to trigger the speedtest library's estimation fallback
- Polyfill is bounded (60s cleanup) and only sets `globalThis` properties

**Cloudflare client fixes**
- Removed unbounded `rateLimitMap` (memory leak) — rate limiting is handled by the `RateLimiter` service
- Fixed trace API parsing: `indexOf('=')` instead of `split('=')` to handle values containing `=`
- Connection info returns `null` for unavailable fields instead of misleading "Not available via trace API" strings
- Added `speedTest.pause()` on timeout and `timer.unref()` to prevent blocking process exit

**Tool cleanup — all 7 tools**
- Removed all hardcoded/fake data: fake `packetsSent`, `packetsReceived`, `totalPackets`, `lostPackets`, `batchResults`, hardcoded byte counts and durations
- Tools now return only what the Cloudflare API actually provides
- Removed stack trace leaks from all error responses (`base-tool.ts`, `server.ts`)
- Removed sensitive argument logging from MCP server debug output
- Removed dead code: unused measurement creation methods across all tools

**Server hardening**
- Removed stack trace from uncaught exception handler
- Removed stack trace from `createMcpError` details
- Added `timer.unref()` to HTTP timeout to prevent blocking process exit

### Added — Comprehensive test suite
- New test suites: download-test, upload-test, packet-loss-test, speed-test, connection-info, server-info
- Tests cover: successful execution, missing results, rate limiting, network errors, stack trace leak prevention, input validation
- **191 tests** across 16 test suites (up from 90 tests in 10 suites)

### Changed
- `LatencyResult.data`: now `{latency, jitter, downLoadedLatency, upLoadedLatency}` with nullable fields
- `BandwidthResult.data`: simplified to `{bandwidth, throughput}`
- `PacketLossResult.data`: simplified to `{packetLoss}`
- `ConnectionInfoResult.data`: nullable fields, added `raw` trace data

---

## Previous releases

### Server Information Tool (Task 006)
- `get_server_info` tool for discovering Cloudflare speed test servers
- Regional filtering by continent, country, region
- Distance calculation with haversine formula
- Server caching with 5-minute TTL

### Speed Test Tools (Task 005)
- 6 specialized MCP tools: `test_latency`, `test_download_speed`, `test_upload_speed`, `test_packet_loss`, `run_speed_test`, `get_connection_info`
- Base tool architecture with shared validation, rate limiting, error handling
- Tool registry for automatic MCP server registration

### Rate Limiting (Task 004)
- Token bucket rate limiter with configurable limits per operation type
- Daily usage tracking with automatic reset
- Concurrent operation limiting
- Exponential backoff with jitter

### Cloudflare API Client (Task 003)
- `CloudflareSpeedTestClient` with timeout management and retry logic
- HTTP utilities with exponential backoff
- Speed test execution for different test types (latency, download, upload, packetLoss, full)
- Server discovery and connection info via trace API

### MCP Server Core (Task 002)
- `SpeedCloudflareServer` with lifecycle management
- JSON structured logging to stderr
- Graceful shutdown on SIGINT/SIGTERM
- Environment-aware configuration

### Project Setup (Task 001)
- TypeScript with ES2022 target and NodeNext modules
- MCP SDK, Cloudflare speedtest, ESLint, Prettier, Jest
