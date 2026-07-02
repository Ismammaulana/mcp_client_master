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
| GET | `/mcp/discovery` | Ya* | Ya | Cek `/health`, initialize, lalu discovery tools/prompts/resources |
| GET | `/tools` | Ya* | Ya | Daftar seluruh tool, termasuk pagination |
| GET | `/prompts` | Ya* | Ya | Daftar prompt bila capability tersedia |
| POST | `/prompts/get` | Ya* | Ya | Ambil prompt tertentu dengan arguments |
| GET | `/resources` | Ya* | Ya | Daftar resource bila capability tersedia |
| POST | `/resources/read` | Ya* | Ya | Baca resource tertentu |
| POST | `/tools/call` | Ya* | Ya | Generic allowed tool call |
| POST | `/plans/execute` | Ya* | Ya | Eksekusi plan step-by-step via MCP |
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

## GET /mcp/discovery

Endpoint bootstrap untuk caller yang ingin memakai gateway ini sebagai MCP client
langsung ke upstream master. Urutannya:

1. `GET` ke `MCP_HEALTH_URL`;
2. initialize MCP via `MCP_SERVER_URL`;
3. bila initialize gagal pada jalur utama, fallback ke
   `MCP_FALLBACK_POST_URL` dan `MCP_FALLBACK_STREAM_URL?sessionId=<id>` pada
   mode `auto`, atau langsung memakai fallback itu pada mode `fallback`;
4. panggil hanya capability yang diiklankan upstream pada initialize;
5. ambil `tools/list`, `prompts/list`, dan `resources/list` sesuai capability.

Response 200:

```json
{
  "status": "success",
  "discovery": {
    "health": {
      "ok": true,
      "status": 200,
      "body": "{\"status\":\"ok\"}"
    },
    "transport": {
      "mode": "primary",
      "primaryUrl": "http://mcp-server:9200/mcp",
      "activePostUrl": "http://mcp-server:9200/mcp",
      "activeStreamUrl": "http://mcp-server:9200/mcp"
    },
    "server": {
      "info": { "name": "master-mcp", "version": "1.0.0" },
      "instructions": "Use only discovered capabilities.",
      "capabilities": {
        "tools": {},
        "prompts": {},
        "resources": {}
      }
    },
    "session": {
      "id": "session-123"
    },
    "tools": [],
    "prompts": [],
    "resources": []
  }
}
```

Session ID hanya berlaku untuk operasi MCP pada koneksi tersebut. Gateway tetap
stateless per request; jangan mengasumsikan session reuse antar request REST.

## GET /prompts

Memanggil `prompts/list` hanya bila capability `prompts` diiklankan server. Bila
server tidak mengiklankan capability ini, response tetap 200 dengan array kosong.

Response 200:

```json
{
  "status": "success",
  "prompts": [
    {
      "name": "router-brief",
      "description": "Build a short router brief",
      "arguments": [
        { "name": "topic", "required": true }
      ]
    }
  ]
}
```

## POST /prompts/get

Request:

```json
{
  "name": "router-brief",
  "arguments": {
    "topic": "edge latency"
  }
}
```

Response 200:

```json
{
  "status": "success",
  "prompt_name": "router-brief",
  "prompt": {
    "messages": [
      {
        "role": "user",
        "content": {
          "type": "text",
          "text": "Create a router brief about edge latency."
        }
      }
    ]
  }
}
```

## GET /resources

Memanggil `resources/list` hanya bila capability `resources` diiklankan server.
Bila tidak ada capability, response tetap 200 dengan array kosong.

Response 200:

```json
{
  "status": "success",
  "resources": [
    {
      "name": "session-context",
      "uri": "agent://session/session-123/resource/context",
      "description": "Current session context",
      "mimeType": "application/json"
    }
  ]
}
```

Untuk resource kontekstual session, gunakan URI yang memang dikembalikan server
atau yang dirujuk instruksi upstream, mis. `agent://session/<sessionId>/resource/*`.
Jangan mengarang URI yang tidak muncul dari discovery atau dokumentasi server.

## POST /resources/read

Request:

```json
{
  "uri": "agent://session/session-123/resource/context"
}
```

Response 200:

```json
{
  "status": "success",
  "resource": {
    "contents": [
      {
        "uri": "agent://session/session-123/resource/context",
        "text": "{\"session\":\"session-123\"}",
        "mimeType": "application/json"
      }
    ]
  }
}
```

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

## POST /plans/execute

Menerima plan dari backend web dan menjalankan semua step secara berurutan melalui
MCP server. Route ini tidak mengeksekusi logic tool lokal. Semua step:

1. divalidasi terhadap `ALLOWED_TOOLS`;
2. menerima `arguments` yang dapat memakai placeholder `result:<path>`;
3. dieksekusi satu per satu;
4. berhenti pada fatal error pertama;
5. menghasilkan audit log per step pada logger gateway.

MVP whitelist yang diharapkan:

- `activation.get_workspace_context`
- `activation.create_draft`
- `device.search`
- `activation.add_device_to_topology`
- `topology.add_device`
- `activation.validate_draft`

