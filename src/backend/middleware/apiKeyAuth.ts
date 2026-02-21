import { Request, Response, NextFunction } from 'express';
import type { ApiKeysConfig } from '../../types';

export function createApiKeyAuth(getKeys: () => ApiKeysConfig) {
  return function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
    const apiKey = req.header('X-API-Key') || req.query.apiKey as string;

    if (!apiKey) {
      (req as any).clientId = req.ip || 'unknown';
      (req as any).tier = 'free';
      next();
      return;
    }

    const config = getKeys();
    const keyEntry = config.keys.find(k => k.key === apiKey && k.active);

    if (!keyEntry) {
      res.status(401).json({ error: 'Invalid or revoked API key' });
      return;
    }

    (req as any).clientId = keyEntry.id;
    (req as any).tier = keyEntry.tier;
    (req as any).apiKeyValue = keyEntry.key;
    next();
  };
}
