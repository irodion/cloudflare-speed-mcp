/**
 * MIT License
 * Copyright (c) 2025 speed-cloudflare-mcp
 * @license SPDX-License-Identifier: MIT
 */

/**
 * Tests for the logging utilities
 */

import { createLogger, LogLevel } from '../utils/logger.js';

// Mock stderr to capture log output
const mockStderr = jest
  .spyOn(process.stderr, 'write')
  .mockImplementation(() => true);

describe('Logger', () => {
  beforeEach(() => {
    mockStderr.mockClear();
  });

  afterAll(() => {
    mockStderr.mockRestore();
  });

  describe('Log Levels', () => {
    it('should log debug messages when level is DEBUG', () => {
      const logger = createLogger(LogLevel.DEBUG);
      logger.debug('test message');

      expect(mockStderr).toHaveBeenCalledWith(
        expect.stringContaining('"level":"debug"')
      );
      expect(mockStderr).toHaveBeenCalledWith(
        expect.stringContaining('"message":"test message"')
      );
    });

    it('should not log debug messages when level is INFO', () => {
      const logger = createLogger(LogLevel.INFO);
      logger.debug('test message');

      expect(mockStderr).not.toHaveBeenCalled();
    });

    it('should log info messages when level is INFO', () => {
      const logger = createLogger(LogLevel.INFO);
      logger.info('test message');

      expect(mockStderr).toHaveBeenCalledWith(
        expect.stringContaining('"level":"info"')
      );
    });

    it('should log error messages at all levels', () => {
      const logger = createLogger(LogLevel.ERROR);
      logger.error('test error');

      expect(mockStderr).toHaveBeenCalledWith(
        expect.stringContaining('"level":"error"')
      );
    });
  });

  describe('Context Logging', () => {
    it('should include context in log output', () => {
      const logger = createLogger(LogLevel.DEBUG);
      logger.info('test message', { userId: 123, action: 'test' });

      expect(mockStderr).toHaveBeenCalledWith(
        expect.stringContaining('"context":{"userId":123,"action":"test"}')
      );
    });
  });

  describe('Level Setting', () => {
    it('should allow changing log level dynamically', () => {
      const logger = createLogger(LogLevel.ERROR);

      // Debug should not log initially
      logger.debug('debug message');
      expect(mockStderr).not.toHaveBeenCalled();

      // Change to debug level
      logger.setLevel(LogLevel.DEBUG);
      logger.debug('debug message');

      expect(mockStderr).toHaveBeenCalledWith(
        expect.stringContaining('"level":"debug"')
      );
    });
  });
});
