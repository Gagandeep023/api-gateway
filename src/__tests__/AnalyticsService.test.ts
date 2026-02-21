import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnalyticsService } from '../backend/services/AnalyticsService';
import type { RequestLog } from '../types';

function makeLog(overrides: Partial<RequestLog> = {}): RequestLog {
  return {
    timestamp: Date.now(),
    method: 'GET',
    path: '/api/test',
    statusCode: 200,
    responseTime: 50,
    clientId: 'key_001',
    ip: '127.0.0.1',
    ...overrides,
  };
}

describe('AnalyticsService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-21T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should add and retrieve logs', () => {
    const service = new AnalyticsService();
    service.addLog(makeLog());
    service.addLog(makeLog({ path: '/api/other' }));

    const logs = service.getRecentLogs(10);
    expect(logs).toHaveLength(2);
    // Most recent first
    expect(logs[0].path).toBe('/api/other');
  });

  it('should respect limit and offset', () => {
    const service = new AnalyticsService();
    for (let i = 0; i < 10; i++) {
      service.addLog(makeLog({ path: `/api/endpoint-${i}` }));
    }

    const page1 = service.getRecentLogs(3, 0);
    expect(page1).toHaveLength(3);

    const page2 = service.getRecentLogs(3, 3);
    expect(page2).toHaveLength(3);
    expect(page2[0].path).not.toBe(page1[0].path);
  });

  it('should compute active clients from unique IPs', () => {
    const service = new AnalyticsService();

    // Logs within last 5 minutes (now)
    service.addLog(makeLog({ ip: '10.0.0.1' }));
    service.addLog(makeLog({ ip: '10.0.0.1' })); // duplicate IP
    service.addLog(makeLog({ ip: '10.0.0.2' }));
    service.addLog(makeLog({ ip: '10.0.0.3' }));

    const analytics = service.getAnalytics(0);
    expect(analytics.activeClients).toBe(3); // 3 unique IPs
  });

  it('should not count old IPs as active clients', () => {
    const service = new AnalyticsService();

    // Log from 10 minutes ago
    service.addLog(makeLog({ ip: '10.0.0.99', timestamp: Date.now() - 600000 }));

    // Log from now
    service.addLog(makeLog({ ip: '10.0.0.1' }));

    const analytics = service.getAnalytics(0);
    expect(analytics.activeClients).toBe(1); // Only the recent IP
  });

  it('should compute active key uses from unique IP+apiKey pairs', () => {
    const service = new AnalyticsService();

    // Same IP, same key = 1 pair
    service.addLog(makeLog({ ip: '10.0.0.1', apiKey: 'key_abc' }));
    service.addLog(makeLog({ ip: '10.0.0.1', apiKey: 'key_abc' }));

    // Same IP, different key = new pair
    service.addLog(makeLog({ ip: '10.0.0.1', apiKey: 'key_def' }));

    // Different IP, same key = new pair
    service.addLog(makeLog({ ip: '10.0.0.2', apiKey: 'key_abc' }));

    // No API key = not counted
    service.addLog(makeLog({ ip: '10.0.0.3' }));

    const analytics = service.getAnalytics(0);
    expect(analytics.activeKeyUses).toBe(3);
  });

  it('should compute requests per minute', () => {
    const service = new AnalyticsService();

    // Within last minute
    service.addLog(makeLog());
    service.addLog(makeLog());

    // Old log (2 minutes ago)
    service.addLog(makeLog({ timestamp: Date.now() - 120000 }));

    const analytics = service.getAnalytics(0);
    expect(analytics.requestsPerMinute).toBe(2);
  });

  it('should compute error rate', () => {
    const service = new AnalyticsService();

    service.addLog(makeLog({ statusCode: 200 }));
    service.addLog(makeLog({ statusCode: 200 }));
    service.addLog(makeLog({ statusCode: 404 }));
    service.addLog(makeLog({ statusCode: 500 }));

    const analytics = service.getAnalytics(0);
    expect(analytics.errorRate).toBe(50); // 2 errors out of 4
  });

  it('should compute top endpoints', () => {
    const service = new AnalyticsService();

    service.addLog(makeLog({ path: '/api/a' }));
    service.addLog(makeLog({ path: '/api/a' }));
    service.addLog(makeLog({ path: '/api/a' }));
    service.addLog(makeLog({ path: '/api/b' }));
    service.addLog(makeLog({ path: '/api/b' }));

    const analytics = service.getAnalytics(0);
    expect(analytics.topEndpoints[0]).toEqual({ path: '/api/a', count: 3 });
    expect(analytics.topEndpoints[1]).toEqual({ path: '/api/b', count: 2 });
  });

  it('should compute average response time', () => {
    const service = new AnalyticsService();

    service.addLog(makeLog({ responseTime: 100 }));
    service.addLog(makeLog({ responseTime: 200 }));

    const analytics = service.getAnalytics(0);
    expect(analytics.avgResponseTime).toBe(150);
  });

  it('should handle circular buffer overflow', () => {
    const service = new AnalyticsService();

    // Add more than MAX_LOG_SIZE (10000) entries
    for (let i = 0; i < 10005; i++) {
      service.addLog(makeLog({ path: `/api/endpoint-${i}` }));
    }

    const analytics = service.getAnalytics(0);
    // Circular buffer caps at MAX_LOG_SIZE (10000)
    expect(analytics.totalRequests).toBe(10000);

    // Should still be able to get recent logs
    const logs = service.getRecentLogs(5);
    expect(logs).toHaveLength(5);
    expect(logs[0].path).toBe('/api/endpoint-10004');
  });

  it('should pass through rateLimitHits', () => {
    const service = new AnalyticsService();
    const analytics = service.getAnalytics(42);
    expect(analytics.rateLimitHits).toBe(42);
  });
});
