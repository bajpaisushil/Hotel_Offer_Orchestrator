# Hotel Offer Orchestrator

A service that queries two hotel suppliers for a city, removes duplicate hotels and keeps the
best-priced offer for each one. The fan-out, the comparison and the caching are orchestrated by a
Temporal workflow, and the deduplicated result is stored in Redis so price-range queries can be
answered by Redis itself.

## What it does

Both suppliers sell overlapping inventory under the same hotel names at different prices and
commission rates. A request for `delhi` triggers a workflow that calls both suppliers at the same
time, groups their hotels by name, and keeps the cheapest offer per name. If both suppliers quote
the same price, the one paying the higher commission wins. The result is written to Redis and
returned to the caller.

If one supplier is slow or broken the request still succeeds with whatever the other supplier
returned. The response carries an `x-degraded-suppliers` header so the caller knows the list is
based on partial data. Only when both suppliers fail does the request return an error.

## Architecture

```
                   ┌──────────────────────────────────────┐
  GET /api/hotels  │              Express API             │
  ────────────────▶│  validation · workflow start · read  │
                   └───────┬──────────────────────┬───────┘
                           │                      │
            start workflow │                      │ ZRANGEBYSCORE + HMGET
                           ▼                      ▼
                   ┌───────────────┐      ┌───────────────┐
                   │   Temporal    │      │     Redis     │
                   │    server     │      │  price index  │
                   └───────┬───────┘      └───────▲───────┘
                           │ task queue           │
                           ▼                      │ write deduped list
                   ┌──────────────────────────────┴───────┐
                   │          Temporal worker             │
                   │  hotelSearchWorkflow                 │
                   │   ├─ fetchSupplierHotels('A')  ─┐    │
                   │   ├─ fetchSupplierHotels('B')  ─┤ in parallel
                   │   ├─ selectBestOffers()        ─┘    │
                   │   └─ persistOffers()                 │
                   └───────┬──────────────────────────────┘
                           │ HTTP
                           ▼
                   ┌──────────────────────────────────────┐
                   │   Mock suppliers (same service)      │
                   │   /supplierA/hotels  /supplierB/hotels│
                   └──────────────────────────────────────┘
```

The API and the worker are the same image run with different commands. The API never talks to
suppliers directly during a search; it starts a workflow and waits for the result.

## Running it

### Docker Compose

```bash
git clone git@github.com:bajpaisushil/Hotel_Offer_Orchestrator.git
cd Hotel_Offer_Orchestrator
docker compose up -d --build
```

Four containers come up: Redis, a Temporal dev server, the API and the Temporal worker. Compose
waits for Redis and Temporal to report healthy before starting the application containers, and the
worker retries its connection on top of that, so a cold start needs no manual sequencing.

Check that everything is live:

```bash
curl http://localhost:3000/health
curl "http://localhost:3000/api/hotels?city=delhi"
```

The Temporal Web UI is at <http://localhost:8233>, where every workflow execution shows up with its
activity timeline, inputs, outputs and retries.

Stop everything with `docker compose down`, or `docker compose down -v` to drop the Redis volume
too.

#### If those ports are already taken

Host ports are configurable, so you do not have to free up `3000` or `6379`. Create a `.env` file
next to `docker-compose.yml`:

```
API_PORT=3010
REDIS_PORT=6399
TEMPORAL_PORT=7233
TEMPORAL_UI_PORT=8233
```

Only the host side changes; the containers still talk to each other on their standard ports.

### Local development

You need Node 20 or newer, plus Redis and Temporal running somewhere. The quickest way is to take
them from Compose and run the application on your machine:

```bash
docker compose up -d redis temporal
npm install
cp .env.example .env
```

Then run the API and the worker in two terminals:

```bash
npm run dev          # API on http://localhost:3000
npm run dev:worker   # Temporal worker
```

Both use `tsx watch`, so they reload on save. The worker has to be running or workflows will sit in
the task queue unclaimed and the request will time out.

## API

### `GET /api/hotels`

| Parameter | Required | Description |
| --- | --- | --- |
| `city` | yes | City to search, case insensitive. |
| `minPrice` | no | Lower bound, inclusive. |
| `maxPrice` | no | Upper bound, inclusive. |
| `simulateFailure` | no | `A`, `B` or `A,B`. Forces those suppliers to fail for this request. |

```bash
curl "http://localhost:3000/api/hotels?city=delhi"
```

```json
[
  { "name": "Holtin", "price": 5340, "supplier": "Supplier B", "commissionPct": 20 },
  { "name": "Radison", "price": 5900, "supplier": "Supplier A", "commissionPct": 13 },
  { "name": "Hyatt Regency", "price": 8700, "supplier": "Supplier B", "commissionPct": 10 },
  { "name": "Leela Kempinski", "price": 9800, "supplier": "Supplier A", "commissionPct": 11 },
  { "name": "ITC Maurya", "price": 11000, "supplier": "Supplier B", "commissionPct": 14 },
  { "name": "Taj Palace", "price": 12500, "supplier": "Supplier B", "commissionPct": 12 },
  { "name": "Oberoi Gurgaon", "price": 14200, "supplier": "Supplier A", "commissionPct": 9 }
]
```

