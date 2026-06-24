# Panduan Development

## Prasyarat

- Node.js 22 atau lebih baru.
- npm yang kompatibel dengan lockfile repository.
- MCP server hanya diperlukan untuk manual integration; test otomatis memakai fake
  server lokal.

## Setup

```bash
cd /opt/CLIENT_MASTER/mcp_client_master_gateway
cp .env.example .env
npm ci
npm run check
npm run test:contract
npm run dev
```

`npm run dev` memakai Node watch mode. Jangan memakai credential production pada
`.env` developer.

## Struktur repository

```text
.
├── src/
│   ├── server.js                  # process entrypoint dan signal handling
│   ├── app.js                     # app factory dan composition root
│   ├── config.js                  # env validation
│   ├── api/                       # HTTP/auth/schema/error mapping
│   ├── domain/                    # typed errors dan result normalization
│   ├── services/                  # use case dan allowlist
│   └── infrastructure/            # MCP adapter, metrics, concurrency
├── test/
│   ├── unit/
│   ├── integration/
│   └── contract/
├── docs/                          # developer dan operator documentation
├── deploy/                        # Compose dan systemd
├── Dockerfile
├── AGENTS.md
├── CONTRIBUTING.md
└── CHANGELOG.md
```

## Dependency direction

Pertahankan arah berikut:

```text
api -> services -> domain
                 -> infrastructure interface/adapter instance
infrastructure -> domain
app -> seluruh concrete dependency untuk composition
```

Hindari route mengimpor MCP SDK. SDK hanya boleh digunakan oleh adapter
infrastructure.

## Dependency injection

Test membuat app dengan fake adapter:

```js
const app = await createApp(config, {
  mcpClient: {
    probe: async () => undefined,
    listTools: async () => ({ tools: [] }),
    callTool: async () => ({ content: [] }),
  },
  logger: false,
});
```

Jangan monkey-patch module global bila dependency dapat di-inject.

## Menambah endpoint shortcut

1. Tentukan apakah endpoint benar-benar diperlukan atau generic `/tools/call` cukup.
2. Tambahkan request schema dengan `additionalProperties: false`.
3. Tambahkan method use case pada `ToolService`.
4. Pastikan tool tetap melalui `assertAllowed`.
5. Tambahkan unit test argumen exact dan API contract test.
6. Dokumentasikan endpoint pada `docs/api.md`.
7. Perbarui allowlist example hanya setelah security review.

Jangan memasukkan business logic tool ke gateway.

## Menambah error baru

Tambahkan subclass `GatewayError` dengan code publik stabil dan HTTP status. Pastikan
raw cause hanya diteruskan melalui `Error` options untuk logging internal, bukan
response. Tambahkan integration test yang memastikan detail sensitif tidak bocor.

## Mengubah MCP adapter

Perubahan adapter memiliki risiko tinggi karena mock dapat lulus sementara protocol
rusak. Wajib:

- baca API SDK versi yang terkunci;
- pertahankan initialize handshake dan close pada `finally`;
- gunakan timeout eksplisit;
- jalankan `npm run test:contract`;
- tambahkan regression test untuk header/stream/error/lifecycle yang diubah;
- jangan menambah retry generic call;
- dokumentasikan perubahan lifecycle pada `architecture.md`.

## Menambah dependency

```bash
npm install --save-exact <package>
npm audit --audit-level=high
npm run check
npm run test:contract
```

Jelaskan tujuan dependency dalam review. Jangan mengedit lock file manual.

## Dokumentasi sebagai bagian Definition of Done

Ikuti matriks pada `AGENTS.md`. Minimum setiap perubahan runtime:

- test atau regression test;
- dokumentasi kontrak/config/operasi yang terdampak;
- entri `CHANGELOG.md` pada `Unreleased`;
- hasil quality gate.

Keputusan arsitektur jangka panjang dicatat sebagai ADR baru, bukan hanya komentar
source atau chat.

## Manual test

```bash
npm start
curl -i http://127.0.0.1:9100/health/live
curl -i -H 'x-api-key: local-development-only' \
  http://127.0.0.1:9100/health/ready
```

Gunakan MCP test environment, bukan production, untuk manual tool call.

## Review checklist

- Perubahan berada pada layer yang benar.
- Auth, allowlist, timeout, dan error mapping tidak terlewati.
- Contract legacy tidak berubah tanpa keputusan.
- Test normal tidak mengakses jaringan eksternal.
- Dokumentasi dan changelog sesuai runtime.
- Tidak ada secret, `.env`, `node_modules`, log, atau coverage yang ter-commit.
