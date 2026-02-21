import { Request, Response, NextFunction } from 'express';
import type { IpRules } from '../../types';

export function createIpFilter(getRules: () => IpRules) {
  return function ipFilter(req: Request, res: Response, next: NextFunction): void {
    const rules = getRules();
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

    if (rules.mode === 'allowlist' && rules.allowlist.length > 0) {
      if (!rules.allowlist.includes(clientIp)) {
        res.status(403).json({ error: 'IP not in allowlist' });
        return;
      }
    }

    if (rules.mode === 'blocklist' && rules.blocklist.length > 0) {
      if (rules.blocklist.includes(clientIp)) {
        res.status(403).json({ error: 'IP is blocked' });
        return;
      }
    }

    next();
  };
}
