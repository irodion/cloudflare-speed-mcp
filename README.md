# speed-cloudflare-mcp

An MCP (Model Context Protocol) server that gives AI models access to real network diagnostics via Cloudflare's speed testing infrastructure.

## What it does

Exposes 7 tools over MCP stdio transport that measure real network performance:

| Tool | Description |
|------|-------------|
| `test_latency` | Measure ping latency and jitter to Cloudflare servers |
| `test_download_speed` | Measure download bandwidth |
| `test_upload_speed` | Measure upload bandwidth |
| `test_packet_loss` | Measure packet loss via WebRTC |
| `run_speed_test` | Comprehensive test combining all of the above |
| `get_connection_info` | Get IP, country, datacenter, TLS version from Cloudflare trace API |
| `get_server_info` | Discover available Cloudflare test servers with regional filtering |

All tools return real measurements — no fake or hardcoded data.

## Quick start

```bash
npm install
npm run build
```

### Use with Claude Desktop

Add to your Claude Desktop MCP config:

```json
{
  "mcpServers": {
    "speed-cloudflare": {
      "command": "node",
      "args": ["/path/to/speed-cloudflare-mcp/dist/index.js"]
    }
  }
}
```

### Test manually via stdio

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | node dist/index.js 2>/dev/null
```

## Development

```bash
npm test          # Run 191 unit tests
npm run build     # Compile TypeScript
npm run lint      # ESLint
npm run format    # Prettier
npm run dev       # Watch mode
```

## Architecture

```
src/
├── index.ts                  # Entry point
├── server.ts                 # MCP server with lifecycle management
├── clients/
│   └── cloudflare.ts         # Cloudflare speedtest + trace API client
├── tools/
│   ├── base-tool.ts          # Shared validation, rate limiting, error handling
│   ├── latency-test.ts       # test_latency
│   ├── download-test.ts      # test_download_speed
│   ├── upload-test.ts        # test_upload_speed
│   ├── packet-loss-test.ts   # test_packet_loss
│   ├── speed-test.ts         # run_speed_test
│   ├── connection-info.ts    # get_connection_info
│   ├── server-info.ts        # get_server_info
│   └── index.ts              # Tool registry
├── services/
│   ├── rate-limiter.ts       # Token bucket rate limiting
│   └── server-discovery.ts   # Server list with caching
├── utils/
│   ├── webrtc-polyfill.ts    # Node.js WebRTC + Performance API polyfill
│   ├── http.ts               # HTTP client with retry + timeout
│   ├── logger.ts             # JSON structured logging to stderr
│   └── geo.ts                # Haversine distance calculations
├── types/                    # TypeScript interfaces
└── config/                   # Server + API configuration
```

### Key design decisions

- **WebRTC polyfill**: `@roamhq/wrtc` provides `RTCPeerConnection` for packet loss tests in Node.js. Performance API polyfill returns `transferSize=0` to trigger the speedtest library's built-in estimation fallback.
- **Rate limiting**: Token bucket algorithm prevents overwhelming Cloudflare servers. Configurable per operation type.
- **No stack traces in responses**: Error responses never expose internal details to clients.
- **Nullable fields**: Connection info returns `null` for unavailable data, never fake placeholder strings.

## Dependencies

| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/sdk` | MCP protocol implementation |
| `@cloudflare/speedtest` | Bandwidth, latency, packet loss measurement |
| `@roamhq/wrtc` | WebRTC support for Node.js (packet loss tests) |

## License

MIT
