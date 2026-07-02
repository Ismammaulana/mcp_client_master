# Operasional

## Health model

### Liveness

`GET /health/live` membuktikan event loop dan HTTP server dapat merespons. Endpoint
tidak mengakses MCP upstream.

### Readiness

`GET /health/ready` melakukan initialize handshake ke MCP. Failure readiness
menandakan instance tidak dapat melayani traffic MCP, tetapi bukan alasan otomatis
untuk restart process.

### Legacy health

`GET /health` hanya compatibility liveness dan mengekspos URL/header upstream.
Jangan gunakan pada monitoring baru.

## Logging

Fastify/Pino menghasilkan JSON log. Field umum:

```json
{
  "level": 30,
  "time": 1782197699991,
  "reqId": "409d17cd-ce77-4cde-b7a7-2c135ba4612b",
  "req": {
    "method": "GET",
    "url": "/health/live"
  },
  "msg": "incoming request"
}
```

Gunakan `reqId`/`x-request-id` untuk korelasi caller, gateway log, dan incident.
Jangan mencatat body generic tool call secara default karena dapat mengandung data
sensitif. Header API key dan authorization harus selalu direduksi/tidak diserialisasi.

Gateway menulis log proses tambahan pada level `info` dan `debug`:

- `HTTP request completed` untuk semua request dengan `method`, `route`,
  `statusCode`, dan `durationMs`.
- `MCP discovery request started/completed`, `Tool list request started/completed`,
  `Prompt list request started/completed`, `Resource list request started/completed`,
  `Prompt retrieval request started/completed`, `Resource read request started/completed`,
  `Tool call request started/completed`, `Plan execution request started/completed`,
  dan `Path simulation request started/completed`.
- `Readiness probe started/completed` pada `/health/ready`.
- `Gateway bootstrap starting` dan `Gateway listening` saat startup.
- `McpClientAdapter.*` pada level `debug` untuk startup operasi, strategi transport,
  connect/close, health check, dan hasil operasi upstream.
- `ToolService.*` pada level `debug` untuk start/completion use case internal.

`POST /plans/execute` menulis audit log per step dengan field:

- `planId`
- `sessionId`
- `page`
- `stepIndex`
- `stepId`
- `tool`
- `normalizedArguments`
- `durationMs`
- `status`
- `errorCode` saat gagal

Level:

- `info`: request lifecycle, route lifecycle, plan lifecycle, startup/shutdown, dan readiness.
- `warn`: auth failure, MCP operation failure yang dipetakan, dan health probe gagal.
- `error`: internal/unhandled error atau shutdown failure.
- `debug`: request received, transport selection, connect/close cleanup, dan diagnosis development.

## Metrics

Endpoint `/metrics` memakai auth jika API key aktif.

Metric aplikasi:

| Metric | Type | Labels | Makna |
|---|---|---|---|
| `mcp_gateway_http_requests_total` | Counter | method, route, status_code | Total HTTP response |
| `mcp_gateway_http_request_duration_seconds` | Histogram | method, route, status_code | End-to-end gateway latency |
| `mcp_gateway_http_active_requests` | Gauge | - | Request HTTP aktif |

`prom-client` juga mengekspos default Node process metrics dengan prefix
`mcp_gateway_`, termasuk CPU, memory, event loop, dan garbage collection tergantung
runtime.

Cardinality route dibatasi pada Fastify route template; unknown route memakai label
`unknown`. Jangan menambahkan tool name, request ID, router name, atau user input
sebagai metric label.

## Dashboard minimum

- Request rate per route/status.
- P50/P95/P99 request latency.
- 401/403/413/422/429 rate untuk client misuse/attack signal.
- 502/504 rate untuk upstream health.
- 503 concurrency-limit rate untuk saturation.
- Active requests.
- Process memory, CPU, event-loop lag, restart count.
- Readiness state per replica.

Gateway saat ini belum memiliki metric khusus upstream duration atau tool-level
`isError`. Bedakan keterbatasan ini saat membuat dashboard.

## Alert awal

Threshold berikut hanya starting point dan bukan SLO resmi:

- Readiness gagal terus selama 2–5 menit.
- 502/504 lebih dari baseline selama 5 menit.
- 503 concurrency limit muncul konsisten.
- P95 mendekati request timeout.
- Restart process berulang.
- Memory tumbuh terus tanpa kembali setelah traffic turun.

Sesuaikan setelah SLO dan traffic baseline disepakati.

## Capacity

Per process, operasi MCP aktif dibatasi `MCP_MAX_CONCURRENCY`. Request health dan
metrics tidak memakai gate MCP, tetapi tetap memakai HTTP/event-loop resources.

Ukuran kapasitas minimal harus mencakup:

- latency tool rata-rata dan tail;
- throughput target;
- jumlah process/replica;
- kapasitas session/concurrent request MCP server;
- memory per active response, terutama response besar/streaming;
- rate-limit semantics di balik proxy.

Tidak ada queue internal. Status 503 adalah sinyal scale/tuning/backpressure, bukan
error yang sebaiknya disembunyikan.

## Startup dan shutdown

Startup gagal cepat bila config invalid atau port tidak dapat di-bind. Startup tidak
memeriksa MCP sampai readiness dipanggil.

SIGINT/SIGTERM memulai graceful close. Pastikan supervisor tidak mengirim SIGKILL
sebelum request timeout/grace period selesai. Log `Shutting down gateway` harus
muncul saat normal termination.

## Troubleshooting cepat

### Liveness gagal

Periksa process, bind address/port, event-loop saturation, memory/OOM, dan supervisor
log. Jangan fokus ke MCP karena liveness tidak mengakses upstream.

### Readiness gagal tetapi liveness sehat

Periksa runbook `runbooks/mcp-upstream-incident.md`.

### 401 meningkat

Periksa secret rotation, caller configuration, proxy yang menghapus header, dan
traffic tidak sah. Jangan log nilai API key untuk diagnosis.

### 403 TOOL_NOT_ALLOWED

Periksa `ALLOWED_TOOLS`. Jangan langsung memperluas allowlist; review kemampuan dan
side effect tool terlebih dahulu.

### 429 RATE_LIMIT_EXCEEDED

Periksa traffic per client dan topologi proxy. Karena gateway belum `trustProxy`,
semua caller di balik proxy dapat terlihat sebagai satu address. Terapkan distributed
rate limiting di proxy atau lakukan desain trusted proxy sebelum mengubah gateway.

### 503 MCP_CONCURRENCY_LIMIT

Bandingkan traffic dan latency upstream. Scale hanya bila MCP server mampu menerima
gabungan concurrency lebih besar.

### 413 REQUEST_TOO_LARGE

Periksa payload dan batas reverse proxy. Jangan menaikkan sampai 10 MB tanpa analisis
memory/concurrency.

## Backup

Tidak ada application state untuk dibackup. Artefak yang harus dilindungi:

- source dan lock file pada version control;
- image/tag release;
- deployment configuration;
- secret pada secret manager;
- dashboard/alert definitions pada platform observability.