Holtin is cheaper on B, Radison is cheaper on A, Hyatt Regency and ITC Maurya only exist on B, and
Taj Palace is the same price on both so the higher commission decides it. Results are sorted
cheapest first. A city neither supplier covers returns `[]` with a 200, not a 404, because the
search ran fine and simply matched nothing.

With a price range:

```bash
curl "http://localhost:3000/api/hotels?city=delhi&minPrice=5500&maxPrice=11000"
```

Either bound can be omitted. Two response headers are set for debugging: `x-result-source` is
`redis` or `workflow`, and `x-degraded-suppliers` lists any supplier that failed.

### `GET /health`

Probes both suppliers, Redis and Temporal in parallel and reports each one with its latency.

```json
{
  "status": "ok",
  "uptimeSeconds": 36,
  "dependencies": {
    "Supplier A": { "status": "up", "latencyMs": 200 },
    "Supplier B": { "status": "up", "latencyMs": 137 },
    "redis": { "status": "up", "latencyMs": 4 },
    "temporal": { "status": "up", "latencyMs": 7 }
  }
}
```

`status` is `ok` when everything answers, `degraded` when exactly one supplier is down, and `down`
when Redis or Temporal is unreachable or both suppliers are gone. `ok` and `degraded` return 200
because the service can still serve traffic; `down` returns 503 so a load balancer takes the
instance out of rotation.

To see a degraded response, start the API with a supplier switched off:

```bash
SUPPLIER_A_FORCE_DOWN=true docker compose up -d api
curl http://localhost:3000/health
```

### `GET /supplierA/hotels` and `GET /supplierB/hotels`

The mock upstreams. They accept an optional `city` filter and return the raw supplier shape:

```json
[{ "hotelId": "a1", "name": "Holtin", "price": 6000, "city": "delhi", "commissionPct": 10 }]
```

Each one sleeps briefly before responding (A around 180ms, B around 120ms) so the parallel fan-out
in the workflow is visible in the Temporal UI rather than finishing instantly. Adding `fail=1`
makes the endpoint return 503, which is the seam `simulateFailure` uses.

Cities covered: `delhi`, `mumbai`, `goa`. Anything else returns an empty list.

## How the workflow works

`hotelSearchWorkflow` lives in [src/temporal/workflows/hotelSearch.ts](src/temporal/workflows/hotelSearch.ts)
and does four things:

1. Starts `fetchSupplierHotels` for A and B and waits on both with `Promise.allSettled`. Each
   activity gets a 10 second timeout and up to three attempts with exponential backoff, so a brief
   supplier blip is retried before it counts as a failure.
2. Collects the outcomes. A rejected branch is recorded with its reason and the workflow keeps
   going. If every branch rejected it throws a non-retryable `ALL_SUPPLIERS_DOWN` failure, because
   retrying the workflow will not conjure data that does not exist.
3. Runs `selectBestOffers`, a pure function in [src/domain/offers.ts](src/domain/offers.ts) that
   groups by normalised name and keeps the best offer. Keeping it pure means it is unit tested
   directly without a Temporal test environment.
4. Calls `persistOffers` to write the result to Redis. This one is deliberately non-fatal: if
   Redis is unreachable the workflow logs it, flags the result as uncached and returns the offers
   anyway. The API notices the flag and applies the price filter in process instead. A Redis outage
   degrades performance, it does not take the endpoint down.

Activity failures, retries and the final result are all recorded in workflow history, so a failed
search can be opened in the Temporal UI and read back attempt by attempt.

## Why Redis holds a sorted set

The brief asks for the price filtering to happen inside Redis rather than in application code, so
the deduplicated list is stored as two keys per city:

| Key | Type | Contents |
| --- | --- | --- |
| `hotels:<city>:byPrice` | sorted set | member = normalised hotel name, score = price |
| `hotels:<city>:offers` | hash | normalised hotel name → the full offer as JSON |
| `hotels:<city>:meta` | hash | offer count and the time it was cached |

A filtered read is `ZRANGEBYSCORE hotels:delhi:byPrice 5500 11000` followed by one `HMGET` for the
matching members. Redis does the range scan and returns the names already ordered by price, so the
API never loads the full city list to throw most of it away. An unbounded query is the same two
commands with `-inf` and `+inf`.

The `meta` key is there for operability rather than for reads: Redis will not keep an empty sorted
set, so a city that genuinely has no hotels leaves no trace at all, and `meta` is what tells you it
was searched, when, and how many offers came back. All three keys expire together after
`REDIS_TTL_SECONDS`.

You can watch it work:

