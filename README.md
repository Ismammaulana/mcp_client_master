# MCP Client Master Gateway (JavaScript)

REST-to-MCP gateway berbasis Node.js yang menghubungkan HTTP JSON biasa ke MCP
server melalui transport Streamable HTTP. Implementasi ini mengikuti
`BLUEPRINT_REBUILD.md`, mempertahankan bentuk response sukses legacy, dan
menambahkan hardening production.

## Fitur

- `GET /health` — liveness legacy (deprecated; masih mengekspos alamat upstream).
- `GET /health/live` — liveness production tanpa koneksi upstream.
- `GET /health/ready` — readiness dengan handshake MCP.
- `GET /tools` — daftar tool dari MCP server.
- `POST /tools/call` — pemanggilan generic tool dengan API key dan allowlist.
- `POST /simulate-path` — shortcut `simulate_router_path`.
- `GET /metrics` — metric Prometheus.
- Request ID, JSON logging dengan redaction, timeout eksplisit, request-size limit,
  rate limit, concurrency limit, graceful shutdown, dan error envelope stabil.

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

Ubah `API_KEY` di `.env`. Bila `API_KEY` kosong, autentikasi dimatikan untuk
development/kompatibilitas lokal. Jangan gunakan nilai kosong pada production.

## Konfigurasi

| Variable | Default | Keterangan |
|---|---|---|
| `MCP_SERVER_URL` | `http://localhost:9200/mcp` | URL Streamable HTTP MCP |
| `MCP_HOST_HEADER` | kosong | Override header `Host` bila virtual host membutuhkannya |
| `GATEWAY_HOST` | `0.0.0.0` | Bind host |
| `GATEWAY_PORT` | `9100` | Bind port |
| `LOG_LEVEL` | `info` | Level Pino/Fastify |
| `MCP_CONNECT_TIMEOUT_SECONDS` | `5` | Timeout handshake |
| `MCP_REQUEST_TIMEOUT_SECONDS` | `30` | Timeout operasi MCP |
| `API_KEY` | kosong | Nilai header `x-api-key` |
| `ALLOWED_TOOLS` | `simulate_router_path` | Allowlist dipisahkan koma |
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

curl -X POST http://localhost:9100/tools/call \
  -H 'content-type: application/json' \
  -H 'x-api-key: change-me-in-production' \
  -d '{"name":"simulate_router_path","arguments":{"source":"r1","destination":"r2"}}'

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

## Kebijakan kompatibilitas

Endpoint legacy tanpa prefix dipertahankan. Perubahan hardening yang disengaja:

- route MCP memerlukan `x-api-key` bila `API_KEY` dikonfigurasi;
- `/tools/call` menerapkan allowlist;
- exception sekarang memakai error envelope dan tidak membocorkan raw detail;
- validation error memakai HTTP 422 dengan error envelope stabil.

`GET /health` dipertahankan untuk consumer lama, tetapi gunakan `/health/live`
untuk deployment baru karena endpoint legacy mengekspos URL upstream.

## Operasional dan troubleshooting

- `MCP_UPSTREAM_UNAVAILABLE`: periksa DNS/routing, URL, TLS, dan kebutuhan
  `MCP_HOST_HEADER`.
- `MCP_UPSTREAM_TIMEOUT`: naikkan timeout hanya setelah memeriksa latency upstream.
- `TOOL_NOT_ALLOWED`: tambahkan nama tool ke `ALLOWED_TOOLS` setelah review risiko.
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
