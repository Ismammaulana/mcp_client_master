# MCP Client Master Gateway (JavaScript)

REST-to-MCP gateway berbasis Node.js yang menghubungkan HTTP JSON biasa ke MCP
server melalui transport Streamable HTTP. Implementasi ini mengikuti
`BLUEPRINT_REBUILD.md`, mempertahankan bentuk response sukses legacy, dan
menambahkan hardening production. Gateway memprioritaskan `POST/GET /mcp`
sebagai jalur utama dan dapat fallback ke `POST /api/mcp` plus
`GET /api/mcp/stream?sessionId=...` bila endpoint utama tidak tersedia.

## Fitur

- `GET /health` — liveness legacy (deprecated; masih mengekspos alamat upstream).
- `GET /health/live` — liveness production tanpa koneksi upstream.
- `GET /health/ready` — readiness dengan handshake MCP.
- `GET /tools` — daftar tool dari MCP server.
- `GET /mcp/discovery` — cek `/health`, initialize, lalu ambil tools/prompts/resources.
- `GET /prompts` dan `POST /prompts/get` — discovery dan pemanggilan prompt MCP.
- `GET /resources` dan `POST /resources/read` — discovery dan pembacaan resource MCP.
- `POST /tools/call` — pemanggilan generic tool dengan API key dan allowlist.
- `POST /plans/execute` — eksekusi plan backend secara berurutan melalui MCP.
- `POST /simulate-path` — shortcut `simulate_router_path`.
- `GET /metrics` — metric Prometheus.
- Request ID, JSON logging dengan redaction, timeout eksplisit, request-size limit,
  rate limit, concurrency limit, graceful shutdown, error envelope stabil, dan
  audit log per step plan.

Gateway tidak mengimplementasikan MCP server atau tool. MCP server eksternal harus
tersedia pada `MCP_SERVER_URL`.

## Dokumentasi

- [Indeks dokumentasi developer](docs/README.md)
- [Arsitektur](docs/architecture.md)
- [Kontrak API](docs/api.md)
- [Konfigurasi](docs/configuration.md)
- [Development](docs/development.md)
- [Testing](docs/testing.md)
- [Deployment](docs/deployment.md)
- [Operasional](docs/operations.md)
- [Keamanan](docs/security.md)
- [Panduan kontribusi](CONTRIBUTING.md)
- [Aturan Codex](AGENTS.md)
- [Changelog](CHANGELOG.md)

## Prasyarat

- Node.js 22 atau lebih baru.
- npm 11 atau kompatibel.
- MCP server dengan transport Streamable HTTP.

## Menjalankan secara lokal

```bash
cp .env.example .env
npm ci
npm test
npm start
```

Default `.env.example` local mengarah ke MCP server lokal di
`http://127.0.0.1:9200/mcp` dan membuka gateway di `http://127.0.0.1:9110`.

Pastikan `API_KEY` sama dengan `MCP_GATEWAY_API_KEY` di `agent-ai-master/.env`.
Bila `API_KEY` kosong, autentikasi dimatikan untuk development/kompatibilitas
lokal. Jangan gunakan nilai kosong pada production.

## Konfigurasi

