import { useState, useEffect, useRef } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { GatewayAnalytics, GatewayConfig, RequestLog } from '../types';

export interface GatewayDashboardProps {
  apiBaseUrl: string;
}

interface LogsResponse {
  logs: RequestLog[];
  limit: number;
  offset: number;
}

function useGatewayApi<T>(apiBaseUrl: string, path: string): { data: T | null } {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    fetch(`${apiBaseUrl}${path}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {});
  }, [apiBaseUrl, path]);
  return { data };
}

export function GatewayDashboard({ apiBaseUrl }: GatewayDashboardProps) {
  const [analytics, setAnalytics] = useState<GatewayAnalytics | null>(null);
  const [rpmHistory, setRpmHistory] = useState<{ time: string; rpm: number }[]>([]);
  const { data: config } = useGatewayApi<GatewayConfig>(apiBaseUrl, '/gateway/config');
  const { data: logsData } = useGatewayApi<LogsResponse>(apiBaseUrl, '/gateway/logs?limit=20');
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource(`${apiBaseUrl}/gateway/analytics/live`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      const data: GatewayAnalytics = JSON.parse(event.data);
      setAnalytics(data);
      setRpmHistory(prev => {
        const next = [
          ...prev,
          { time: new Date().toLocaleTimeString(), rpm: data.requestsPerMinute },
        ];
        return next.slice(-20);
      });
    };

    return () => {
      es.close();
    };
  }, [apiBaseUrl]);

  const getMethodClass = (method: string) => {
    switch (method) {
      case 'GET': return 'gw-method-get';
      case 'POST': return 'gw-method-post';
      case 'DELETE': return 'gw-method-delete';
      default: return 'gw-method-get';
    }
  };

  const getStatusClass = (code: number) => {
    if (code === 429) return 'gw-status-rate-limit';
    if (code >= 400) return 'gw-status-error';
    return 'gw-status-ok';
  };

  return (
    <div className="gw-dashboard">
      <div className="gw-header">
        <h1>API Gateway Dashboard</h1>
        <p>Real-time monitoring for the API gateway and rate limiter</p>
        <div className="gw-status-badge">
          <span className="gw-status-dot" />
          Live
        </div>
      </div>

      {/* Stats Grid */}
      <div className="gw-stats-grid">
        <div className="gw-stat-card">
          <div className="gw-stat-label">Total Requests</div>
          <div className="gw-stat-value">{analytics?.totalRequests ?? 0}</div>
        </div>
        <div className="gw-stat-card">
          <div className="gw-stat-label">Requests / Min</div>
          <div className="gw-stat-value gw-accent">
            {analytics?.requestsPerMinute ?? 0}
          </div>
        </div>
        <div className="gw-stat-card">
          <div className="gw-stat-label">Error Rate</div>
          <div className={`gw-stat-value ${analytics && analytics.errorRate > 5 ? 'gw-danger' : ''}`}>
            {analytics?.errorRate ?? 0}%
          </div>
        </div>
        <div className="gw-stat-card">
          <div className="gw-stat-label">Avg Response Time</div>
          <div className="gw-stat-value">{analytics?.avgResponseTime ?? 0}ms</div>
        </div>
      </div>

      {/* Second Row Stats */}
      <div className="gw-stats-grid" style={{ marginBottom: 32 }}>
        <div className="gw-stat-card">
          <div className="gw-stat-label">Rate Limit Hits</div>
          <div className="gw-stat-value gw-warning">
            {analytics?.rateLimitHits ?? 0}
          </div>
        </div>
        <div className="gw-stat-card">
          <div className="gw-stat-label">Active IPs</div>
          <div className="gw-stat-value">{analytics?.activeClients ?? 0}</div>
        </div>
        <div className="gw-stat-card">
          <div className="gw-stat-label">Active Key Sessions</div>
          <div className="gw-stat-value">{analytics?.activeKeyUses ?? 0}</div>
        </div>
        <div className="gw-stat-card">
          <div className="gw-stat-label">Rate Limit Tiers</div>
          <div className="gw-stat-value">
            {config ? Object.keys(config.rateLimits.tiers).length : 0}
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="gw-charts-row">
        <div className="gw-chart-card">
          <div className="gw-chart-title">Requests Per Minute</div>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={rpmHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--gw-border, #2a2a2a)" />
              <XAxis dataKey="time" tick={{ fill: 'var(--gw-text-muted, #888)', fontSize: 11 }} />
              <YAxis tick={{ fill: 'var(--gw-text-muted, #888)', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: 'var(--gw-bg-card, #1a1a1a)', border: '1px solid var(--gw-border, #2a2a2a)', borderRadius: 8 }}
                labelStyle={{ color: 'var(--gw-text-muted, #888)' }}
              />
              <Line
                type="monotone"
                dataKey="rpm"
                stroke="var(--gw-accent, #64ffda)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: 'var(--gw-accent, #64ffda)' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="gw-chart-card">
          <div className="gw-chart-title">Top Endpoints</div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart
              data={analytics?.topEndpoints ?? []}
              layout="vertical"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--gw-border, #2a2a2a)" />
              <XAxis type="number" tick={{ fill: 'var(--gw-text-muted, #888)', fontSize: 11 }} />
              <YAxis
                dataKey="path"
                type="category"
                tick={{ fill: 'var(--gw-text-muted, #888)', fontSize: 10 }}
                width={120}
              />
              <Tooltip
                contentStyle={{ background: 'var(--gw-bg-card, #1a1a1a)', border: '1px solid var(--gw-border, #2a2a2a)', borderRadius: 8 }}
              />
              <Bar dataKey="count" fill="var(--gw-accent, #64ffda)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Logs */}
      <div className="gw-logs-section">
        <div className="gw-logs-title">Recent Requests</div>
        <table className="gw-logs-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Method</th>
              <th>Path</th>
              <th>Status</th>
              <th>Duration</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {(logsData?.logs ?? []).map((log, i) => (
              <tr key={i}>
                <td>{new Date(log.timestamp).toLocaleTimeString()}</td>
                <td>
                  <span className={`gw-method-badge ${getMethodClass(log.method)}`}>
                    {log.method}
                  </span>
                </td>
                <td>{log.path}</td>
                <td className={getStatusClass(log.statusCode)}>{log.statusCode}</td>
                <td>{log.responseTime}ms</td>
                <td>{log.ip}</td>
              </tr>
            ))}
            {(!logsData?.logs || logsData.logs.length === 0) && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--gw-text-muted, #666)' }}>
                  No requests logged yet. Make some API calls to see data here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Config Section */}
      {config && (
        <div className="gw-config-section">
          <div className="gw-config-card">
            <h3>Rate Limit Tiers</h3>
            {Object.entries(config.rateLimits.tiers).map(([name, tier]) => (
              <div key={name} className="gw-tier-item">
                <span className="gw-tier-name">{name}</span>
                <span className="gw-tier-detail">
                  {tier.algorithm === 'none'
                    ? 'unlimited'
                    : `${tier.maxRequests} req / ${(tier.windowMs || 60000) / 1000}s`}
                </span>
              </div>
            ))}
          </div>

          <div className="gw-config-card">
            <h3>IP Rules</h3>
            <div className="gw-tier-item">
              <span className="gw-tier-name">Mode</span>
              <span className="gw-tier-detail">{config.ipRules.mode}</span>
            </div>
            <div className="gw-tier-item">
              <span className="gw-tier-name">Allowlist</span>
              <span className="gw-tier-detail">
                {config.ipRules.allowlist.length === 0 ? 'empty' : config.ipRules.allowlist.length + ' IPs'}
              </span>
            </div>
            <div className="gw-tier-item">
              <span className="gw-tier-name">Blocklist</span>
              <span className="gw-tier-detail">
                {config.ipRules.blocklist.length === 0 ? 'empty' : config.ipRules.blocklist.length + ' IPs'}
              </span>
            </div>
          </div>

          <div className="gw-config-card">
            <h3>Global Limit</h3>
            <div className="gw-tier-item">
              <span className="gw-tier-name">Max Requests</span>
              <span className="gw-tier-detail">
                {config.rateLimits.globalLimit.maxRequests} / {config.rateLimits.globalLimit.windowMs / 1000}s
              </span>
            </div>
            <div className="gw-tier-item">
              <span className="gw-tier-name">Default Tier</span>
              <span className="gw-tier-detail">{config.rateLimits.defaultTier}</span>
            </div>
            <div className="gw-tier-item">
              <span className="gw-tier-name">Active Keys</span>
              <span className="gw-tier-detail">{config.activeKeys}</span>
            </div>
            <div className="gw-tier-item">
              <span className="gw-tier-name">Active Key Sessions</span>
              <span className="gw-tier-detail">{config.activeKeyUses}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
