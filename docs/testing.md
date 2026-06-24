# Strategi Testing

## Prinsip

- Test normal harus offline, cepat, dan deterministik.
- Network contract test hanya membuka socket loopback.
- Tidak ada automated test yang menghubungi MCP produksi.
- Bug harus memiliki regression test.
- Mock digunakan untuk business/API behavior; transport nyata digunakan untuk
  handshake, header, stream, timeout, dan lifecycle.

## Perintah

```bash
npm test                 # unit, integration, compatibility; network suite di-skip
npm run test:contract    # real loopback MCP dan gateway lifecycle
npm run lint
npm run check            # lint + normal test
npm run test:watch
```

Baseline tervalidasi 2026-06-23:

- 32 normal tests.
- 10 network/transport contract tests.
- 100 concurrent liveness requests pada network suite.

Jumlah test dapat bertambah; jangan hard-code jumlah ini pada automation.

## Suite

### Unit

Lokasi `test/unit/`:

- Config default, override, dan invalid value.
- Structured/text result normalization dan legacy empty object behavior.
- Allowlist menolak tool sebelum upstream call.
- Concurrency gate fail-fast dan release.

Unit test tidak membuat Fastify server atau socket.

### Integration API

Lokasi `test/integration/` memakai `app.inject` dan fake MCP adapter:

- live/ready health semantics;
- auth enabled/disabled;
- request ID;
- validation, body limit, rate limit;
- allowlist sebelum adapter;
- error mapping dan redaction;
- metrics access.

Fastify injection menguji HTTP pipeline tanpa listen socket.

### Legacy contract

`test/contract/legacy-contract.test.js` membekukan response sukses dan compatibility:

- health legacy;
- list tools;
- generic call default arguments;
- shortcut exact arguments;
- validation status;
- tool-level error HTTP 200.

Perubahan test ini adalah perubahan kontrak, bukan refactor biasa.

### MCP transport contract

`test/contract/mcp-transport.test.js` menjalankan MCP server resmi lokal dan adapter
aktual. Coverage meliputi:

- initialize/list tools;
- structured result;
- tool-level error;
- SDK request timeout;
- custom Host header;
- abrupt disconnect;
- invalid upstream payload;
- real concurrency limit.

### Gateway network lifecycle

`test/contract/gateway-network.test.js` membuka Fastify socket untuk menguji:

- graceful close menunggu request aktif;
- concurrent liveness traffic tanpa failure.

## Memilih jenis test

| Perubahan | Test minimum |
|---|---|
| Pure parser/config/service | Unit |
| Route/auth/schema/error/metric | Integration + contract bila response berubah |
| Legacy response | Legacy contract + migration decision |
| MCP SDK/transport/header/stream/timeout | Transport contract |
| Listen/shutdown/socket/concurrency | Network lifecycle |
| Dependency | Seluruh suite + audit |
| Deployment | Config validation + image/service test bila tooling tersedia |

## Menulis regression test

1. Reproduksi failure dengan test yang gagal.
2. Pastikan test memeriksa outcome, bukan detail implementasi tidak penting.
3. Terapkan perbaikan minimal.
4. Jalankan suite terkait dan seluruh quality gate.
5. Catat bug dan perbaikan di changelog.

## Test timeout dan cleanup

- Selalu tutup Fastify app, HTTP server, MCP transport, dan agent.
- Jangan meninggalkan process background.
- Gunakan promise yang dikontrol test untuk operasi lambat.
- Jangan memakai sleep panjang untuk sinkronisasi bila event/promise tersedia.
- Test timeout harus menunjukkan deadlock nyata, bukan ditutupi dengan nilai sangat
  besar.

## Clean build verification

Sebelum release:

```bash
npm ci --no-audit --no-fund
npm run check
npm run test:contract
npm audit --audit-level=high
```

`npm ci` membuktikan `package-lock.json` cukup untuk instalasi deterministik.

## Batas test saat ini

- Tidak ada test ke MCP production.
- Image Docker belum dapat dibangun pada host tanpa container engine.
- Tidak ada soak test jangka panjang atau SLO performance formal.
- Tidak ada Kubernetes manifest/test.
- Tidak ada TLS/mTLS integration test karena TLS termination berada di luar gateway.

Jangan menyatakan batas tersebut telah diuji sampai environment yang sesuai tersedia.
