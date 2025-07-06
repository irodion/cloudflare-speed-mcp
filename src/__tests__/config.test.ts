/**
 * MIT License
 * Copyright (c) 2025 speed-cloudflare-mcp
 * @license SPDX-License-Identifier: MIT
 */

/**
 * Tests for server configuration
 */

import { createServerConfig, getServerCapabilities } from '../config/server.js';
import { LogLevel } from '../types/mcp.js';

describe('Server Configuration', () => {
  describe('createServerConfig', () => {
    it('should create default configuration', () => {
      const config = createServerConfig();

      expect(config.name).toBe('speed-cloudflare-mcp');
      expect(config.version).toBe('1.0.0');
      expect(config.debug).toBeDefined();
      expect(typeof config.logLevel).toBe('string');
    });

    it('should set debug mode based on NODE_ENV', () => {
      const originalEnv = process.env.NODE_ENV;

      process.env.NODE_ENV = 'development';
      const devConfig = createServerConfig();
      expect(devConfig.debug).toBe(true);

      process.env.NODE_ENV = 'production';
      const prodConfig = createServerConfig();
      expect(prodConfig.debug).toBe(false);

      process.env.NODE_ENV = originalEnv;
    });

    it('should respect LOG_LEVEL environment variable', () => {
      const originalLogLevel = process.env.LOG_LEVEL;

      process.env.LOG_LEVEL = 'error';
      const config = createServerConfig();
      expect(config.logLevel).toBe(LogLevel.ERROR);

      process.env.LOG_LEVEL = originalLogLevel;
    });
  });

  describe('getServerCapabilities', () => {
    it('should return expected capabilities', () => {
      const capabilities = getServerCapabilities();

      expect(capabilities.tools).toEqual({
        list: true,
        call: true,
      });

      expect(capabilities.resources).toEqual({
        list: true,
        read: true,
      });
    });
  });
});
