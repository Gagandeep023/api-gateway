# @gagandeep023/api-gateway - Complete Guide

A type-safe Express API gateway with IP-based rate limiting, real-time analytics, device authentication, and a React dashboard. No database required.

- **npm**: `npm install @gagandeep023/api-gateway`
- **GitHub**: [github.com/Gagandeep023/api-gateway](https://github.com/Gagandeep023/api-gateway)
- **npm page**: [npmjs.com/package/@gagandeep023/api-gateway](https://www.npmjs.com/package/@gagandeep023/api-gateway)

## Table of Contents

- [Why This Package](#why-this-package)
- [Setup Guide](#setup-guide)
  - [Installation](#installation)
  - [Backend Setup](#backend-setup)
  - [Frontend Dashboard](#frontend-dashboard)
  - [Custom Configuration](#custom-configuration)
  - [Device Authentication (TOTP)](#device-authentication-totp)
- [Architecture](#architecture)
- [Rate Limiting Algorithms](#rate-limiting-algorithms)
- [Technical Challenges](#technical-challenges)
- [Learnings](#learnings)
- [API Reference](#api-reference)
- [Theming](#theming)
- [TypeScript Support](#typescript-support)
- [Contributing](#contributing)

## Why This Package

Most rate limiting solutions require Redis, Memcached, or some external store. That is the right call for horizontally scaled production systems. But many Express apps run as a single process, where external dependencies add operational complexity without proportional benefit.

This package gives you:

- **Three rate limiting algorithms** (Token Bucket, Sliding Window, Fixed Window) with configurable tiers, so you can pick the right algorithm for each use case instead of settling for one.
- **Zero external dependencies** beyond Express. Rate limit state, analytics, and device registry all run in-memory. No Redis, no database, no cache layer to manage.
- **A real-time dashboard** out of the box. SSE-powered analytics with request charts, error rates, and API key management. Drop in a React component and you have a monitoring panel.
- **Device-level TOTP authentication** for browser-based access control without manual API key entry.
- **Full TypeScript support** with exported types, subpath exports, and strict type checking.

**Use this if:**
- You run a single-instance Express app and want rate limiting without Redis
- You want a drop-in monitoring dashboard for your API
- You are learning system design and want to see real implementations of rate limiting algorithms
- You need configurable per-tier rate limits with different algorithms per tier
- You want device-based auth without a full OAuth setup

**Do not use this if:**
- You run multiple server instances behind a load balancer (rate limit state is per-process)
- You need persistent analytics that survive server restarts
- You need sub-millisecond rate limiting at massive scale (use Redis + Lua scripts)

## Setup Guide

### Installation

```bash
npm install @gagandeep023/api-gateway
```

**Peer dependencies** (install the ones you need):

```bash
# Required for backend
npm install express

# Required for frontend dashboard
npm install react react-dom recharts
```

**TypeScript requirement**: Your `tsconfig.json` must use `module: "Node16"` or `"NodeNext"` for subpath exports to resolve correctly.

```json
{
  "compilerOptions": {
    "module": "Node16",
    "moduleResolution": "Node16"
  }
}
```

### Backend Setup

Minimal setup with default configuration:

```typescript
import express from 'express';
import { createGatewayMiddleware, createGatewayRoutes } from '@gagandeep023/api-gateway/backend';

const app = express();
app.use(express.json());

// Create gateway with defaults (free tier: 100 req/min token bucket)
const gateway = createGatewayMiddleware();

// Mount management routes FIRST (bypasses rate limiting)
app.use('/api/gateway', createGatewayRoutes({
  rateLimiterService: gateway.rateLimiterService,
  analyticsService: gateway.analyticsService,
  config: gateway.config,
}));

// Apply rate limiting to all /api routes
app.use('/api', gateway.middleware);

// Your routes go after the middleware
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello, world!' });
});

app.listen(3001, () => {
  console.log('Server running on port 3001');
});
```

The management routes (`/api/gateway/*`) are mounted before the middleware intentionally. If the rate limiter blocked the analytics endpoint, the dashboard would become unusable during a rate limit storm.

### Frontend Dashboard

```tsx
import { GatewayDashboard } from '@gagandeep023/api-gateway/frontend';
import '@gagandeep023/api-gateway/frontend/styles.css';

function App() {
  return (
    <GatewayDashboard
      apiBaseUrl="http://localhost:3001/api"
      apiKey="optional-api-key"
    />
  );
}
```

The dashboard connects via SSE for live updates every 5 seconds. It shows:
- Requests per minute (line chart, last 20 data points)
- Top endpoints (bar chart)
- Stats grid: total requests, RPM, error rate, response time, rate limit hits, active IPs, key sessions
- Recent requests table (paginated, 20 per page)
- API key management: create, revoke, copy keys
- Gateway configuration display

### Custom Configuration

```typescript
const gateway = createGatewayMiddleware({
  rateLimits: {
    tiers: {
      // Token Bucket: smooth, burst-friendly
      free: {
        algorithm: 'tokenBucket',
        maxRequests: 100,
        windowMs: 60000,
        refillRate: 10,
      },
      // Sliding Window: accurate, no boundary exploits
      pro: {
        algorithm: 'slidingWindow',
        maxRequests: 1000,
        windowMs: 60000,
      },
      // No rate limiting
      unlimited: {
        algorithm: 'none',
      },
    },
    defaultTier: 'free',
    globalLimit: {
      maxRequests: 10000,
      windowMs: 60000,
    },
  },
  ipRules: {
    allowlist: [],
    blocklist: ['10.0.0.1', '192.168.1.100'],
    mode: 'blocklist', // or 'allowlist'
  },
  apiKeys: {
    keys: [
      {
        id: 'key_001',
        key: 'gw_live_your_secret_key',
        name: 'Production App',
        tier: 'pro',
        createdAt: new Date().toISOString(),
        active: true,
      },
    ],
  },
});
```

### Device Authentication (TOTP)

Enable browser-level authentication without manual API key entry:

```typescript
import { createGatewayMiddleware, createGatewayRoutes, createDeviceAuthRoutes } from '@gagandeep023/api-gateway/backend';

// Mount device auth routes
app.use('/api/auth', createDeviceAuthRoutes({
  rateLimiterService: gateway.rateLimiterService,
}));
```

**How it works:**

1. Browser generates a UUID (`browserId`) and sends `POST /api/auth/register`
2. Server stores the device and returns a shared secret
3. Browser computes TOTP codes using HMAC-SHA256 with 1-hour windows
4. Requests include `X-API-Key: totp_<browserId>_<code>`
5. Server validates the code against current and previous window (clock skew tolerance)

**Security features:**
- Timing-safe comparison (crypto.timingSafeEqual) prevents timing attacks
- Registration rate limiting: 10 per minute per IP, max 30 per IP total
- Automatic device expiration after 1 week
- Debounced file persistence (2-second batching)

## Architecture

### Middleware Pipeline

Every request passes through four stages sequentially. Each stage can short-circuit with an HTTP error.

```
Request --> [Logger] --> [API Key Auth] --> [IP Filter] --> [Rate Limiter] --> Route Handler
              |              |                  |                |
              |             401               403              429
              |          (bad key)         (blocked IP)    (limit hit)
              |
              v
         [res.finish callback] --> Analytics circular buffer
```

**Why this order matters:**
1. **Logger first**: Every request is captured, including rejected ones
2. **Auth second**: Rate limiter needs client identity and tier
3. **IP filter third**: Reject blocked IPs before consuming rate limit tokens
4. **Rate limiter last**: Needs all context from prior stages

### State Architecture

```
IN-MEMORY (ephemeral)                CONFIGURABLE
+----------------------------+       +----------------------------+
| Rate Limiter State         |       | Tier definitions           |
|   Per-IP token counts      |       | Algorithm per tier         |
|   Sliding window logs      |       | Global limit settings      |
|   Fixed window counters    |       | API keys + tiers           |
|                            |       | IP allowlist/blocklist     |
| Analytics Circular Buffer  |       +----------------------------+
|   10,000 entries max       |
|   ~2 MB memory cap         |       FILE-BASED (persistent)
|                            |       +----------------------------+
| Device Registry            |       | devices.json               |
|   Active browser devices   |       |   Debounced writes (2s)    |
+----------------------------+       +----------------------------+
```

Rate limit state resets on server restart. This is by design: a restart gives every client a fresh allowance.

## Rate Limiting Algorithms

### Token Bucket (recommended for most use cases)

- Tokens refill at a constant rate; each request consumes one token
- Allows controlled bursts up to bucket capacity
- O(1) memory per client (16 bytes: tokens + lastRefill)
- Lazy evaluation: zero CPU between requests
- Used by: AWS API Gateway, Stripe, GitHub API

### Sliding Window Log (highest accuracy)

- Stores timestamp of every request in a rolling window
- No boundary problem: true rolling count
- O(N) memory per client where N = max requests per window
- Best for: billing systems, compliance-sensitive APIs
- Trade-off: higher memory usage at scale

### Fixed Window Counter (used for global limits)

- Simple counter that resets at fixed intervals
- O(1) memory per client (16 bytes: count + windowStart)
- Known boundary problem: 2x burst possible at window edges
- Best for: global rate limits where approximate enforcement is acceptable

### Two-Level Enforcement

Every request must pass both a global limit (Fixed Window, shared across all clients) and a per-tier limit (algorithm depends on tier config). The global limit prevents infrastructure overload; tier limits enforce SLA boundaries.

## Technical Challenges

### TypeScript Subpath Exports

The package uses Node.js subpath exports (`./backend`, `./frontend`, `./types`) to separate concerns. TypeScript only resolves these correctly with `module: "Node16"` or `"NodeNext"` in the consumer's tsconfig. Older module settings silently fail to find types. This is a common pain point with npm packages that use subpath exports and is documented as a requirement.

### SSE Through Nginx

Server-Sent Events work perfectly in development but break behind Nginx with default buffering. Events accumulate in the proxy buffer instead of streaming. The fix requires specific Nginx configuration:

```nginx
location /api/gateway/analytics/live {
    proxy_pass http://localhost:3001;
    proxy_buffering off;
    proxy_set_header X-Accel-Buffering no;
    proxy_set_header Cache-Control no-cache;
    proxy_set_header Connection '';
    proxy_http_version 1.1;
}
```

### EventSource Cannot Send Headers

The browser's native `EventSource` API does not support custom headers. This breaks API key authentication on SSE connections. The fix was replacing EventSource with a fetch-based SSE reader using `ReadableStream` and `TextDecoder` to manually parse the `text/event-stream` format while maintaining full header control.

### Circular Buffer Read Order

When a circular buffer wraps around, the oldest entry is at the head pointer, not index 0. Reading in chronological order requires slicing the buffer into two segments (head-to-end, then 0-to-head) and concatenating them. Off-by-one errors in this logic caused out-of-order display in the dashboard's recent requests table.

### TOTP Timing Safety

Standard string comparison (`===`) leaks timing information. An attacker can brute-force TOTP codes character by character by measuring response times. The fix uses `crypto.timingSafeEqual`, which always compares all bytes regardless of mismatch position. Both inputs must be normalized to fixed-length Buffers before comparison.

### Peer Dependency Version Ranges

React 18 and 19, and Recharts 2 and 3, have different internal APIs. The package supports both major versions (`react ^18.0.0 || ^19.0.0`, `recharts ^2.0.0 || ^3.0.0`) by avoiding APIs that changed between versions.

## Learnings

### Algorithms Are Simple, Systems Are Hard

Token Bucket is two numbers and a time delta. Sliding Window is an array filter. Fixed Window is a counter with a timestamp. The real complexity is middleware ordering, state isolation per client, HTTP header conventions, and making all pieces work together.

### Memory Bounds Matter

Without a circular buffer, the analytics service would grow linearly with traffic until the Node.js process runs out of memory. The 10,000-entry cap guarantees ~2 MB regardless of request volume. This same principle applies to rate limit state: Token Bucket's O(1) per client scales to 100k clients in 1.6 MB, while Sliding Window's O(N) would consume 80 MB for 10k pro-tier clients.

### Package Distribution Is Its Own Skill

Writing code that works in your own project is different from writing code that works in someone else's project. Subpath exports, peer dependencies, TypeScript module resolution, CSS bundling, dual CJS/ESM output, and version compatibility all require careful configuration that has nothing to do with the actual business logic.

### SSE > WebSockets for Unidirectional Streams

SSE is simpler, works over standard HTTP, and has browser-native reconnection. Unless you need bidirectional communication, SSE is the better choice. The only gotcha is proxy buffering and the EventSource header limitation, both solvable.

### Fail Open, Not Closed

A broken rate limiter should not become a denial-of-service against your own users. If the rate limiting logic throws an error, the middleware should allow the request through, log the error, and alert. Failing closed means your own bug takes down your service.

## API Reference

### Management Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/gateway/analytics` | Current analytics snapshot |
| GET | `/gateway/analytics/live` | SSE stream (5s updates) |
| GET | `/gateway/config` | Current gateway configuration |
| GET | `/gateway/logs?limit=20&offset=0` | Paginated request logs |
| POST | `/gateway/keys` | Create API key (body: `{name, tier}`) |
| DELETE | `/gateway/keys/:keyId` | Revoke an API key |

### Device Auth Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Register browser device (body: `{browserId}`) |
| GET | `/auth/status/:browserId` | Check device status |
| DELETE | `/auth/:browserId` | Revoke device |
| GET | `/auth/stats` | Device registry statistics |

### Rate Limit Response Headers

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Request quota for the tier |
| `X-RateLimit-Remaining` | Remaining requests in window |
| `X-RateLimit-Reset` | Seconds until limit resets |

## Theming

Override CSS custom properties to match your app's theme:

```css
.gw-dashboard {
  --gw-bg-card: #1a1a2e;
  --gw-accent: #00d4ff;
  --gw-text-primary: #ffffff;
  --gw-text-muted: #8888aa;
  --gw-border: #2a2a4a;
}
```

## TypeScript Support

All types are exported from the `./types` subpath:

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

## Contributing

Issues and PRs are welcome at [github.com/Gagandeep023/api-gateway](https://github.com/Gagandeep023/api-gateway).

```bash
git clone https://github.com/Gagandeep023/api-gateway.git
cd api-gateway
npm install
npm run build
npm test
```

## License

MIT
