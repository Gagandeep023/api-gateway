export interface ApiKey {
  id: string;
  key: string;
  name: string;
  tier: string;
  createdAt: string;
  active: boolean;
}

export interface ApiKeysConfig {
  keys: ApiKey[];
}

export interface TierConfig {
  algorithm: 'tokenBucket' | 'slidingWindow' | 'fixedWindow' | 'none';
  maxRequests?: number;
  windowMs?: number;
  refillRate?: number;
}

export interface RateLimitConfig {
  tiers: Record<string, TierConfig>;
  defaultTier: string;
  globalLimit: {
    maxRequests: number;
    windowMs: number;
  };
}

export interface IpRules {
  allowlist: string[];
  blocklist: string[];
  mode: 'allowlist' | 'blocklist';
}

export interface BucketState {
  tokens: number;
  lastRefill: number;
}

export interface SlidingWindowState {
  timestamps: number[];
}

export interface FixedWindowState {
  count: number;
  windowStart: number;
}

export interface RequestLog {
  timestamp: number;
  method: string;
  path: string;
  statusCode: number;
  responseTime: number;
  clientId: string;
  ip: string;
  apiKey?: string;
  authenticated: boolean;
}

export interface GatewayAnalytics {
  totalRequests: number;
  requestsPerMinute: number;
  topEndpoints: { path: string; count: number }[];
  errorRate: number;
  avgResponseTime: number;
  activeClients: number;
  activeKeyUses: number;
  rateLimitHits: number;
}

export interface GatewayConfig {
  rateLimits: RateLimitConfig;
  ipRules: IpRules;
  activeKeys: number;
  activeKeyUses: number;
}

/** Configuration for creating the gateway middleware programmatically. */
export interface GatewayMiddlewareConfig {
  rateLimits?: RateLimitConfig;
  ipRules?: IpRules;
  apiKeys?: ApiKeysConfig;
}
