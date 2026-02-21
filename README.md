# @gagandeep023/api-gateway

Type-safe Express API gateway with IP-based rate limiting, analytics, and a real-time React dashboard.

[![npm version](https://img.shields.io/npm/v/@gagandeep023/api-gateway.svg)](https://www.npmjs.com/package/@gagandeep023/api-gateway)
[![license](https://img.shields.io/npm/l/@gagandeep023/api-gateway.svg)](https://github.com/Gagandeep023/api-gateway/blob/main/LICENSE)

## Features

- Three rate limiting algorithms: Token Bucket, Sliding Window, Fixed Window
- IP-based rate limiting and session tracking
- API key authentication with configurable tiers
- IP allowlist/blocklist filtering
- Real-time analytics with circular buffer (10k entries)
- SSE-powered React dashboard with charts
- Zero external dependencies beyond Express and React
- Full TypeScript support

## Installation

    npm install @gagandeep023/api-gateway

## Quick Start: Backend

```typescript
import express from 'express';
import { createGatewayMiddleware, createGatewayRoutes } from '@gagandeep023/api-gateway/backend';

const app = express();
app.use(express.json());

// Create gateway with default config
const gateway = createGatewayMiddleware();

// Mount management routes (bypasses rate limiting)
app.use('/api/gateway', createGatewayRoutes({
  rateLimiterService: gateway.rateLimiterService,
  analyticsService: gateway.analyticsService,
  config: gateway.config,
}));

// Apply rate limiting to all other routes
app.use('/api', gateway.middleware);

// Your routes go after the middleware
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello, world!' });
});

app.listen(3001);
```

## Quick Start: Frontend Dashboard

```tsx
import { GatewayDashboard } from '@gagandeep023/api-gateway/frontend';
import '@gagandeep023/api-gateway/frontend/styles.css';

function App() {
  return <GatewayDashboard apiBaseUrl="http://localhost:3001/api" />;
}
```

## Custom Configuration

```typescript
import { createGatewayMiddleware } from '@gagandeep023/api-gateway/backend';

const gateway = createGatewayMiddleware({
  rateLimits: {
    tiers: {
      free: { algorithm: 'tokenBucket', maxRequests: 100, windowMs: 60000, refillRate: 10 },
      pro: { algorithm: 'slidingWindow', maxRequests: 1000, windowMs: 60000 },
      unlimited: { algorithm: 'none' },
    },
    defaultTier: 'free',
    globalLimit: { maxRequests: 10000, windowMs: 60000 },
  },
  ipRules: {
    allowlist: [],
    blocklist: ['10.0.0.1'],
    mode: 'blocklist',
  },
  apiKeys: {
    keys: [
      {
        id: 'key_001',
        key: 'my_secret_key',
        name: 'My App',
        tier: 'pro',
        createdAt: new Date().toISOString(),
        active: true,
      },
    ],
  },
});
```

## API Reference

### Backend

#### `createGatewayMiddleware(config?)`

Creates the full middleware chain and returns service instances.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `config.rateLimits` | `RateLimitConfig` | No | Rate limit tiers and global limit |
| `config.ipRules` | `IpRules` | No | IP allowlist/blocklist rules |
| `config.apiKeys` | `ApiKeysConfig` | No | API keys and tiers |

**Returns:** `GatewayInstances`

| Property | Type | Description |
|----------|------|-------------|
| `middleware` | `Router` | Express router with full middleware chain |
| `rateLimiterService` | `RateLimiterService` | Rate limiter instance |
| `analyticsService` | `AnalyticsService` | Analytics instance |
| `config` | `GatewayMiddlewareConfig` | Resolved config |

#### `createGatewayRoutes(options)`

Creates Express routes for gateway management (analytics, config, key CRUD, logs).

#### Individual Middleware

- `createApiKeyAuth(getKeys)` - API key authentication
- `createIpFilter(getRules)` - IP filtering
- `createRateLimiter(service)` - Rate limiting
- `createRequestLogger(analytics)` - Request logging

### Frontend

#### `<GatewayDashboard apiBaseUrl={string} />`

React component displaying real-time gateway analytics.

**Props:**

| Prop | Type | Description |
|------|------|-------------|
| `apiBaseUrl` | `string` | Base URL of the backend API (e.g. `http://localhost:3001/api`) |

### IP-Based Tracking

All rate limiting is enforced per IP address. The dashboard shows:

- **Active IPs**: Unique IP addresses seen in the last 5 minutes
- **Active Key Sessions**: Unique (IP + API key) pairs in the last 5 minutes

### Theming the Dashboard

Override CSS custom properties to match your theme:

```css
.gw-dashboard {
  --gw-bg-card: #1a1a2e;
  --gw-accent: #00d4ff;
  --gw-text-primary: #ffffff;
}
```

## TypeScript

Full TypeScript support with exported types:

```typescript
import type {
  RateLimitConfig,
  GatewayAnalytics,
  GatewayConfig,
  RequestLog,
  ApiKey,
  IpRules,
  TierConfig,
} from '@gagandeep023/api-gateway/types';
```

## License

MIT
