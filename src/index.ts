/**
 * MIT License
 * Copyright (c) 2025 speed-cloudflare-mcp
 * @license SPDX-License-Identifier: MIT
 */

/**
 * Main entry point for the speed-cloudflare-mcp server
 */

import { SpeedCloudflareServer } from './server.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  try {
    const server = new SpeedCloudflareServer();
    
    // Add any custom shutdown handlers if needed
    server.addShutdownHandler(async () => {
      logger.info('Performing final cleanup...');
      // Add any cleanup logic here
    });

    await server.start();
    
    logger.info('Server is running and waiting for connections...');
    
    // Keep the process alive
    process.stdin.resume();
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error('Unhandled error in main', { error });
  process.exit(1);
});
