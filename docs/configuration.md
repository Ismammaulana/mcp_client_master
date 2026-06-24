# Konfigurasi

## Loading dan validasi

`src/config.js` memuat `.env` melalui dotenv lalu membaca `process.env`. Nilai
divalidasi dengan Zod sebelum server listen. Startup gagal bila konfigurasi invalid;
gateway tidak berjalan dengan nilai parsial.

Salin template untuk development:

```bash
cp .env.example .env
```

`.env` tidak boleh di-commit. Production sebaiknya memakai secret manager atau
`EnvironmentFile` dengan permission terbatas.

## Referensi variable

| Variable | Default | Validasi | Dampak |
|---|---|---|---|
| `MCP_SERVER_URL` | `http://localhost:9200/mcp` | URL valid | Endpoint MCP Streamable HTTP |
| `MCP_HOST_HEADER` | kosong | string | Override HTTP Host; mengaktifkan jalur Undici |
| `GATEWAY_HOST` | `0.0.0.0` | non-empty | Interface bind |
| `GATEWAY_PORT` | `9100` | integer 1–65535 | Port listen |
| `LOG_LEVEL` | `info` | fatal/error/warn/info/debug/trace/silent | Verbosity Pino |
| `MCP_CONNECT_TIMEOUT_SECONDS` | `5` | integer 1–300 | Initialize handshake timeout |
| `MCP_REQUEST_TIMEOUT_SECONDS` | `30` | integer 1–3600 | list/call timeout |
| `API_KEY` | kosong | string | Auth `x-api-key`; kosong menonaktifkan auth |
| `ALLOWED_TOOLS` | `simulate_router_path` | CSV dengan minimal satu nama | Generic execution allowlist |
| `REQUEST_BODY_LIMIT_BYTES` | `1048576` | integer 1024–10485760 | Fastify body limit |
| `RATE_LIMIT_MAX` | `100` | integer 1–100000 | Request per client/window/process |
| `RATE_LIMIT_WINDOW` | `1 minute` | non-empty | Format time window Fastify rate-limit |
| `MCP_MAX_CONCURRENCY` | `20` | integer 1–1000 | Operasi MCP aktif/process |

`ALLOWED_TOOLS` di-trim, entry kosong dihapus, dan duplikat dideduplikasi.

## Contoh development

```dotenv
MCP_SERVER_URL=http://127.0.0.1:9200/mcp
MCP_HOST_HEADER=
GATEWAY_HOST=127.0.0.1
GATEWAY_PORT=9100
LOG_LEVEL=debug
MCP_CONNECT_TIMEOUT_SECONDS=5
MCP_REQUEST_TIMEOUT_SECONDS=30
API_KEY=local-development-only
ALLOWED_TOOLS=simulate_router_path,echo
REQUEST_BODY_LIMIT_BYTES=1048576
RATE_LIMIT_MAX=1000
RATE_LIMIT_WINDOW=1 minute
MCP_MAX_CONCURRENCY=10
```

## Contoh production

```dotenv
MCP_SERVER_URL=https://mcp.internal.example/mcp
MCP_HOST_HEADER=mcp.internal.example
GATEWAY_HOST=0.0.0.0
GATEWAY_PORT=9100
LOG_LEVEL=info
MCP_CONNECT_TIMEOUT_SECONDS=5
MCP_REQUEST_TIMEOUT_SECONDS=30
API_KEY=<injected-by-secret-manager>
ALLOWED_TOOLS=simulate_router_path
REQUEST_BODY_LIMIT_BYTES=1048576
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=1 minute
MCP_MAX_CONCURRENCY=20
```

Jangan menaruh placeholder literal sebagai secret aktif.

## Tuning timeout

Connect timeout harus mencakup DNS, TCP/TLS, MCP initialize, dan capability
negotiation. Request timeout mencakup operasi tool penuh.

Gunakan data latency upstream, bukan menaikkan timeout untuk menyembunyikan masalah.
`TimeoutStopSec` systemd atau termination grace period container harus lebih besar
dari timeout request bila request aktif diharapkan selesai saat shutdown.

## Tuning concurrency

Mulai dari kemampuan upstream. Per replica/process:

```text
MCP_MAX_CONCURRENCY <= kapasitas upstream yang dialokasikan ke process
```

Dengan beberapa process:

```text
total theoretical concurrency = replica × process/replica × MCP_MAX_CONCURRENCY
```

Gate tidak mengantre. Kelebihan request mendapat 503 agar backpressure terlihat.

## Custom Host header

Isi `MCP_HOST_HEADER` hanya bila alamat koneksi dan virtual host berbeda. Contoh:

```dotenv
MCP_SERVER_URL=http://10.0.20.15:9200/mcp
MCP_HOST_HEADER=mcp.internal.example
```

Mode ini memakai Undici, bukan standard fetch. Pastikan upstream memang
membutuhkan virtual host dan nilai header bukan berasal dari input user.

## Menambah konfigurasi baru

Perubahan wajib mencakup:

1. Schema dan mapping pada `src/config.js`.
2. Default aman atau keputusan bahwa variable wajib.
3. `.env.example` tanpa secret.
4. Unit test default, override, dan invalid value.
5. Tabel dokumen ini dan ringkasan README bila user-facing.
6. `CHANGELOG.md`.
