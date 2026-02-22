// Backend exports
export { createGatewayMiddleware } from './backend/middleware/gateway';
export type { GatewayInstances } from './backend/middleware/gateway';
export { createGatewayRoutes } from './backend/routes/gateway';
export type { GatewayRoutesOptions } from './backend/routes/gateway';
export { createDeviceAuthRoutes } from './backend/routes/deviceAuth';
export type { DeviceAuthRoutesOptions } from './backend/routes/deviceAuth';
export { DeviceRegistryService } from './backend/services/DeviceRegistryService';
export { RateLimiterService } from './backend/services/RateLimiterService';
export { AnalyticsService } from './backend/services/AnalyticsService';
export { FileLogWriter } from './backend/services/FileLogWriter';
export { createApiKeyAuth } from './backend/middleware/apiKeyAuth';
export { createIpFilter } from './backend/middleware/ipFilter';
export { createRateLimiter } from './backend/middleware/rateLimiter';
export { createRequestLogger } from './backend/middleware/requestLogger';
export { generateTOTP, validateTOTP, formatKey, parseKey, generateSecret } from './backend/utils/totp';

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
  LogConfig,
  FileLogEntry,
  DeviceEntry,
  DevicesFile,
} from './types';

// Config exports
export {
  DEFAULT_RATE_LIMIT_CONFIG,
  DEFAULT_IP_RULES,
  DEFAULT_API_KEYS,
  DEFAULT_LOG_MAX_LINES,
} from './config/defaults';
