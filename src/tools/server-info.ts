/**
 * Server info MCP tool implementation
 */

import { BaseTool } from './base-tool.js';
import { RateLimiter } from '../services/rate-limiter.js';
import { CloudflareSpeedTestClient } from '../clients/cloudflare.js';
import {
  ServerDiscoveryService,
  ServerInfo,
  ServerFilter,
} from '../services/server-discovery.js';
import { Location } from '../utils/geo.js';
import { OperationType } from '../types/rate-limit.js';
import type {
  ToolExecutionContext,
  ToolResult,
  McpToolResponse,
} from '../types/tools.js';
import { logger } from '../utils/logger.js';

interface ServerInfoOptions {
  continent?: string;
  country?: string;
  region?: string;
  maxDistance?: number;
  includeDistance?: boolean;
  limit?: number;
}

interface ServerInfoResult extends ToolResult {
  data?: {
    servers: Array<{
      name: string;
      location: string;
      country: string;
      city: string;
      region: string;
      continent?: string;
      coordinates?: {
        latitude: number;
        longitude: number;
      };
      distance?: string;
      status: string;
    }>;
    totalServers: number;
    filterApplied: boolean;
    userLocation?: {
      country: string;
      region: string;
      city: string;
      coordinates?: {
        latitude: number;
        longitude: number;
      };
    };
    stats?: {
      byContinent: Record<string, number>;
      byCountry: Record<string, number>;
    };
  };
}

export class ServerInfoTool extends BaseTool {
  private serverDiscovery: ServerDiscoveryService;

  constructor(
    rateLimiter: RateLimiter,
    cloudflareClient: CloudflareSpeedTestClient
  ) {
    super(rateLimiter, cloudflareClient);
    this.serverDiscovery = new ServerDiscoveryService(
      cloudflareClient,
      rateLimiter
    );
  }

  getToolName(): string {
    return 'get_server_info';
  }

  getDescription(): string {
    return 'Get information about available Cloudflare speed test servers with optional regional filtering';
  }

