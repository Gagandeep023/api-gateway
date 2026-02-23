import { Request, Response, NextFunction } from 'express';
import type { ApiKeysConfig, TOTPValidator } from '../../types';
import { parseKey, validateTOTP } from '../utils/totp';
import { DeviceRegistryService } from '../services/DeviceRegistryService';

export function createApiKeyAuth(
  getKeys: () => ApiKeysConfig,
  deviceRegistry?: DeviceRegistryService,
  customTotpValidator?: TOTPValidator
) {
  return function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
    const apiKey = req.header('X-API-Key') || req.query.apiKey as string;

    if (!apiKey) {
      (req as any).clientId = req.ip || 'unknown';
      (req as any).tier = 'free';
      next();
      return;
    }

    // TOTP key: totp_<browserId>_<code>
    if (apiKey.startsWith('totp_')) {
      // Custom validator takes precedence
      if (customTotpValidator) {
        const result = customTotpValidator(apiKey);
        if (!result) {
          res.status(401).json({ error: 'Invalid or expired TOTP session' });
          return;
        }

        (req as any).clientId = result.sessionId;
        (req as any).tier = 'free';
        (req as any).apiKeyValue = apiKey;
        next();
        return;
      }

      // Fallback to built-in device registry
      if (deviceRegistry) {
        const parsed = parseKey(apiKey);
        if (!parsed) {
          res.status(401).json({ error: 'Malformed TOTP key' });
          return;
        }

        const device = deviceRegistry.getDevice(parsed.browserId);
        if (!device) {
          res.status(401).json({ error: 'Device not registered or expired' });
          return;
        }

        if (!validateTOTP(parsed.browserId, device.sharedSecret, parsed.code)) {
          res.status(401).json({ error: 'Invalid or expired TOTP code' });
          return;
        }

        // Valid TOTP - update tracking
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        deviceRegistry.updateLastSeen(parsed.browserId, ip);

        (req as any).clientId = parsed.browserId;
        (req as any).tier = 'free';
        (req as any).apiKeyValue = apiKey;
        next();
        return;
      }

      // No TOTP handler available, fall through to static key check
    }

    // Static key: gw_live_*
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
