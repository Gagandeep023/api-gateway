import { describe, it, expect } from 'vitest';
import { RateLimiterService } from '../backend/services/RateLimiterService';
import type { RateLimitConfig } from '../types';

const testConfig: RateLimitConfig = {
  tiers: {
    free: { algorithm: 'tokenBucket', maxRequests: 5, windowMs: 60000, refillRate: 1 },
    pro: { algorithm: 'slidingWindow', maxRequests: 10, windowMs: 60000 },
    fixed: { algorithm: 'fixedWindow', maxRequests: 3, windowMs: 60000 },
    unlimited: { algorithm: 'none' },
  },
  defaultTier: 'free',
  globalLimit: { maxRequests: 100, windowMs: 60000 },
};

describe('RateLimiterService', () => {
  it('should allow requests within token bucket limit', () => {
    const service = new RateLimiterService(testConfig);
    const result = service.checkLimit('192.168.1.1', 'free');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('should rate limit by IP address', () => {
    const service = new RateLimiterService(testConfig);

    // Exhaust IP 1
    for (let i = 0; i < 5; i++) {
      service.checkLimit('10.0.0.1', 'free');
    }
    const blocked = service.checkLimit('10.0.0.1', 'free');
    expect(blocked.allowed).toBe(false);

    // Different IP should still be allowed
    const differentIp = service.checkLimit('10.0.0.2', 'free');
    expect(differentIp.allowed).toBe(true);
  });

  it('should track rate limit hits', () => {
    const service = new RateLimiterService(testConfig);
    expect(service.rateLimitHits).toBe(0);

    for (let i = 0; i < 5; i++) {
      service.checkLimit('10.0.0.3', 'free');
    }
    service.checkLimit('10.0.0.3', 'free');
    expect(service.rateLimitHits).toBe(1);
  });

  it('should handle sliding window algorithm', () => {
    const service = new RateLimiterService(testConfig);

    for (let i = 0; i < 10; i++) {
      const result = service.checkLimit('10.0.0.4', 'pro');
      expect(result.allowed).toBe(true);
    }

    const blocked = service.checkLimit('10.0.0.4', 'pro');
    expect(blocked.allowed).toBe(false);
  });

  it('should handle fixed window algorithm', () => {
    const service = new RateLimiterService(testConfig);

    for (let i = 0; i < 3; i++) {
      const result = service.checkLimit('10.0.0.5', 'fixed');
      expect(result.allowed).toBe(true);
    }

    const blocked = service.checkLimit('10.0.0.5', 'fixed');
    expect(blocked.allowed).toBe(false);
  });

  it('should allow unlimited tier without restriction', () => {
    const service = new RateLimiterService(testConfig);
    for (let i = 0; i < 50; i++) {
      const result = service.checkLimit('10.0.0.6', 'unlimited');
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(-1);
    }
  });

  it('should fall back to default tier for unknown tiers', () => {
    const service = new RateLimiterService(testConfig);
    const result = service.checkLimit('10.0.0.7', 'nonexistent');
    expect(result.allowed).toBe(true);
    // Should use 'free' tier (default), which has max 5
    expect(result.remaining).toBe(4);
  });

  it('should enforce global limit across all IPs', () => {
    const config: RateLimitConfig = {
      ...testConfig,
      globalLimit: { maxRequests: 5, windowMs: 60000 },
    };
    const service = new RateLimiterService(config);

    // Use different IPs to bypass per-client limits
    for (let i = 0; i < 5; i++) {
      const result = service.checkLimit(`192.168.0.${i}`, 'unlimited');
      expect(result.allowed).toBe(true);
    }

    // Global limit should now block
    const blocked = service.checkLimit('192.168.0.100', 'unlimited');
    expect(blocked.allowed).toBe(false);
  });

  it('should return config', () => {
    const service = new RateLimiterService(testConfig);
    expect(service.getConfig()).toEqual(testConfig);
  });
});
