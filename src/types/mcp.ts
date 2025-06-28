/**
 * MIT License
 * Copyright (c) 2025 speed-cloudflare-mcp
 * @license SPDX-License-Identifier: MIT
 */

/**
 * MCP-related type definitions for the speed-cloudflare-mcp server
 */

export interface ServerConfig {
  name: string;
  version: string;
  debug?: boolean;
  logLevel?: LogLevel;
}

export interface ServerCapabilities {
  tools?: {
    list?: boolean;
    call?: boolean;
  };
  resources?: {
    list?: boolean;
    read?: boolean;
  };
  prompts?: {
    list?: boolean;
    get?: boolean;
  };
}

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export interface ServerState {
  isConnected: boolean;
  isShuttingDown: boolean;
  startTime: Date;
  connectionCount: number;
}

export interface McpError extends Error {
  code?: string;
  details?: Record<string, unknown>;
}