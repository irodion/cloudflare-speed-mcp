# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**speed-cloudflare-mcp** is a TypeScript-based MCP (Model Context Protocol) server that integrates with Cloudflare's speed testing API to analyze network connections. The server is designed to be packaged as a Desktop Extension (DXT) for Claude Desktop integration.

## Development Commands

### Project Setup
Since this is a TypeScript project that will use npm/pnpm, typical commands include:
- `npm install` or `pnpm install` - Install dependencies
- `npm run build` or `pnpm build` - Build the TypeScript project
- `npm run dev` or `pnpm dev` - Run in development mode
- `npm test` or `pnpm test` - Run unit tests
- `npm run lint` or `pnpm lint` - Run linting
- `npm run format` or `pnpm format` - Format code

### MCP Server Testing
- Test MCP server functionality using stdio transport
- Validate tool definitions return properly structured JSON responses
- Verify manifest.json loads correctly for DXT packaging

## Architecture

### Core Technologies
- **Language**: TypeScript with Visual Studio Code as primary IDE
- **MCP SDK**: `@modelcontextprotocol/typescript-sdk` for MCP protocol implementation
- **Speed Testing**: `cloudflare/speedtest` library for network analysis
- **Transport**: stdio communication (no authentication required)

### Project Structure
The project follows a 6-phase development workflow:
- `docs/0-backlog/` - Feature backlog
- `docs/1-planning/` - Architecture planning
- `docs/2-implementaion/` - Active development (note: typo in folder name)
- `docs/3-testing/` - Testing procedures
- `docs/4-complete/` - Completed features
- `docs/5-archive/` - Historical content

### DXT Extension Structure
When implementing, follow this structure:
```
extension.dxt/
├── manifest.json         # Required: Extension metadata
├── server/
│   └── index.js          # Main MCP server entry point
├── node_modules/         # Bundled dependencies
├── package.json          # NPM package definition
├── icon.png              # Optional: Extension icon
└── assets/               # Optional: Additional assets
```

### Key Requirements
- **Rate Limiting**: Implement sensible limits to avoid overwhelming Cloudflare servers
- **Error Handling**: Defensive programming with clear error messages and timeout management
- **Security**: Follow DXT security specifications and best practices
- **Tool Schemas**: Define clear JSON schemas for all MCP tools with proper validation

### MCP Development Environment
The project includes several MCP servers configured in `.mcp.json`:
- **serena**: IDE assistant functionality
- **context7**: Context management
- **gitmcp**: Git operations
- **vetmcp**: Security vulnerability scanning
- **brave**: Web search capabilities

All servers use stdio transport and are enabled in Claude Desktop via `.claude/settings.local.json`.

## Development Guidelines

### Code Quality
- Use TypeScript linting and code formatting
- Implement unit tests for all functionality
- Follow the exact DXT specifications for compatibility
- Include proper logging and debugging capabilities

### MCP Protocol
- Implement proper MCP protocol communication via stdio transport
- Structure tools with clear schemas and consistent JSON responses
- Ensure all tool calls return properly structured responses
- Make use of local execution capabilities

### Documentation
Key specification files:
- `docs/functional.md` - Core functionality requirements
- `docs/non-functional.md` - Technology stack and quality requirements
- `docs/dxt.md` - DXT extension specifications and examples