import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { FileLogWriter } from '../backend/services/FileLogWriter';
import type { RequestLog, FileLogEntry } from '../types';

function makeLog(overrides: Partial<RequestLog> = {}): RequestLog {
  return {
    timestamp: Date.now(),
    method: 'GET',
    path: '/api/test',
    statusCode: 200,
    responseTime: 50,
    clientId: 'key_001',
    ip: '127.0.0.1',
    authenticated: false,
    ...overrides,
  };
}

describe('FileLogWriter', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'filelogwriter-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should create the log directory and write a log file', () => {
    const logDir = join(tempDir, 'logs');
    const writer = new FileLogWriter({ logDir, appName: 'test-app' });

    writer.write(makeLog());
    writer.destroy();

    const files = readdirSync(logDir).filter(f => f.endsWith('.log'));
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^test-app_\d{4}-\d{2}-\d{2}_\d{6}_001\.log$/);
  });

  it('should write valid JSONL entries', () => {
    const writer = new FileLogWriter({ logDir: tempDir, appName: 'test-app' });

    writer.write(makeLog({ method: 'POST', path: '/api/users', statusCode: 201 }));
    writer.write(makeLog({ method: 'GET', path: '/api/health', statusCode: 200 }));
    writer.destroy();

    const files = readdirSync(tempDir).filter(f => f.endsWith('.log'));
    const content = readFileSync(join(tempDir, files[0]), 'utf-8').trim();
    const lines = content.split('\n');

    expect(lines.length).toBe(2);

    const entry1: FileLogEntry = JSON.parse(lines[0]);
    expect(entry1.method).toBe('POST');
    expect(entry1.path).toBe('/api/users');
    expect(entry1.statusCode).toBe(201);
    expect(entry1.service).toBe('test-app');
    expect(entry1.level).toBe('info');
    expect(entry1.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(entry1.timestamp).toBeTruthy();

    const entry2: FileLogEntry = JSON.parse(lines[1]);
    expect(entry2.method).toBe('GET');
    expect(entry2.path).toBe('/api/health');
  });

  it('should rotate files when max lines is reached', () => {
    const writer = new FileLogWriter({
      logDir: tempDir,
      appName: 'test-app',
      maxLinesPerFile: 3,
    });

    for (let i = 0; i < 7; i++) {
      writer.write(makeLog({ path: `/api/endpoint-${i}` }));
    }
    writer.destroy();

    const files = readdirSync(tempDir)
      .filter(f => f.endsWith('.log'))
      .sort();

    // 3 + 3 + 1 = 7 lines across 3 files
    expect(files.length).toBe(3);

    // First file should have 3 lines
    const content1 = readFileSync(join(tempDir, files[0]), 'utf-8').trim();
    expect(content1.split('\n').length).toBe(3);

    // Second file should have 3 lines
    const content2 = readFileSync(join(tempDir, files[1]), 'utf-8').trim();
    expect(content2.split('\n').length).toBe(3);

    // Third file should have 1 line
    const content3 = readFileSync(join(tempDir, files[2]), 'utf-8').trim();
    expect(content3.split('\n').length).toBe(1);
  });

  it('should use incremental numbering (001, 002, 003)', () => {
    const writer = new FileLogWriter({
      logDir: tempDir,
      appName: 'test-app',
      maxLinesPerFile: 2,
    });

    for (let i = 0; i < 5; i++) {
      writer.write(makeLog());
    }
    writer.destroy();

    const files = readdirSync(tempDir)
      .filter(f => f.endsWith('.log'))
      .sort();

    expect(files[0]).toContain('_001.log');
    expect(files[1]).toContain('_002.log');
    expect(files[2]).toContain('_003.log');
  });

  it('should derive log levels correctly', () => {
    const writer = new FileLogWriter({ logDir: tempDir, appName: 'test-app' });

    writer.write(makeLog({ statusCode: 200 }));
    writer.write(makeLog({ statusCode: 301 }));
    writer.write(makeLog({ statusCode: 404 }));
    writer.write(makeLog({ statusCode: 500 }));
    writer.write(makeLog({ statusCode: 503 }));
    writer.destroy();

    const files = readdirSync(tempDir).filter(f => f.endsWith('.log'));
    const lines = readFileSync(join(tempDir, files[0]), 'utf-8').trim().split('\n');

    expect(JSON.parse(lines[0]).level).toBe('info');  // 200
    expect(JSON.parse(lines[1]).level).toBe('info');  // 301
    expect(JSON.parse(lines[2]).level).toBe('warn');  // 404
    expect(JSON.parse(lines[3]).level).toBe('error'); // 500
    expect(JSON.parse(lines[4]).level).toBe('fatal'); // 503
  });

  it('should handle destroy gracefully', () => {
    const writer = new FileLogWriter({ logDir: tempDir, appName: 'test-app' });
    writer.write(makeLog());

    // Should not throw
    writer.destroy();
    writer.destroy(); // double destroy should be safe
  });

  it('should scan existing files and continue numbering', () => {
    // Create first writer that writes some logs
    const writer1 = new FileLogWriter({
      logDir: tempDir,
      appName: 'test-app',
      maxLinesPerFile: 2,
    });
    writer1.write(makeLog());
    writer1.write(makeLog());
    writer1.write(makeLog()); // triggers rotation to file 002
    writer1.destroy();

    // Create a second writer - it should pick up from the next index
    const writer2 = new FileLogWriter({
      logDir: tempDir,
      appName: 'test-app',
      maxLinesPerFile: 2,
    });
    writer2.write(makeLog());
    writer2.destroy();

    const files = readdirSync(tempDir)
      .filter(f => f.endsWith('.log'))
      .sort();

    // Should have files 001, 002, and 003
    expect(files.length).toBe(3);
    expect(files[2]).toContain('_003.log');
  });
});
