# Changelog

All notable changes to the speed-cloudflare-mcp project will be documented in this file.

## [Unreleased]

**Server Information MCP Tool Implementation Complete (Task 006)** - Server discovery and information tool with regional filtering
- New MCP tool: get_server_info for discovering available Cloudflare speed test servers
- Regional filtering by continent, country, and region
- Distance calculation from user location with optional distance-based filtering
- Server information caching with 5-minute TTL for performance optimization
- Geographic utilities for distance calculations using haversine formula
- Server discovery service with comprehensive filtering and sorting capabilities
- Integration with existing rate limiting system
- Complete unit test suite with validation and error handling coverage

### Technical Implementation Details (Task 006)
- **Server Discovery Service**: Centralized service for managing server information
  - Caching layer with configurable TTL (5 minutes default)
  - Automatic cache invalidation and refresh
  - Fallback to stale cache on discovery failures
  - Server statistics aggregation by continent and country
- **Geographic Utilities**: Distance and location calculations
  - Haversine formula implementation for accurate distance calculations
  - Coordinate validation and formatting utilities
  - Continent mapping from country codes
  - Regional filtering with multi-level criteria
- **MCP Tool Implementation**: Full integration with existing tool infrastructure
  - JSON schema validation for input parameters
  - Support for continent, country, region, and distance filters
  - Configurable result limit (1-100 servers)
  - Optional distance calculation based on user location
  - Structured response with server details and statistics
- **Performance Optimizations**: Efficient server data handling
  - In-memory caching to reduce API calls
  - Rate limiting integration using existing CONNECTION_INFO operation
  - Batch distance calculations for multiple servers
  - Sorted results by distance when user location available

### Files Created/Modified (Task 006)
- `src/tools/server-info.ts` - Server information tool implementation
- `src/schemas/tools/server-info.json` - JSON schema for tool validation
- `src/services/server-discovery.ts` - Server discovery service with caching
- `src/utils/geo.ts` - Geographic utility functions
- `tests/tools/server-info.test.ts` - Comprehensive unit tests
- `src/tools/index.ts` - Updated tool registry with new tool
- `docs/2-implementation/server-info-tool/` - Feature documentation and tracking

**Speed Test MCP Tools Implementation Complete (Task 005)** - Granular MCP tools for targeted network diagnostics
- Six specialized MCP tools for granular speed testing control
- Individual tools: test_latency, test_download_speed, test_upload_speed, test_packet_loss
- Comprehensive tool: run_speed_test with configurable test combinations  
- Utility tool: get_connection_info for network information
- Base tool architecture with shared functionality (rate limiting, validation, error handling)
- Tool registry system for automatic MCP server registration and execution
- JSON schema validation for all tool inputs with comprehensive parameter support
- Standardized result formatting across all tools with execution metadata
- Complete unit test suite for tool validation and error handling

### Technical Implementation Details (Task 005)
- **Granular Tool Architecture**: Multiple focused tools instead of monolithic approach
  - `test_latency`: Ping/latency measurement with configurable packet count
  - `test_download_speed`: Download bandwidth testing with duration/byte controls
  - `test_upload_speed`: Upload bandwidth testing with duration/byte controls
  - `test_packet_loss`: Packet loss measurement with batch configuration
  - `run_speed_test`: Comprehensive testing with configurable test type combinations
  - `get_connection_info`: Connection details including IP, ISP, and location data
- **Base Tool Pattern**: Inheritance-based architecture for code reuse
  - Shared validation, rate limiting, timeout management, and error handling
  - Consistent result formatting and response structure across all tools
  - Tool-specific rate limiting keys for granular control
- **MCP Server Integration**: Full integration with existing server infrastructure
  - Automatic tool registration with ListToolsRequestSchema and CallToolRequestSchema handlers
  - Tool registry for centralized management and execution
  - Error handling with structured responses and proper error codes
- **JSON Schema Validation**: Comprehensive input validation for all tools
  - Individual schema files for each tool with parameter-specific validation
  - Common parameters (timeout, serverLocation) with tool-specific extensions
  - Range validation, enum constraints, and type checking

