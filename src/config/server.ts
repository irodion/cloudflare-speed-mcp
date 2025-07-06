/**
 * MIT License
 * Copyright (c) 2025 speed-cloudflare-mcp
 * @license SPDX-License-Identifier: MIT
 */

/**
 * Server configuration management
 */

import { ServerConfig, LogLevel, ServerCapabilities } from '../types/mcp.js';

export function createServerConfig(): ServerConfig {
  return {
    name: 'speed-cloudflare-mcp',
    version: '1.0.0',
    debug: process.env.NODE_ENV === 'development',
    logLevel: getLogLevel(),
  };
}

export function getServerCapabilities(): ServerCapabilities {
  return {
    tools: {
      list: true,
      call: true,
    },
    resources: {
      list: true,
      read: true,
    },
  };
}

function getLogLevel(): LogLevel {
  const level = process.env.LOG_LEVEL?.toLowerCase();
  switch (level) {
    case 'debug':
      return LogLevel.DEBUG;
    case 'info':
      return LogLevel.INFO;
    case 'warn':
      return LogLevel.WARN;
    case 'error':
      return LogLevel.ERROR;
    default:
      return process.env.NODE_ENV === 'development'
        ? LogLevel.DEBUG
        : LogLevel.INFO;
  }
}
