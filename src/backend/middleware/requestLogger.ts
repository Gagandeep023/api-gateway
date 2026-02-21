import { Request, Response, NextFunction } from 'express';
import { AnalyticsService } from '../services/AnalyticsService';

export function createRequestLogger(analytics: AnalyticsService) {
  return function requestLogger(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();

    res.on('finish', () => {
      const responseTime = Date.now() - start;
      analytics.addLog({
        timestamp: Date.now(),
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        responseTime,
        clientId: (req as any).clientId || req.ip || 'unknown',
        ip: req.ip || req.socket.remoteAddress || 'unknown',
        apiKey: (req as any).apiKeyValue || undefined,
      });
    });

    next();
  };
}
