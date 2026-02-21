import { Request, Response, NextFunction } from 'express';
import { RateLimiterService } from '../services/RateLimiterService';

export function createRateLimiter(service: RateLimiterService) {
  return function rateLimiter(req: Request, res: Response, next: NextFunction): void {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const tier = (req as any).tier || 'free';

    const result = service.checkLimit(ip, tier);

    if (result.limit > 0) {
      res.setHeader('X-RateLimit-Limit', result.limit);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, result.remaining));
      res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetMs / 1000));
    }

    if (!result.allowed) {
      res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil(result.resetMs / 1000),
      });
      return;
    }

    next();
  };
}