Request:

```json
{
  "planId": "plan-activation-001",
  "sessionId": "sess-123",
  "page": "aktivasi-service",
  "workspaceId": "ws-123",
  "tabId": "default",
  "steps": [
    {
      "id": "step-1",
      "tool": "activation.get_workspace_context",
      "arguments": {
        "sessionId": "sess-123",
        "include": ["workspace", "draft"]
      }
    },
    {
      "id": "step-2",
      "tool": "device.search",
      "arguments": {
        "query": "router-a"
      }
    },
    {
      "id": "step-3",
      "tool": "activation.create_draft",
      "arguments": {
        "serviceType": "service",
        "selectedService": "dia_mix"
      }
    },
    {
      "id": "step-4",
      "tool": "activation.add_device_to_topology",
      "arguments": {
        "deviceId": "result:device.search.data.data[0].device_id",
        "role": "intermediate",
        "position": { "x": 10, "y": 20 }
      }
    }
  ]
}
```

Response 200 sukses:

```json
{
  "planId": "plan-activation-001",
  "status": "success",
  "steps": [
    {
      "id": "step-1",
      "tool": "activation.get_workspace_context",
      "status": "success",
      "result": {
        "tool": "activation.get_workspace_context",
        "arguments": {
          "sessionId": "sess-123",
          "session_id": "sess-123",
          "include": ["workspace", "draft"],
          "workspace_id": "ws-123"
        },
        "content": [
          { "type": "text", "text": "workspace loaded" }
        ],
        "structured_content": {
          "workspace_id": "ws-123",
          "draft_id": "draft-existing"
        },
        "parsed_result": {
          "ok": true,
          "mode": "structured",
          "data": {
            "workspace_id": "ws-123",
            "draft_id": "draft-existing"
          }
        }
      }
    },
    {
      "id": "step-3",
      "tool": "activation.create_draft",
      "status": "success",
      "result": {
        "tool": "activation.create_draft",
        "arguments": {
          "serviceType": "service",
          "service_type": "service",
          "workspace_id": "ws-123",
          "draft_name": "Draft service 2026-06-29T07:00:00.000Z"
        },
        "structured_content": {
          "draftId": "draft-1"
        }
      }
    }
  ],
  "summary": {
    "message": "Plan executed 4 step(s) successfully"
  }
}
```

Response 200 bila step gagal fatal:

```json
{
  "planId": "plan-activation-002",
  "status": "failed",
  "steps": [
    {
      "tool": "device.search",
      "status": "failed",
      "result": {
        "tool": "activation.create_draft",
        "arguments": {
          "workspace_id": "ws-123"
        },
        "error": {
          "code": "PLAN_ARGUMENTS_INVALID",
          "message": "Step 'activation.create_draft' on page 'aktivasi-service' is missing required arguments after normalization: service_type, draft_name",
          "fatal": true
        }
      }
    },
    {
      "tool": "activation.validate_draft",
      "status": "skipped",
      "result": null
    }
  ],
  "summary": {
    "message": "Plan stopped at step 1 because PLAN_ARGUMENTS_INVALID"
  }
}
```

Catatan:

- Placeholder hanya dapat merujuk hasil step yang sudah selesai.
- Namespace placeholder mengikuti nama tool dan shape output live, mis.
  `result:device.search.data.data[0].device_id`.
- Untuk `page: "aktivasi-service"`, gateway menambahkan `workspace_id` dari
  `workspaceId` request bila step activation/device/topology belum mengisinya
  dan meneruskan `tabId` plan-level ke step activation bila caller mengirimnya.
- Untuk `activation.create_draft`, gateway membuat `draft_name` default
  `Draft <service_type> <timestamp>` bila `service_type` ada tetapi `draft_name`
  belum dikirim, dan meneruskan `selectedService` serta `tabId` bila caller
  mengisinya.
- Untuk `activation.add_device_to_topology`, `topology.add_device`, dan
  `activation.validate_draft`, gateway mencoba mengisi `draft_id` dari hasil
  `activation.create_draft` atau `activation.get_workspace_context` bila ada,
  tetapi tidak lagi memblokir step jika nilai itu kosong. Bila upstream
  `create_draft` tidak mengembalikan id yang bisa dipakai, gateway memakai
  nilai kompatibilitas internal agar placeholder plan tetap bisa lanjut.
- Bila `activation.add_device_to_topology` diminta tetapi runtime allowlist hanya
  memuat `topology.add_device`, gateway memakai alias legacy itu sebagai fallback
  execution tool agar contract plan baru tetap dapat dieksekusi.
- Alias camelCase seperti `workspaceId`, `sessionId`, `serviceType`, `draftName`,
  dan `deviceId` tetap diterima untuk kompatibilitas plan lama pada page ini.
- Bila placeholder tidak dapat di-resolve, step gagal dengan code
  `PLACEHOLDER_RESOLUTION_FAILED`.
- Bila required argument masih kurang setelah normalisasi, step gagal lokal di
  gateway dengan code `PLAN_ARGUMENTS_INVALID` dan MCP server tidak dipanggil.

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
