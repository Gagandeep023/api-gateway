import { mkdirSync, readdirSync, appendFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { RequestLog, LogConfig, FileLogEntry } from '../../types';
import { DEFAULT_LOG_MAX_LINES } from '../../config/defaults';

function deriveLevel(statusCode: number): FileLogEntry['level'] {
  if (statusCode < 400) return 'info';
  if (statusCode < 500) return 'warn';
  if (statusCode === 503) return 'fatal';
  return 'error';
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}${min}${s}`;
}

export class FileLogWriter {
  private logDir: string;
  private appName: string;
  private maxLines: number;
  private currentDate: string;
  private currentLines = 0;
  private fileIndex = 0;
  private currentFilePath: string | null = null;
  private destroyed = false;

  constructor(config: LogConfig) {
    this.logDir = config.logDir;
    this.appName = config.appName;
    this.maxLines = config.maxLinesPerFile ?? DEFAULT_LOG_MAX_LINES;
    this.currentDate = formatDate(new Date());

    try {
      mkdirSync(this.logDir, { recursive: true });
    } catch (err) {
      process.stderr.write(`[FileLogWriter] Failed to create log directory: ${err}\n`);
    }

    this.fileIndex = this.scanExistingFiles(this.currentDate);
    this.rotateFile();
  }

  write(log: RequestLog): void {
    if (this.destroyed) return;

    const now = new Date(log.timestamp);
    const today = formatDate(now);

    // Date rollover
    if (today !== this.currentDate) {
      this.currentDate = today;
      this.fileIndex = 1;
      this.currentLines = 0;
      this.rotateFile();
    }

    // Line-limit rotation
    if (this.currentLines >= this.maxLines) {
      this.fileIndex++;
      this.currentLines = 0;
      this.rotateFile();
    }

    const entry: FileLogEntry = {
      timestamp: now.toISOString(),
      level: deriveLevel(log.statusCode),
      service: this.appName,
      method: log.method,
      path: log.path,
      statusCode: log.statusCode,
      responseTime: log.responseTime,
      requestId: randomUUID(),
      clientId: log.clientId,
      ip: log.ip,
      authenticated: log.authenticated,
    };

    try {
      appendFileSync(this.currentFilePath!, JSON.stringify(entry) + '\n');
      this.currentLines++;
    } catch (err) {
      process.stderr.write(`[FileLogWriter] Write error: ${err}\n`);
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.currentFilePath = null;
  }

  /** Scan existing log files for a date to determine the next incremental number. */
  private scanExistingFiles(date: string): number {
    try {
      const prefix = `${this.appName}_${date}_`;
      const files = readdirSync(this.logDir).filter(
        f => f.startsWith(prefix) && f.endsWith('.log'),
      );
      if (files.length === 0) return 1;

      let maxIndex = 0;
      for (const f of files) {
        // filename: {appName}_{YYYY-MM-DD}_{HHmmss}_{NNN}.log
        const parts = f.replace('.log', '').split('_');
        const idx = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(idx) && idx > maxIndex) maxIndex = idx;
      }
      return maxIndex + 1;
    } catch {
      return 1;
    }
  }

  private rotateFile(): void {
    const time = formatTime(new Date());
    const idx = String(this.fileIndex).padStart(3, '0');
    const filename = `${this.appName}_${this.currentDate}_${time}_${idx}.log`;
    this.currentFilePath = join(this.logDir, filename);
  }
}
