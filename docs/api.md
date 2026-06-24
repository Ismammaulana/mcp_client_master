# Referensi API

## Konvensi umum

Base URL default:

```text
http://<gateway-host>:9100
```

Route yang berinteraksi dengan MCP serta `/metrics` memerlukan header berikut bila
`API_KEY` dikonfigurasi:

```http
x-api-key: <configured API_KEY>
```

Semua response menyertakan `x-request-id`. Caller boleh mengirim
`x-request-id` sendiri dengan panjang maksimum 128 karakter; nilai lebih panjang
diganti UUID baru.

Request JSON harus memakai:

```http
content-type: application/json
```

## Ringkasan endpoint

| Method | Path | Auth | MCP call | Keterangan |
|---|---|---:|---:|---|
| GET | `/health` | Tidak | Tidak | Compatibility health; deprecated |
| GET | `/health/live` | Tidak | Tidak | Process liveness |
| GET | `/health/ready` | Ya* | Ya | MCP initialize probe |
| GET | `/tools` | Ya* | Ya | Daftar seluruh tool, termasuk pagination |
| POST | `/tools/call` | Ya* | Ya | Generic allowed tool call |
| POST | `/simulate-path` | Ya* | Ya | Shortcut router simulation |
| GET | `/metrics` | Ya* | Tidak | Prometheus exposition |

`Ya*` berarti auth diwajibkan hanya bila `API_KEY` tidak kosong. Production tidak
boleh menggunakan API key kosong.

## GET /health

Endpoint compatibility. Tidak menguji upstream dan tetap `ok` saat MCP server mati.

Response 200:

```json
{
  "status": "ok",
  "service": "mcp-client-gateway",
  "mcp_server_url": "http://mcp-server:9200/mcp",
  "mcp_host_header": null
}
```

Endpoint ini mengekspos konfigurasi upstream dan dipertahankan hanya untuk consumer
lama. Gunakan `/health/live` pada deployment baru dan batasi `/health` di reverse
proxy bila informasinya sensitif.

## GET /health/live

Liveness process tanpa dependency eksternal.

Response 200:

```json
{
  "status": "ok",
  "service": "mcp-client-master-gateway"
}
```

Gunakan untuk container/systemd liveness. Jangan gunakan readiness sebagai
liveness karena outage MCP dapat menyebabkan restart loop gateway yang sehat.

## GET /health/ready

Membuat MCP client/session dan menyelesaikan initialize handshake. Tidak memanggil
tool.

Response 200:

```json
{
  "status": "ready",
  "service": "mcp-client-master-gateway"
}
```

Failure umum: 401, 429, 502, 503, atau 504.

## GET /tools

Memanggil MCP `tools/list` dan mengikuti semua cursor pagination.

Response 200:

```json
{
  "status": "success",
  "tools": [
    {
      "name": "simulate_router_path",
      "description": "Simulate a router path",
      "inputSchema": {
        "type": "object",
        "properties": {
          "source": { "type": "string" },
          "destination": { "type": "string" }
        }
      }
    }
  ]
}
```

Daftar ini tidak difilter berdasarkan `ALLOWED_TOOLS`. Discovery menunjukkan
kemampuan upstream, sedangkan execution tetap dibatasi service allowlist.

## POST /tools/call

Memanggil tool generic. Nama tool harus terdapat pada `ALLOWED_TOOLS`.

Request:

```json
{
  "name": "simulate_router_path",
  "arguments": {
    "source": "router-a",
    "destination": "router-b"
  }
}
```

Validasi:

- `name`: string, minimal satu karakter, wajib.
- `arguments`: JSON object, opsional, default `{}`.
- Property top-level selain `name` dan `arguments` ditolak.
- Gateway tidak memvalidasi schema bisnis arguments; MCP server melakukannya.

Response 200 dengan structured result:

```json
{
  "status": "success",
  "tool_name": "simulate_router_path",
  "ok": true,
  "content": [
    { "type": "text", "text": "path calculated" }
  ],
  "structured_content": {
    "path": ["router-a", "router-b"]
  },
  "parsed_result": {
    "ok": true,
    "mode": "structured",
    "data": {
      "path": ["router-a", "router-b"]
    }
  }
}
```

Tool-level error tetap response 200 pada kontrak legacy:

```json
{
  "status": "success",
  "tool_name": "simulate_router_path",
  "ok": false,
  "content": [
    { "type": "text", "text": "router not found" }
  ],
  "structured_content": null,
  "parsed_result": {
    "ok": false,
    "mode": "text",
    "data": { "texts": ["router not found"] }
  }
}
```

Consumer wajib memeriksa `ok`, bukan hanya HTTP status atau `status`.

## POST /simulate-path

Shortcut yang selalu memanggil `simulate_router_path`.

Request:

```json
{
  "source": "router-a",
  "destination": "router-b"
}
```

Validasi:

- Kedua field wajib berupa string minimal satu karakter.
- Property lain ditolak.
- Whitespace-only tetap diterima demi compatibility; validasi bisnis berada di tool.

Response 200:

```json
{
  "status": "success",
  "gateway": "mcp-client-gateway",
  "mcp_server_url": "http://mcp-server:9200/mcp",
  "result": {
    "ok": true,
    "mode": "structured",
    "data": {
      "path": ["router-a", "router-b"]
    }
  }
}
```

Endpoint legacy ini mengekspos URL upstream dan tidak mengirim content asli non-text.

## GET /metrics

Mengembalikan Prometheus text exposition. Endpoint memerlukan auth bila API key
aktif.

```bash
curl -H 'x-api-key: ...' http://localhost:9100/metrics
```

Daftar metric dijelaskan pada `operations.md`.

## Error envelope

Semua gateway/transport failure memakai bentuk:

```json
{
  "error": {
    "code": "MCP_UPSTREAM_TIMEOUT",
    "message": "MCP server did not respond in time",
    "request_id": "e829c7f7-6aa4-48ac-b82d-9e791a8f43b7"
  }
}
```

| HTTP | Code | Penyebab |
|---:|---|---|
| 401 | `UNAUTHORIZED` | API key hilang atau salah |
| 403 | `TOOL_NOT_ALLOWED` | Tool tidak ada pada allowlist |
| 413 | `REQUEST_TOO_LARGE` | Body melewati limit |
| 422 | `VALIDATION_ERROR` | JSON body tidak sesuai schema route |
| 429 | `RATE_LIMIT_EXCEEDED` | Rate limit per process/client tercapai |
| 502 | `MCP_UPSTREAM_UNAVAILABLE` | Connect, protocol, payload, atau disconnect failure |
| 503 | `MCP_CONCURRENCY_LIMIT` | Operasi MCP aktif mencapai limit |
| 504 | `MCP_UPSTREAM_TIMEOUT` | Connect/request timeout |
| 500 | `INTERNAL_ERROR` | Error gateway tidak terduga |

Raw cause dan stack trace hanya boleh berada di log internal; tidak dikirim ke
caller.

## Rate-limit headers

Response dapat menyertakan header:

```text
x-ratelimit-limit
x-ratelimit-remaining
x-ratelimit-reset
retry-after
```

Rate limit bersifat local process, bukan distributed quota.

## Compatibility policy

Response sukses legacy dipertahankan oleh `test/contract/legacy-contract.test.js`.
Perubahan breaking harus menggunakan versi API baru atau migration plan yang
disetujui. Hardening yang sengaja berbeda dari Python lama adalah auth optional,
allowlist, typed error envelope, rate/body/concurrency limit, dan redaction.