  getInputSchema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        continent: {
          type: 'string',
          description:
            'Filter servers by continent (e.g., "north-america", "europe", "asia")',
          enum: [
            'north-america',
            'south-america',
            'europe',
            'asia',
            'africa',
            'oceania',
          ],
        },
        country: {
          type: 'string',
          description:
            'Filter servers by country code (e.g., "US", "GB", "JP")',
          pattern: '^[A-Z]{2}$',
        },
        region: {
          type: 'string',
          description:
            'Filter servers by region/state (e.g., "California", "Texas")',
        },
        maxDistance: {
          type: 'number',
          description: 'Maximum distance in kilometers from user location',
          minimum: 0,
        },
        includeDistance: {
          type: 'boolean',
          description:
            'Whether to calculate distances from user location (requires location access)',
          default: false,
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of servers to return',
          minimum: 1,
          maximum: 100,
          default: 20,
        },
      },
      additionalProperties: false,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
  protected validateArguments(args: Record<string, unknown>): void {
    // The MCP framework handles JSON schema validation automatically
    // Only add business logic validation here that can't be expressed in JSON schema
    // Currently, all validation for this tool can be expressed in the schema
  }

  protected async executeImpl(
    args: Record<string, unknown>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
    _context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      const options = args as ServerInfoOptions;
      const limit = options.limit || 20;

      // Get user location if distance calculation is requested
      let userLocation: Location | undefined;
      if (options.includeDistance || options.maxDistance !== undefined) {
        try {
          const connectionInfo =
            await this.cloudflareClient.getConnectionInfo();
          userLocation = {
            latitude: undefined,
            longitude: undefined,
            country: connectionInfo.country,
            region: connectionInfo.region,
            city: connectionInfo.city,
          };
          logger.info('User location determined (coordinates not available)', {
            country: userLocation.country,
            city: userLocation.city,
          });
        } catch (error) {
          logger.warn('Failed to get user location for distance calculation', {
            error,
          });
        }
      }

      // Create filter
      const filter: ServerFilter = {
        continent: options.continent,
        country: options.country,
        region: options.region,
        maxDistance: options.maxDistance,
      };

      // Get servers with filtering
      const servers = await this.serverDiscovery.getServers(
        filter,
        userLocation
      );

      // Apply limit
      const limitedServers = servers.slice(0, limit);

      // Get stats if no specific filters applied
      let stats;
      if (!options.continent && !options.country && !options.region) {
        stats = await this.serverDiscovery.getServerStats();
      }

      // Format response
      const result: ServerInfoResult = {
        success: true,
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        data: {
          servers: limitedServers.map((server) =>
            this.formatServerInfo(server)
          ),
          totalServers: servers.length,
          filterApplied: !!(
            options.continent ||
            options.country ||
            options.region ||
            options.maxDistance
          ),
          ...(userLocation && {
            userLocation: {
              country: userLocation.country || 'unknown',
              region: userLocation.region || 'unknown',
              city: userLocation.city || 'unknown',
              ...(userLocation.latitude &&
                userLocation.longitude && {
                  coordinates: {
                    latitude: userLocation.latitude,
                    longitude: userLocation.longitude,
                  },
                }),
            },
          }),
          ...(stats && {
            stats: {
              byContinent: stats.byContinent,
              byCountry: stats.byCountry,
            },
          }),
        },
      };

      return result;
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SERVER_INFO_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Failed to get server information',
          details: error,
        },
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }
  }

  private formatServerInfo(server: ServerInfo): {
    name: string;
    location: string;
    country: string;
    city: string;
    region: string;
    continent?: string;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
    distance?: string;
    status: string;
  } {
    return {
      name: server.name,
      location: server.location,
      country: server.country,
      city: server.city,
      region: server.region,
      ...(server.continent && { continent: server.continent }),
      ...(server.latitude &&
        server.longitude && {
          coordinates: {
            latitude: server.latitude,
            longitude: server.longitude,
          },
        }),
      ...(server.distanceKm !== undefined && {
        distance:
          server.distanceKm < 1
            ? `${Math.round(server.distanceKm * 1000)} m`
            : `${server.distanceKm.toFixed(1)} km`,
      }),
      status: server.status,
    };
  }

  protected formatResponse(result: ToolResult): McpToolResponse {
    if (!result.success || !result.data) {
      return {
        content: [
          {
            type: 'text',
            text: 'Failed to retrieve server information',
          },
        ],
        isError: true,
      };
    }

    const data = (result as ServerInfoResult).data!;
    let text = `Found ${data.servers.length} servers`;

    if (data.filterApplied) {
      text += ' (filtered)';
    }

    text += `\n\n`;

    // Add user location if available
    if (data.userLocation) {
      text += `Your location: ${data.userLocation.city}, ${data.userLocation.region}, ${data.userLocation.country}\n\n`;
    }

    // List servers
    data.servers.forEach((server, index) => {
      text += `${index + 1}. ${server.name} - ${server.location}`;
      if (server.distance) {
        text += ` (${server.distance})`;
      }
      text += `\n   Status: ${server.status}`;
      if (server.continent) {
        text += ` | Continent: ${server.continent}`;
      }
      text += '\n';
    });

    // Add stats if available
    if (data.stats) {
      text += `\n\nServer Distribution:\n`;
      text += `By Continent:\n`;
      Object.entries(data.stats.byContinent)
        .sort(([, a], [, b]) => b - a)
        .forEach(([continent, count]) => {
          text += `  ${continent}: ${count}\n`;
        });
    }

    return {
      content: [
        {
          type: 'text',
          text: text.trim(),
        },
      ],
    };
  }

  protected getOperationType(): OperationType {
    return OperationType.CONNECTION_INFO; // Use existing operation type for now
  }
}