| Variable | Default | Keterangan |
|---|---|---|
| `MCP_SERVER_URL` | `http://localhost:9200/mcp` | URL Streamable HTTP MCP utama |
| `MCP_HEALTH_URL` | turunan dari `MCP_SERVER_URL` | URL health upstream yang dicek sebelum discovery |
| `MCP_FALLBACK_POST_URL` | turunan dari `MCP_SERVER_URL` | Endpoint fallback `POST /api/mcp` |
| `MCP_FALLBACK_STREAM_URL` | turunan dari `MCP_SERVER_URL` | Endpoint fallback SSE `GET /api/mcp/stream` |
| `MCP_TRANSPORT_MODE` | `auto` | `auto`, `primary`, atau `fallback` untuk memilih strategi koneksi upstream |
| `MCP_HOST_HEADER` | kosong | Override header `Host` bila virtual host membutuhkannya |
| `MCP_AUTHORIZATION` | kosong | Nilai header `Authorization` ke upstream, mis. `Bearer <token>` |
| `MCP_SECRET_HEADER` | `x-mcp-secret` | Nama header secret upstream kedua bila deployment memerlukannya |
| `MCP_SECRET_VALUE` | kosong | Nilai secret upstream untuk `MCP_SECRET_HEADER` |
| `MCP_UPSTREAM_SECRET_HEADER` | kosong | Alias runtime untuk `MCP_SECRET_HEADER` bila deployment memakai nama baru |
| `MCP_UPSTREAM_SECRET` | kosong | Alias runtime untuk `MCP_SECRET_VALUE` |
| `GATEWAY_HOST` | `0.0.0.0` | Bind host |
| `GATEWAY_PORT` | `9100` | Bind port default; `.env.example` local memakai `9110` agar sama dengan wrapper |
| `LOG_LEVEL` | `info` | Level Pino/Fastify |
| `MCP_CONNECT_TIMEOUT_SECONDS` | `5` | Timeout handshake |
| `MCP_REQUEST_TIMEOUT_SECONDS` | `30` | Timeout operasi MCP |
| `API_KEY` | kosong | Nilai header `x-api-key` |
| `ALLOWED_TOOLS` | `simulate_router_path,activation.get_workspace_context,activation.create_draft,device.search,activation.add_device_to_topology,topology.add_device,activation.validate_draft` | Allowlist dipisahkan koma |
| `REQUEST_BODY_LIMIT_BYTES` | `1048576` | Batas body request |
| `RATE_LIMIT_MAX` | `100` | Maksimum request per window per client |
| `RATE_LIMIT_WINDOW` | `1 minute` | Window rate limit Fastify |
| `MCP_MAX_CONCURRENCY` | `20` | Operasi MCP aktif maksimum per process |

Konfigurasi divalidasi sebelum server mulai. URL, port, timeout, atau allowlist
invalid akan menghentikan startup.

## Contoh API

```bash
curl http://localhost:9100/health/live

curl -H 'x-api-key: change-me-in-production' \
  http://localhost:9100/tools

curl -H 'x-api-key: change-me-in-production' \
  http://localhost:9100/mcp/discovery

curl -X POST http://localhost:9100/tools/call \
  -H 'content-type: application/json' \
  -H 'x-api-key: change-me-in-production' \
  -d '{"name":"simulate_router_path","arguments":{"source":"r1","destination":"r2"}}'

curl -X POST http://localhost:9100/plans/execute \
  -H 'content-type: application/json' \
  -H 'x-api-key: change-me-in-production' \
  -d '{
    "planId":"plan-activation-001",
    "sessionId":"sess-123",
    "page":"aktivasi-service",
    "workspaceId":"ws-123",
    "steps":[
      {
        "id":"step-1",
        "tool":"activation.get_workspace_context",
        "arguments":{"sessionId":"sess-123","include":["workspace","draft"]}
      },
      {
        "id":"step-2",
        "tool":"device.search",
        "arguments":{"query":"router-a"}
      },
      {
        "id":"step-3",
        "tool":"activation.create_draft",
        "arguments":{"serviceType":"service"}
      },
      {
        "id":"step-4",
        "tool":"activation.add_device_to_topology",
        "arguments":{
          "deviceId":"result:device.search.data.data[0].device_id",
          "role":"intermediate",
          "position":{"x":10,"y":20}
        }
      }
    ]
  }'

curl -X POST http://localhost:9100/simulate-path \
  -H 'content-type: application/json' \
  -H 'x-api-key: change-me-in-production' \
  -d '{"source":"r1","destination":"r2"}'
```

Error production tidak memasukkan raw exception:

```json
{
  "error": {
    "code": "MCP_UPSTREAM_TIMEOUT",
    "message": "MCP server did not respond in time",
    "request_id": "e829c7f7-6aa4-48ac-b82d-9e791a8f43b7"
  }
}
```

