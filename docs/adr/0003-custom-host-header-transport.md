# ADR 0003: Undici untuk Custom Host Header

- Status: Accepted
- Date: 2026-06-23

## Context

Sebagian deployment mengakses MCP melalui alamat IP/internal endpoint tetapi harus
mengirim virtual `Host`. Standard Node fetch menghitung ulang forbidden Host header,
sehingga setting header pada fetch wrapper tidak benar-benar diterima upstream.

## Decision

- Tanpa `MCP_HOST_HEADER`, gunakan standard fetch.
- Dengan `MCP_HOST_HEADER`, gunakan `undici.request` dan adaptasikan response ke Web
  `Response` untuk MCP SDK.
- Host hanya berasal dari validated operator configuration.
- Pertahankan timeout abort signal pada kedua jalur.

## Consequences

- Virtual-host routing bekerja dan dibuktikan pada real loopback transport test.
- Ada dua jalur HTTP yang wajib dipelihara.
- Undici menjadi direct production dependency.
- Redirect behavior jalur Undici tidak disamakan secara otomatis dengan standard
  fetch; MCP endpoint sebaiknya memakai final URL tanpa redirect.

## Alternatives considered

- Standard fetch dengan `headers.set("host")`: tidak bekerja pada runtime aktual.
- Mengubah DNS/upstream route: lebih bersih tetapi tidak selalu berada dalam kontrol
  gateway team.
- HTTPX/Python sidecar: menambah komponen dan ditolak.

## Validation

`mcp-transport.test.js` memverifikasi upstream menerima exact configured Host dan
memastikan response stream tidak menghasilkan asynchronous controller error.
