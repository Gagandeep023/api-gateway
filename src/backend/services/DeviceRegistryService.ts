import fs from 'fs';
import path from 'path';
import { generateSecret } from '../utils/totp';
import type { DeviceEntry, DevicesFile } from '../../types';

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const DEBOUNCE_WRITE_MS = 2000;
const MAX_REGISTRATIONS_PER_IP_PER_MIN = 10;
const MAX_REGISTRATIONS_PER_IP_TOTAL = 30;
const RATE_WINDOW_MS = 60 * 1000; // 1 minute

export class DeviceRegistryService {
  private devices: Map<string, DeviceEntry> = new Map();
  private filePath: string;
  private writeTimeout: ReturnType<typeof setTimeout> | null = null;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  // In-memory rate tracking: ip -> timestamps of recent registration attempts
  private registrationAttempts: Map<string, number[]> = new Map();

  constructor(filePath: string) {
    this.filePath = filePath;
    this.loadFromDisk();
    this.cleanupExpired();
    this.cleanupInterval = setInterval(() => this.cleanupExpired(), CLEANUP_INTERVAL_MS);
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const data: DevicesFile = JSON.parse(raw);
        for (const device of data.devices) {
          this.devices.set(device.browserId, device);
        }
        console.log(`[DeviceRegistry] Loaded ${this.devices.size} devices from ${this.filePath}`);
      } else {
        // Create the directory and empty file
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        this.saveToDiskSync();
        console.log(`[DeviceRegistry] Created new devices file at ${this.filePath}`);
      }
    } catch (err) {
      console.error('[DeviceRegistry] Failed to load devices file:', err);
    }
  }

  private saveToDiskSync(): void {
    const data: DevicesFile = {
      devices: Array.from(this.devices.values()),
    };
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  private debouncedSave(): void {
    if (this.writeTimeout) clearTimeout(this.writeTimeout);
    this.writeTimeout = setTimeout(() => {
      this.saveToDiskSync();
    }, DEBOUNCE_WRITE_MS);
  }

  private cleanupExpired(): void {
    const now = Date.now();
    let removed = 0;
    for (const [id, device] of this.devices) {
      if (new Date(device.expiresAt).getTime() <= now) {
        this.devices.delete(id);
        removed++;
      }
    }
    if (removed > 0) {
      console.log(`[DeviceRegistry] Cleaned up ${removed} expired devices`);
      this.debouncedSave();
    }
  }

  private getActiveCountByIp(ip: string): number {
    const now = Date.now();
    let count = 0;
    for (const device of this.devices.values()) {
      if (device.ip === ip && device.active && new Date(device.expiresAt).getTime() > now) {
        count++;
      }
    }
    return count;
  }

  private checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const attempts = this.registrationAttempts.get(ip) || [];
    // Remove attempts older than the rate window
    const recent = attempts.filter(t => now - t < RATE_WINDOW_MS);
    this.registrationAttempts.set(ip, recent);
    return recent.length < MAX_REGISTRATIONS_PER_IP_PER_MIN;
  }

  private recordAttempt(ip: string): void {
    const attempts = this.registrationAttempts.get(ip) || [];
    attempts.push(Date.now());
    this.registrationAttempts.set(ip, attempts);
  }

  registerDevice(
    browserId: string,
    ip: string,
    userAgent: string
  ): { success: true; device: DeviceEntry } | { success: false; error: string; status: number } {
    // Check rate limit: 10 per IP per minute
    if (!this.checkRateLimit(ip)) {
      return {
        success: false,
        error: 'Registration rate limit exceeded. Max 10 per minute per IP.',
        status: 429,
      };
    }

    this.recordAttempt(ip);

    // Check total cap: 30 active devices per IP
    if (this.getActiveCountByIp(ip) >= MAX_REGISTRATIONS_PER_IP_TOTAL) {
      return {
        success: false,
        error: 'Maximum device registrations reached for this IP. Max 30 per IP.',
        status: 403,
      };
    }

    // Check if this browserId is already registered and still valid
    const existing = this.devices.get(browserId);
    if (existing && existing.active && new Date(existing.expiresAt).getTime() > Date.now()) {
      // Re-registration: return existing secret, refresh expiry
      existing.expiresAt = new Date(Date.now() + ONE_WEEK_MS).toISOString();
      existing.lastSeen = new Date().toISOString();
      existing.lastIp = ip;
      this.debouncedSave();
      return { success: true, device: existing };
    }

    const now = new Date();
    const device: DeviceEntry = {
      browserId,
      sharedSecret: generateSecret(),
      ip,
      userAgent,
      registeredAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ONE_WEEK_MS).toISOString(),
      lastSeen: now.toISOString(),
      lastIp: ip,
      active: true,
    };

    this.devices.set(browserId, device);
    this.debouncedSave();
    return { success: true, device };
  }

  getDevice(browserId: string): DeviceEntry | null {
    const device = this.devices.get(browserId) || null;
    if (!device) return null;

    // Check expiry
    if (new Date(device.expiresAt).getTime() <= Date.now()) {
      this.devices.delete(browserId);
      this.debouncedSave();
      return null;
    }

    if (!device.active) return null;
    return device;
  }

  updateLastSeen(browserId: string, ip: string): void {
    const device = this.devices.get(browserId);
    if (!device) return;
    device.lastSeen = new Date().toISOString();
    if (device.lastIp !== ip) {
      console.log(`[DeviceRegistry] IP change for ${browserId}: ${device.lastIp} -> ${ip}`);
      device.lastIp = ip;
    }
    this.debouncedSave();
  }

  revokeDevice(browserId: string): boolean {
    const device = this.devices.get(browserId);
    if (!device) return false;
    device.active = false;
    this.debouncedSave();
    return true;
  }

  getStats(): { total: number; active: number; expired: number } {
    const now = Date.now();
    let active = 0;
    let expired = 0;
    for (const device of this.devices.values()) {
      if (!device.active || new Date(device.expiresAt).getTime() <= now) {
        expired++;
      } else {
        active++;
      }
    }
    return { total: this.devices.size, active, expired };
  }

  destroy(): void {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    if (this.writeTimeout) {
      clearTimeout(this.writeTimeout);
      this.saveToDiskSync(); // Final save
    }
  }
}