## Quality gate

```bash
npm run lint
npm run docs:check
npm test
npm run test:contract
npm run check
```

Test normal memakai fake MCP adapter dan tidak memerlukan jaringan. Script
`test:contract` membuka server hanya pada loopback untuk menguji transport MCP
Streamable HTTP end-to-end. Contract test
memastikan bentuk response sukses legacy, tool-level error HTTP 200, validasi,
text fallback, empty structured content, auth, allowlist, readiness, dan redaksi
error.

Setiap perubahan runtime harus membawa test, pembaruan dokumentasi terkait, dan
entri `CHANGELOG.md` dalam perubahan yang sama. Detail workflow ada pada
`AGENTS.md` dan `CONTRIBUTING.md`.

## Container

```bash
docker build -t mcp-client-master-gateway:1.0.0 .
API_KEY='replace-with-secret' docker compose -f deploy/docker-compose.yml up -d
```

Container berjalan sebagai user non-root bawaan image Node. MCP server tidak
dibundel dalam Compose karena berada di luar scope gateway.

Untuk systemd, gunakan Node system-wide seperti `/usr/bin/node` dan user dedicated
`mcp-gateway`. Hindari menjalankan service dari binary NVM di home directory
operator karena akan bertabrakan dengan hardening `ProtectHome`.

## Kebijakan kompatibilitas

Endpoint legacy tanpa prefix dipertahankan. Perubahan hardening yang disengaja:

- route MCP memerlukan `x-api-key` bila `API_KEY` dikonfigurasi;
- `/tools/call` menerapkan allowlist;
- `/plans/execute` menjalankan step berurutan, resolve placeholder `result:*`,
  menormalisasi argumen activation untuk `page: aktivasi-service`, mencoba
  mengisi `draft_id` bila tersedia, memakai nilai kompatibilitas internal bila
  upstream tidak mengembalikan id yang bisa dipakai, memvalidasi field wajib
  sebelum call MCP, mencatat audit log per step, dan berhenti pada fatal error
  pertama;
- exception sekarang memakai error envelope dan tidak membocorkan raw detail;
- validation error memakai HTTP 422 dengan error envelope stabil.

`GET /health` dipertahankan untuk consumer lama, tetapi gunakan `/health/live`
untuk deployment baru karena endpoint legacy mengekspos URL upstream.

## Operasional dan troubleshooting

- `MCP_UPSTREAM_UNAVAILABLE`: periksa DNS/routing, URL, TLS, dan kebutuhan
  `MCP_HOST_HEADER`. Bila upstream master hanya membuka `/api/mcp`, isi URL fallback
  dan pastikan `/health` dapat diakses.
- `MCP_UPSTREAM_TIMEOUT`: naikkan timeout hanya setelah memeriksa latency upstream.
- `TOOL_NOT_ALLOWED`: tambahkan nama tool ke `ALLOWED_TOOLS` setelah review risiko.
- `PLACEHOLDER_RESOLUTION_FAILED`: backend mengirim referensi `result:*` ke step
  sebelumnya yang belum ada atau tidak memiliki field yang diminta.
- `MCP_CONCURRENCY_LIMIT`: scale-out atau naikkan limit setelah load test.
- Readiness gagal tetapi liveness sehat berarti process gateway berjalan namun MCP
  upstream tidak siap.

Rollback dilakukan dengan menjalankan kembali image/tag sebelumnya dan
mempertahankan `.env` deployment. Tidak ada database atau migrasi state.

## Keputusan yang masih perlu ditetapkan pemilik sistem

- Migrasi penuh dari endpoint legacy dan tanggal penghapusannya.
- OAuth2/JWT, mTLS, atau identity-aware proxy sebagai pengganti static API key.
- Klasifikasi read-only/mutating dan allowlist final setiap tool.
- SLO latency, throughput, availability, serta kapasitas concurrency.
- Kebijakan log organisasi dan integrasi OpenTelemetry.
- Target utama deployment (Compose, systemd, atau Kubernetes).
