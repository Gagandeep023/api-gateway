import type { RequestLog, GatewayAnalytics } from '../../types';

const MAX_LOG_SIZE = 10000;
const ACTIVE_WINDOW_MS = 300000; // 5 minutes

export class AnalyticsService {
  private logs: RequestLog[] = [];
  private head = 0;
  private count = 0;

  addLog(log: RequestLog): void {
    if (this.count < MAX_LOG_SIZE) {
      this.logs.push(log);
      this.count++;
    } else {
      this.logs[this.head] = log;
      this.head = (this.head + 1) % MAX_LOG_SIZE;
    }
  }

  getRecentLogs(limit = 20, offset = 0): RequestLog[] {
    const ordered = this.getOrderedLogs();
    return ordered.slice(offset, offset + limit);
  }

  getAnalytics(rateLimitHits: number): GatewayAnalytics {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const activeWindowStart = now - ACTIVE_WINDOW_MS;
    const ordered = this.getOrderedLogs();

    const recentLogs = ordered.filter(l => l.timestamp > oneMinuteAgo);
    const requestsPerMinute = recentLogs.length;

    // Top endpoints
    const endpointCounts = new Map<string, number>();
    for (const log of ordered) {
      const current = endpointCounts.get(log.path) || 0;
      endpointCounts.set(log.path, current + 1);
    }
    const topEndpoints = Array.from(endpointCounts.entries())
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Error rate
    const errorCount = ordered.filter(l => l.statusCode >= 400).length;
    const errorRate = this.count > 0 ? (errorCount / this.count) * 100 : 0;

    // Average response time
    const totalResponseTime = ordered.reduce((sum, l) => sum + l.responseTime, 0);
    const avgResponseTime = this.count > 0 ? totalResponseTime / this.count : 0;

    // Active clients: unique IPs in last 5 minutes
    const activeLogs = ordered.filter(l => l.timestamp > activeWindowStart);
    const uniqueIps = new Set(activeLogs.map(l => l.ip));

    // Active key uses: unique (IP + apiKey) pairs in last 5 minutes
    const keyUsePairs = new Set<string>();
    for (const log of activeLogs) {
      if (log.apiKey) {
        keyUsePairs.add(`${log.ip}::${log.apiKey}`);
      }
    }

    return {
      totalRequests: this.count,
      requestsPerMinute,
      topEndpoints,
      errorRate: Math.round(errorRate * 100) / 100,
      avgResponseTime: Math.round(avgResponseTime * 100) / 100,
      activeClients: uniqueIps.size,
      activeKeyUses: keyUsePairs.size,
      rateLimitHits,
    };
  }

  private getOrderedLogs(): RequestLog[] {
    if (this.count < MAX_LOG_SIZE) {
      return [...this.logs].reverse();
    }
    const tail = this.logs.slice(0, this.head);
    const headPart = this.logs.slice(this.head);
    return [...headPart, ...tail].reverse();
  }
}
