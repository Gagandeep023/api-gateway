// Backend exports
export { createGatewayMiddleware } from './backend/middleware/gateway';
export type { GatewayInstances } from './backend/middleware/gateway';
export { createGatewayRoutes } from './backend/routes/gateway';
export type { GatewayRoutesOptions } from './backend/routes/gateway';
export { RateLimiterService } from './backend/services/RateLimiterService';
export { AnalyticsService } from './backend/services/AnalyticsService';
export { createApiKeyAuth } from './backend/middleware/apiKeyAuth';
export { createIpFilter } from './backend/middleware/ipFilter';
export { createRateLimiter } from './backend/middleware/rateLimiter';
export { createRequestLogger } from './backend/middleware/requestLogger';

// Frontend exports
export { GatewayDashboard } from './frontend/GatewayDashboard';
export type { GatewayDashboardProps } from './frontend/GatewayDashboard';

// Type exports
export type {
  ApiKey,
  ApiKeysConfig,
  TierConfig,
  RateLimitConfig,
  IpRules,
  BucketState,
  SlidingWindowState,
  FixedWindowState,
  RequestLog,
  GatewayAnalytics,
  GatewayConfig,
  GatewayMiddlewareConfig,
} from './types';

// Config exports
export {
  DEFAULT_RATE_LIMIT_CONFIG,
  DEFAULT_IP_RULES,
  DEFAULT_API_KEYS,
} from './config/defaults';
