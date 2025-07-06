/**
 * MIT License
 * Copyright (c) 2025 speed-cloudflare-mcp
 * @license SPDX-License-Identifier: MIT
 */

/**
 * Tests for the SpeedCloudflareServer implementation
 */

// Mock the Cloudflare speedtest module
jest.mock('@cloudflare/speedtest', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    download: jest.fn().mockResolvedValue({ download: 100 }),
    upload: jest.fn().mockResolvedValue({ upload: 50 }),
    ping: jest.fn().mockResolvedValue({ latency: 15 }),
  })),
}));

import { SpeedCloudflareServer } from '../server.js';
import { LogLevel } from '../types/mcp.js';

describe('SpeedCloudflareServer', () => {
  let server: SpeedCloudflareServer;

  beforeEach(() => {
    server = new SpeedCloudflareServer();
  });

  afterEach(async () => {
    if (server.getState().isConnected) {
      await server.stop();
    }
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      const config = server.getConfig();
      expect(config.name).toBe('speed-cloudflare-mcp');
      expect(config.version).toBe('1.0.0');
      expect(config.logLevel).toBeDefined();
    });

    it('should initialize with custom configuration', () => {
      const customServer = new SpeedCloudflareServer({
        debug: true,
        logLevel: LogLevel.DEBUG,
      });
      const config = customServer.getConfig();
      expect(config.debug).toBe(true);
      expect(config.logLevel).toBe(LogLevel.DEBUG);
    });

    it('should have initial state as disconnected', () => {
      const state = server.getState();
      expect(state.isConnected).toBe(false);
      expect(state.isShuttingDown).toBe(false);
      expect(state.connectionCount).toBe(0);
      expect(state.startTime).toBeInstanceOf(Date);
    });
  });

  describe('Shutdown Handlers', () => {
    it('should allow adding shutdown handlers', () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      server.addShutdownHandler(handler);

      // No direct way to test this without stopping the server
      expect(() => server.addShutdownHandler(handler)).not.toThrow();
    });
  });

  describe('Configuration', () => {
    it('should return immutable configuration copy', () => {
      const config1 = server.getConfig();
      const config2 = server.getConfig();

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // Different objects
    });

    it('should return immutable state copy', () => {
      const state1 = server.getState();
      const state2 = server.getState();

      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2); // Different objects
    });
  });
});
