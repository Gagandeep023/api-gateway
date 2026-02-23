import { Router, Request, Response } from 'express';
import { RateLimiterService } from '../services/RateLimiterService';
import { AnalyticsService } from '../services/AnalyticsService';
import type { GatewayMiddlewareConfig } from '../../types';
import crypto from 'crypto';

type OptionalConfigKeys = 'logConfig' | 'validateTOTP';
type ResolvedConfig = Required<Omit<GatewayMiddlewareConfig, OptionalConfigKeys>> & Pick<GatewayMiddlewareConfig, OptionalConfigKeys>;

export interface GatewayRoutesOptions {
  rateLimiterService: RateLimiterService;
  analyticsService: AnalyticsService;
  config: ResolvedConfig;
}

export function createGatewayRoutes(options: GatewayRoutesOptions): Router {
  const { rateLimiterService, analyticsService, config } = options;
  const router = Router();

  // GET /analytics - Returns current analytics snapshot
  router.get('/analytics', (_req: Request, res: Response) => {
    const analytics = analyticsService.getAnalytics(rateLimiterService.rateLimitHits);
    res.json(analytics);
  });

  // GET /analytics/live - SSE stream pushing analytics every 5 seconds
  router.get('/analytics/live', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (): void => {
      const analytics = analyticsService.getAnalytics(rateLimiterService.rateLimitHits);
      res.write(`data: ${JSON.stringify(analytics)}\n\n`);
    };

    send();
    const interval = setInterval(send, 5000);

    _req.on('close', () => {
      clearInterval(interval);
    });
  });

  // GET /config - Returns current gateway config
  router.get('/config', (_req: Request, res: Response) => {
    const analytics = analyticsService.getAnalytics(rateLimiterService.rateLimitHits);
    res.json({
      rateLimits: config.rateLimits,
      ipRules: config.ipRules,
      activeKeys: config.apiKeys.keys.filter(k => k.active).length,
      activeKeyUses: analytics.activeKeyUses,
    });
  });

  // POST /keys - Create a new API key
  router.post('/keys', (req: Request, res: Response) => {
    const { name, tier } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const newKey = {
      id: `key_${String(config.apiKeys.keys.length + 1).padStart(3, '0')}`,
      key: `gw_live_${crypto.randomBytes(16).toString('hex')}`,
      name,
      tier: tier || 'free',
      createdAt: new Date().toISOString(),
      active: true,
    };

    config.apiKeys.keys.push(newKey);
    res.status(201).json(newKey);
  });

  // DELETE /keys/:keyId - Revoke an API key
  router.delete('/keys/:keyId', (req: Request, res: Response) => {
    const { keyId } = req.params;
    const key = config.apiKeys.keys.find(k => k.id === keyId);

    if (!key) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }

    key.active = false;
    res.json({ message: 'API key revoked', id: keyId });
  });

  // GET /logs - Returns recent request logs (paginated)
  router.get('/logs', (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    const logs = analyticsService.getRecentLogs(limit, offset);
    res.json({ logs, limit, offset });
  });

  return router;
}
