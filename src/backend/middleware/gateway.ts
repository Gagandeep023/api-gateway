import { Router } from 'express';
import { RateLimiterService } from '../services/RateLimiterService';
import { AnalyticsService } from '../services/AnalyticsService';
import { DeviceRegistryService } from '../services/DeviceRegistryService';
import type { GatewayMiddlewareConfig } from '../../types';
import { DEFAULT_RATE_LIMIT_CONFIG, DEFAULT_IP_RULES, DEFAULT_API_KEYS } from '../../config/defaults';
import { createApiKeyAuth } from './apiKeyAuth';
import { createIpFilter } from './ipFilter';
import { createRateLimiter } from './rateLimiter';
import { createRequestLogger } from './requestLogger';

export interface GatewayInstances {
  rateLimiterService: RateLimiterService;
  analyticsService: AnalyticsService;
  deviceRegistry?: DeviceRegistryService;
  middleware: Router;
  config: Required<GatewayMiddlewareConfig>;
}

export function createGatewayMiddleware(userConfig?: GatewayMiddlewareConfig): GatewayInstances {
  const config: Required<GatewayMiddlewareConfig> = {
    rateLimits: userConfig?.rateLimits ?? DEFAULT_RATE_LIMIT_CONFIG,
    ipRules: userConfig?.ipRules ?? DEFAULT_IP_RULES,
    apiKeys: userConfig?.apiKeys ?? DEFAULT_API_KEYS,
    deviceRegistryPath: userConfig?.deviceRegistryPath ?? '',
  };

  const rateLimiterService = new RateLimiterService(config.rateLimits);
  const analyticsService = new AnalyticsService();

  let deviceRegistry: DeviceRegistryService | undefined;
  if (config.deviceRegistryPath) {
    deviceRegistry = new DeviceRegistryService(config.deviceRegistryPath);
  }

  const router = Router();
  router.use(createRequestLogger(analyticsService));
  router.use(createApiKeyAuth(() => config.apiKeys, deviceRegistry));
  router.use(createIpFilter(() => config.ipRules));
  router.use(createRateLimiter(rateLimiterService));

  return {
    rateLimiterService,
    analyticsService,
    deviceRegistry,
    middleware: router,
    config,
  };
}