```bash
docker exec hotel-redis redis-cli ZRANGE hotels:delhi:byPrice 0 -1 WITHSCORES
docker exec hotel-redis redis-cli ZRANGEBYSCORE hotels:delhi:byPrice 5500 11000
```

## Failure handling

| Situation | Behaviour |
| --- | --- |
| One supplier errors or times out | Activity retried up to three times, then dropped. Request returns the other supplier's hotels with `x-degraded-suppliers` set. |
| Both suppliers fail | Workflow fails with `ALL_SUPPLIERS_DOWN`, API returns 503. |
| Supplier returns a malformed body | Rejected by the response schema and treated as a supplier failure rather than propagating bad data. |
| Redis is down | Workflow still returns offers, API filters in memory, response header shows `x-result-source: workflow`. |
| Temporal is unreachable | API returns 503 with `ORCHESTRATION_FAILURE`. |
| Bad query parameters | 400 before any workflow starts, with the offending field named. |

Every error leaves the API through one handler in
[src/api/middleware/errorHandler.ts](src/api/middleware/errorHandler.ts), so the shape is always
the same:

```json
{ "error": { "code": "INVALID_REQUEST", "message": "Request validation failed", "details": [] } }
```

Logging is structured JSON via pino, pretty printed in development. Every request gets an id,
echoed back as `x-request-id` and attached to its log lines. Worker and activity logs route through
the same logger, so a workflow's activity output sits in the same stream as the HTTP logs.

## Testing

Unit tests cover the selection and filtering rules, which is where the actual business logic lives:

```bash
npm test
```

The Postman collection doubles as an integration suite. Import `postman_collection.json` and set
`baseUrl`, or run the whole thing headless:

```bash
npx newman run postman_collection.json --env-var baseUrl=http://localhost:3000
```

Sixteen requests and forty-four assertions covering the happy path, price ranges, an unknown city,
single and double supplier outages, validation errors and the raw supplier endpoints. Run the
requests in order, since the outage scenarios assume Redis has already been populated.

## Configuration

Everything is read from the environment and validated at startup by a Zod schema in
[src/config.ts](src/config.ts). A bad value stops the process with a readable message instead of
surfacing as `undefined` later.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | API port. |
| `LOG_LEVEL` | `info` | pino level. |
| `SUPPLIER_A_URL` / `SUPPLIER_B_URL` | local mocks | Where the activities fetch from. Point these at real suppliers to replace the mocks. |
| `SUPPLIER_TIMEOUT_MS` | `3000` | Per-call supplier timeout. |
| `SUPPLIER_A_FORCE_DOWN` / `SUPPLIER_B_FORCE_DOWN` | `false` | Keeps a mock supplier permanently down, for demoing `/health`. |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection. |
| `REDIS_TTL_SECONDS` | `300` | How long a cached city survives. |
| `TEMPORAL_ADDRESS` | `localhost:7233` | Temporal frontend. |
| `TEMPORAL_NAMESPACE` | `default` | Temporal namespace. |
| `TEMPORAL_TASK_QUEUE` | `hotel-offers` | Queue shared by the client and the worker. |
| `WORKFLOW_TIMEOUT_MS` | `30000` | Ceiling on one search. |

## Project layout

```
src/
├── api/
│   ├── middleware/        request id and logging, error envelope, async wrapper
│   ├── routes/            hotels, health, mock suppliers
│   ├── server.ts          express wiring
│   └── index.ts           listener and graceful shutdown
├── cache/
│   ├── redis.ts           connection lifecycle
│   └── hotelCache.ts      sorted set writes and range reads
├── domain/
│   ├── types.ts           shared types, no dependencies
│   └── offers.ts          dedupe, best-price selection, filtering
├── suppliers/
│   ├── catalogue.ts       mock inventory
│   └── client.ts          HTTP client with timeout and schema validation
├── temporal/
│   ├── activities/        supplier fetch and redis write
│   ├── workflows/         hotelSearchWorkflow
│   ├── client.ts          starts workflows from the API
│   └── worker.ts          worker process
├── lib/                   logger and error types
└── config.ts              validated environment
tests/                     unit tests for the selection rules
```

`domain/` has no imports from the rest of the codebase, which is what lets the workflow bundle stay
small and keeps the comparison logic testable on its own.

## Notes

A few things I would change before this carried real traffic:

- Hotel identity is matched on a normalised name. Real inventory needs a mapping table or fuzzy
  matching, since the same property is rarely spelled identically across suppliers.
- Every request runs a workflow. Serving a warm cache directly and running the workflow only on a
  miss, or on a background refresh, would cut latency a lot — the Redis layer is already in place
  for it.
- Supplier credentials, rate limits and per-supplier circuit breakers are out of scope here. The
  retry policy is per activity, so a supplier that is down still costs three attempts per request.
- The Temporal dev server keeps history in memory, so restarting that container clears it. A real
  deployment points at a persistent cluster.
