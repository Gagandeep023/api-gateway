import type { RateLimitConfig, IpRules, ApiKeysConfig } from '../types';

export const DEFAULT_LOG_MAX_LINES = 10000;

export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  tiers: {
    free: { algorithm: 'tokenBucket', maxRequests: 100, windowMs: 60000, refillRate: 10 },
    pro: { algorithm: 'slidingWindow', maxRequests: 1000, windowMs: 60000 },
    unlimited: { algorithm: 'none' },
  },
  defaultTier: 'free',
  globalLimit: { maxRequests: 10000, windowMs: 60000 },
};

export const DEFAULT_IP_RULES: IpRules = {
  allowlist: [],
  blocklist: [],
  mode: 'blocklist',
};

export const DEFAULT_API_KEYS: ApiKeysConfig = {
  keys: [],
};
