import { Router } from 'express';
import { RateLimiterService } from '../services/RateLimiterService';
import { AnalyticsService } from '../services/AnalyticsService';
import type { GatewayMiddlewareConfig } from '../../types';
import { DEFAULT_RATE_LIMIT_CONFIG, DEFAULT_IP_RULES, DEFAULT_API_KEYS } from '../../config/defaults';
import { createApiKeyAuth } from './apiKeyAuth';
import { createIpFilter } from './ipFilter';
import { createRateLimiter } from './rateLimiter';
import { createRequestLogger } from './requestLogger';

export interface GatewayInstances {
  rateLimiterService: RateLimiterService;
  analyticsService: AnalyticsService;
  middleware: Router;
  config: Required<GatewayMiddlewareConfig>;
}

export function createGatewayMiddleware(userConfig?: GatewayMiddlewareConfig): GatewayInstances {
  const config: Required<GatewayMiddlewareConfig> = {
    rateLimits: userConfig?.rateLimits ?? DEFAULT_RATE_LIMIT_CONFIG,
    ipRules: userConfig?.ipRules ?? DEFAULT_IP_RULES,
    apiKeys: userConfig?.apiKeys ?? DEFAULT_API_KEYS,
  };

  const rateLimiterService = new RateLimiterService(config.rateLimits);
  const analyticsService = new AnalyticsService();

  const router = Router();
  router.use(createRequestLogger(analyticsService));
  router.use(createApiKeyAuth(() => config.apiKeys));
  router.use(createIpFilter(() => config.ipRules));
  router.use(createRateLimiter(rateLimiterService));

  return {
    rateLimiterService,
    analyticsService,
    middleware: router,
    config,
  };
}