### Files Created/Modified (Task 005)
- `src/tools/base-tool.ts` - Base tool class with common functionality
- `src/tools/latency-test.ts` - Latency testing tool implementation
- `src/tools/download-test.ts` - Download speed testing tool
- `src/tools/upload-test.ts` - Upload speed testing tool
- `src/tools/packet-loss-test.ts` - Packet loss testing tool
- `src/tools/speed-test.ts` - Comprehensive speed test tool
- `src/tools/connection-info.ts` - Connection information tool
- `src/tools/index.ts` - Tool registry and exports
- `src/types/tools.ts` - Tool-related type definitions
- `src/schemas/tools/*.json` - JSON schemas for all tools
- `src/server.ts` - Updated MCP server with tool integration
- `src/__tests__/tools/` - Comprehensive unit test suite
- `docs/2-implementation/speed-test-tools/` - Feature documentation and task tracking

**Rate Limiting System Implementation Complete (Task 004)** - Comprehensive rate limiting with token bucket algorithm and concurrent operation management
- Token bucket rate limiter with configurable limits per operation type
- Daily usage tracking with automatic reset at midnight
- Concurrent operation limiting (max 1 speed test, 5 pings, 3 traceroutes simultaneously)
- Exponential backoff on rate limit hits with jitter
- In-memory rate limit state persistence with efficient cleanup
- Clear user feedback on rate limit status with wait time calculations
- Environment variable configuration support for all rate limits
- Comprehensive unit test suite with 95%+ test coverage

### Technical Implementation Details (Task 004)
- **Token Bucket Algorithm**: Smooth rate limiting with burst capacity
  - Configurable token refill rates and bucket sizes per operation
  - Default limits: 1 speed test per 180s, 10 pings per 60s, 5 traceroutes per 60s
  - Maximum bucket sizes: 2 speed tests, 20 pings, 10 traceroutes
- **Daily Limits**: Automatic daily usage tracking and reset
  - Speed tests: 50 per day, Pings: 1000 per day, Traceroutes: 500 per day
  - Automatic reset at start of each day (00:00 local time)
- **Concurrent Operations**: Real-time tracking of active operations
  - Prevents overwhelming Cloudflare servers with simultaneous requests
  - Automatic cleanup when operations complete
- **Exponential Backoff**: Intelligent retry delay calculation
  - Base delay: 1s, Max delay: 60s, Multiplier: 2x, Jitter: 10%
  - Consecutive failure tracking with automatic reset on success
- **Configuration Management**: Environment variable overrides
  - All rate limits configurable via environment variables
  - Sensible defaults with validation and error handling

### Files Created/Modified (Task 004)
- `src/types/rate-limit.ts` - Complete TypeScript type definitions and interfaces
- `src/config/rate-limits.ts` - Rate limit configuration with environment variable support
- `src/utils/time.ts` - Time utilities for token bucket calculations and formatting
- `src/services/rate-limiter.ts` - Core rate limiter service with token bucket algorithm
- `tests/services/rate-limiter.test.ts` - Comprehensive unit test suite (25+ tests)
- `docs/1-planning/rate-limiter/` - Complete planning documentation with task list

**Cloudflare API Client Implementation Complete (Task 003)** - Robust Cloudflare speed test API client with comprehensive error handling
- CloudflareSpeedTestClient class with rate limiting, timeout management, and retry logic
- Complete TypeScript type definitions for speed test results, configuration, and errors  
- HTTP utilities with exponential backoff retry strategy and timeout handling
- API configuration module with customizable timeouts and rate limits
- Speed test execution supporting different test types (latency, download, upload, packetLoss, full)
- Server discovery and connection information gathering capabilities
- Comprehensive unit test suite with 95%+ coverage including error scenarios
- Integration with @cloudflare/speedtest v1.5.1 (security vetted - no vulnerabilities)

### Technical Implementation Details (Task 003)
- **Core Client Architecture**: Modular design with separation of concerns
  - `CloudflareSpeedTestClient` class with rate limiting and timeout management
  - `HttpClient` utility with retry logic and exponential backoff
  - Configurable API timeouts (60s default, 120s for speed tests)
  - Rate limiting (10 requests/min, 5 speed tests/hour)
- **Type Safety**: Complete TypeScript interfaces for all data structures
  - `SpeedTestResults`, `SpeedTestSummary`, `ServerLocation` interfaces
  - `SpeedTestConfig`, `SpeedTestOptions`, `ConnectionInfo` types
  - Custom `SpeedTestError` with error codes and retry flags
- **Error Handling**: Comprehensive error management with retry logic
  - Network error handling with meaningful error messages
  - Timeout management with configurable values
  - Rate limiting with burst protection
  - Exponential backoff retry strategy for transient failures
