import type { BucketState, SlidingWindowState, FixedWindowState, TierConfig, RateLimitConfig } from '../../types';

class TokenBucket {
  private buckets = new Map<string, BucketState>();

  tryConsume(ip: string, maxTokens: number, refillRate: number): { allowed: boolean; remaining: number; resetMs: number } {
    const now = Date.now();
    let bucket = this.buckets.get(ip);

    if (!bucket) {
      bucket = { tokens: maxTokens, lastRefill: now };
      this.buckets.set(ip, bucket);
    }

    const elapsed = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(maxTokens, bucket.tokens + elapsed * refillRate);
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      const resetMs = bucket.tokens <= 0 ? Math.ceil((1 / refillRate) * 1000) : 0;
      return { allowed: true, remaining: Math.floor(bucket.tokens), resetMs };
    }

    const resetMs = Math.ceil(((1 - bucket.tokens) / refillRate) * 1000);
    return { allowed: false, remaining: 0, resetMs };
  }
}

class SlidingWindowLog {
  private windows = new Map<string, SlidingWindowState>();

  tryConsume(ip: string, maxRequests: number, windowMs: number): { allowed: boolean; remaining: number; resetMs: number } {
    const now = Date.now();
    let state = this.windows.get(ip);

    if (!state) {
      state = { timestamps: [] };
      this.windows.set(ip, state);
    }

    state.timestamps = state.timestamps.filter(t => now - t < windowMs);

    if (state.timestamps.length < maxRequests) {
      state.timestamps.push(now);
      return {
        allowed: true,
        remaining: maxRequests - state.timestamps.length,
        resetMs: state.timestamps.length > 0 ? windowMs - (now - state.timestamps[0]) : windowMs,
      };
    }

    const oldestInWindow = state.timestamps[0];
    const resetMs = windowMs - (now - oldestInWindow);
    return { allowed: false, remaining: 0, resetMs };
  }
}

class FixedWindowCounter {
  private windows = new Map<string, FixedWindowState>();

  tryConsume(ip: string, maxRequests: number, windowMs: number): { allowed: boolean; remaining: number; resetMs: number } {
    const now = Date.now();
    let state = this.windows.get(ip);

    if (!state || now - state.windowStart >= windowMs) {
      state = { count: 0, windowStart: now };
      this.windows.set(ip, state);
    }

    const resetMs = windowMs - (now - state.windowStart);

    if (state.count < maxRequests) {
      state.count++;
      return { allowed: true, remaining: maxRequests - state.count, resetMs };
    }

    return { allowed: false, remaining: 0, resetMs };
  }
}

export class RateLimiterService {
  private tokenBucket = new TokenBucket();
  private slidingWindow = new SlidingWindowLog();
  private fixedWindow = new FixedWindowCounter();
  private globalWindow = new FixedWindowCounter();
  private config: RateLimitConfig;
  private _rateLimitHits = 0;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  get rateLimitHits(): number {
    return this._rateLimitHits;
  }

  checkLimit(ip: string, tier: string): { allowed: boolean; remaining: number; resetMs: number; limit: number } {
    const globalResult = this.globalWindow.tryConsume(
      '__global__',
      this.config.globalLimit.maxRequests,
      this.config.globalLimit.windowMs
    );

    if (!globalResult.allowed) {
      this._rateLimitHits++;
      return { allowed: false, remaining: 0, resetMs: globalResult.resetMs, limit: this.config.globalLimit.maxRequests };
    }

    const tierConfig = this.config.tiers[tier] || this.config.tiers[this.config.defaultTier];

    if (!tierConfig || tierConfig.algorithm === 'none') {
      return { allowed: true, remaining: -1, resetMs: 0, limit: -1 };
    }

    let result: { allowed: boolean; remaining: number; resetMs: number };

    switch (tierConfig.algorithm) {
      case 'tokenBucket':
        result = this.tokenBucket.tryConsume(
          ip,
          tierConfig.maxRequests!,
          tierConfig.refillRate || 1
        );
        break;
      case 'slidingWindow':
        result = this.slidingWindow.tryConsume(
          ip,
          tierConfig.maxRequests!,
          tierConfig.windowMs!
        );
        break;
      case 'fixedWindow':
        result = this.fixedWindow.tryConsume(
          ip,
          tierConfig.maxRequests!,
          tierConfig.windowMs!
        );
        break;
      default:
        return { allowed: true, remaining: -1, resetMs: 0, limit: -1 };
    }

    if (!result.allowed) {
      this._rateLimitHits++;
    }

    return { ...result, limit: tierConfig.maxRequests! };
  }

  getConfig(): RateLimitConfig {
    return this.config;
  }
}
