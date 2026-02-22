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

/** Configuration for file-based log persistence. */
export interface LogConfig {
  /** Directory to write log files into. Created if missing. */
  logDir: string;
  /** Application name used as prefix in log file names. */
  appName: string;
  /** Maximum lines per log file before rotating. Defaults to 10000. */
  maxLinesPerFile?: number;
}

/** A single log entry written to disk in JSONL format, compatible with @gagandeep023/log-analyzer. */
export interface FileLogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'fatal';
  service: string;
  method: string;
  path: string;
  statusCode: number;
  responseTime: number;
  requestId: string;
  clientId: string;
  ip: string;
  authenticated: boolean;
}

/** Configuration for creating the gateway middleware programmatically. */
export interface GatewayMiddlewareConfig {
  rateLimits?: RateLimitConfig;
  ipRules?: IpRules;
  apiKeys?: ApiKeysConfig;
  /** Path to devices.json file for TOTP device registration. Omit to disable TOTP. */
  deviceRegistryPath?: string;
  /** File-based log persistence config. Omit to disable file logging. */
  logConfig?: LogConfig;
}

/** A registered browser device for TOTP authentication. */
export interface DeviceEntry {
  browserId: string;
  sharedSecret: string;
  ip: string;
  userAgent: string;
  registeredAt: string;
  expiresAt: string;
  lastSeen: string;
  lastIp: string;
  active: boolean;
}

/** On-disk format for the devices config file. */
export interface DevicesFile {
  devices: DeviceEntry[];
}