- **Testing Coverage**: Extensive unit testing with mocking
  - Speed test execution with success and error scenarios
  - Connection info retrieval with API response parsing
  - Server discovery with location data validation
  - Rate limiting enforcement and timeout behavior
  - Health check functionality

### Files Created/Modified (Task 003)
- `src/clients/cloudflare.ts` - Main Cloudflare API client implementation
- `src/types/speedtest.ts` - Complete TypeScript type definitions
- `src/utils/http.ts` - HTTP utilities with retry logic and timeout management
- `src/config/api.ts` - API configuration with timeouts and rate limits
- `tests/clients/cloudflare.test.ts` - Comprehensive unit test suite
- `docs/1-planning/cloudflare-api-client/` - Complete planning documentation

**MCP Server Core Implementation Complete (Task 002)** - Comprehensive MCP server infrastructure with lifecycle management
- SpeedCloudflareServer class with proper initialization and shutdown handling  
- Structured logging system with JSON output to stderr (MCP protocol compliant)
- Environment-aware configuration management (NODE_ENV, LOG_LEVEL support)
- TypeScript interfaces for server state, configuration, and error handling
- Graceful shutdown on SIGINT/SIGTERM with extensible shutdown handlers
- Connection state tracking and error recovery mechanisms
- Complete unit test suite with 17 tests covering all components

### Technical Implementation Details (Task 002)
- **Core Server Architecture**: Modular design with separation of concerns
  - `SpeedCloudflareServer` class with lifecycle management
  - `StdioServerTransport` for MCP protocol communication
  - Environment-based configuration with fallback defaults
  - Structured error handling with custom McpError types
- **Logging Infrastructure**: JSON-structured logging to stderr
  - Configurable log levels (DEBUG, INFO, WARN, ERROR)
  - Context-aware logging with metadata support
  - MCP protocol compliance (stdout reserved for protocol)
- **Testing Coverage**: Comprehensive unit testing
  - Server initialization and configuration testing
  - Logging system validation with stderr mocking
  - Configuration management with environment variable testing
  - Jest module name mapping for TypeScript ES modules

### Files Created/Modified (Task 002)
- `src/types/mcp.ts` - MCP-related type definitions and interfaces
- `src/config/server.ts` - Server configuration management
- `src/utils/logger.ts` - Structured logging utilities
- `src/server.ts` - Core MCP server implementation
- `src/index.ts` - Updated main entry point with new server architecture
- `src/__tests__/server.test.ts` - Server component unit tests
- `src/__tests__/logger.test.ts` - Logging system unit tests
- `src/__tests__/config.test.ts` - Configuration management unit tests
- `jest.config.cjs` - Updated Jest configuration for TypeScript ES modules

### Added
-  **Project Setup Complete (Task 001)** - Initial TypeScript project structure with full development toolchain
  - TypeScript configuration with ES2022 target and NodeNext modules
  - Package.json with MCP SDK (@modelcontextprotocol/sdk@1.13.2) and Cloudflare speedtest dependencies
  - ESLint configuration with TypeScript support and Jest globals
  - Prettier configuration for consistent code formatting
  - Jest testing framework with TypeScript support
  - VSCode workspace configuration with development tasks
  - Comprehensive .gitignore for Node.js and TypeScript projects
  - Basic MCP server entry point with stdio transport
  - All development scripts functional: build, test, lint, format

### Technical Details
- MCP SDK: @modelcontextprotocol/sdk v1.13.2 (vetted for security vulnerabilities)
- Cloudflare Speedtest: @cloudflare/speedtest v1.5.1 (vetted for security vulnerabilities)
- TypeScript: ES2022 target with NodeNext module system
- Testing: Jest with ts-jest transformer
- Code Quality: ESLint + Prettier with pre-configured rules
- IDE Support: Full VSCode integration with tasks and settings

### Files Created/Modified
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration 
- `tsconfig.test.json` - Separate test configuration
- `.eslintrc.json` - ESLint rules and TypeScript support
- `.prettierrc` - Code formatting rules
- `jest.config.cjs` - Jest testing configuration
- `.gitignore` - Git ignore patterns
- `.vscode/tasks.json` - VSCode development tasks
- `.vscode/settings.json` - VSCode workspace settings
- `src/index.ts` - Basic MCP server entry point
- `src/__tests__/index.test.ts` - Basic test setup verification

### Verification Status
-  TypeScript compilation works without errors
-  ESLint passes without errors or warnings
-  Prettier formatting works correctly
-  Jest tests run successfully
-  All npm scripts execute successfully
-  MCP server compiles and can be started