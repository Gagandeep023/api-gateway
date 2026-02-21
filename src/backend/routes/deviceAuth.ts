import { Router, Request, Response } from 'express';
import { DeviceRegistryService } from '../services/DeviceRegistryService';

export interface DeviceAuthRoutesOptions {
  deviceRegistry: DeviceRegistryService;
}

export function createDeviceAuthRoutes(options: DeviceAuthRoutesOptions): Router {
  const { deviceRegistry } = options;
  const router = Router();

  // POST /register - Register a browser device
  router.post('/register', (req: Request, res: Response) => {
    const { browserId } = req.body;

    if (!browserId || typeof browserId !== 'string') {
      res.status(400).json({ error: 'browserId is required' });
      return;
    }

    // Basic UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(browserId)) {
      res.status(400).json({ error: 'browserId must be a valid UUID' });
      return;
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    const result = deviceRegistry.registerDevice(browserId, ip, userAgent);

    if (!result.success) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.status(201).json({
      browserId: result.device.browserId,
      sharedSecret: result.device.sharedSecret,
      expiresAt: result.device.expiresAt,
    });
  });

  // GET /status/:browserId - Check device registration status
  router.get('/status/:browserId', (req: Request, res: Response) => {
    const browserId = req.params.browserId as string;
    const device = deviceRegistry.getDevice(browserId);

    if (!device) {
      res.status(404).json({ registered: false });
      return;
    }

    res.json({
      registered: true,
      browserId: device.browserId,
      expiresAt: device.expiresAt,
      registeredAt: device.registeredAt,
    });
  });

  // DELETE /:browserId - Revoke a device (admin)
  router.delete('/:browserId', (req: Request, res: Response) => {
    const browserId = req.params.browserId as string;
    const revoked = deviceRegistry.revokeDevice(browserId);

    if (!revoked) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    res.json({ message: 'Device revoked', browserId });
  });

  // GET /stats - Device registry stats
  router.get('/stats', (_req: Request, res: Response) => {
    res.json(deviceRegistry.getStats());
  });

  return router;
}
