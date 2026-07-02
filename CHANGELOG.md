# Changelog

Semua perubahan penting pada proyek ini dicatat di file ini. Format mengikuti
Keep a Changelog dan versi mengikuti Semantic Versioning.

## Unreleased

### Added

- Dokumentasi developer lengkap pada `docs/`.
- `AGENTS.md` sebagai guardrail perubahan aman menggunakan Codex.
- Panduan kontribusi dan workflow dokumentasi perubahan.
- Pemeriksaan struktur/link dokumentasi pada quality gate dan contract test pada CI.
- Discovery upstream `GET /mcp/discovery` yang memeriksa `/health`, melakukan
  initialize, lalu mengambil tools/prompts/resources sesuai capability server.
- Endpoint `GET /prompts`, `POST /prompts/get`, `GET /resources`, dan
  `POST /resources/read` untuk memakai capability MCP selain tool call.
- Konfigurasi fallback `MCP_FALLBACK_POST_URL` dan `MCP_FALLBACK_STREAM_URL`,
  mode transport `MCP_TRANSPORT_MODE`, serta header auth upstream
  `MCP_AUTHORIZATION` dan `MCP_SECRET_*`.
- Endpoint `POST /plans/execute` untuk menerima plan backend web, resolve
  placeholder `result:*`, menjalankan step berurutan via MCP, berhenti pada fatal
  error pertama, dan menulis audit log per step.

### Changed

- Logging gateway kini mencakup lifecycle request, route, service, adapter MCP,
  readiness, dan startup/shutdown dengan metadata detail untuk debug tanpa
  menuliskan API key atau payload mentah.
- Adapter upstream memprioritaskan `MCP_SERVER_URL` (`/mcp`) dan fallback ke
  `POST /api/mcp` plus `GET /api/mcp/stream?sessionId=...` bila jalur utama tidak
  tersedia.
- Config runtime sekarang menerima alias `MCP_UPSTREAM_SECRET_HEADER` dan
  `MCP_UPSTREAM_SECRET` di samping `MCP_SECRET_HEADER`/`MCP_SECRET_VALUE`.
- `POST /plans/execute` untuk `page: aktivasi-service` kini menerima
  `workspaceId`, meng-inject `workspace_id`, membuat default `draft_name`,
  me-resolve `draft_id` bila tersedia, men-stringify identifier numerik, tidak
  lagi memaksa `draft_id` untuk `activation.add_device_to_topology` dan
  `activation.validate_draft`, memakai draft id kompatibilitas bila upstream
  tidak mengembalikan id yang bisa dipakai, serta mempertahankan kompatibilitas
  alias camelCase pada step arguments.
- `tabId` kini menjadi properti plan-level first-class dan diteruskan ke step
  activation saat caller mengisinya.
- Plan activation kini meneruskan `selectedService` dari payload create draft;
  probe live menunjukkan `selectedService: "dia_mix"` membuat
  `activation.validate_draft` lolos saat draft topology sudah terisi.
- Execution plan activation kini menerima nama tool baru
  `activation.add_device_to_topology`, memakai placeholder output live
  `result:device.search.data.data[0].device_id`, dan dapat fallback ke
  `topology.add_device` bila runtime allowlist legacy masih aktif.
- Default `ALLOWED_TOOLS` kini memasukkan whitelist MVP activation service:
  `activation.get_workspace_context`, `activation.create_draft`, `device.search`,
  `activation.add_device_to_topology`, `topology.add_device`, dan
  `activation.validate_draft`.
- Artefak deployment systemd kini mendokumentasikan runtime Node system-wide,
  user dedicated `mcp-gateway`, dan hardening tambahan agar tidak bergantung pada
  binary NVM di home directory operator.
- Hardening systemd mempertahankan `AF_NETLINK` agar startup Fastify tidak gagal
  saat enumerasi interface jaringan untuk log alamat listen.

## 1.0.0 - 2026-06-23

### Added

- Gateway REST-to-MCP berbasis Node.js 22 dan Fastify.
- Streamable HTTP MCP client dengan list tools dan generic tool call.
- Shortcut `simulate_router_path`.
- API key optional, tool allowlist, body limit, rate limit, dan concurrency guard.
- Liveness, readiness, Prometheus metrics, request ID, structured logging, dan
  graceful shutdown.
- Stable public error envelope tanpa raw upstream exception.
- Unit, integration, compatibility, transport contract, lifecycle, dan concurrency
  test.
- Dockerfile, Docker Compose, systemd unit, dan CI workflow.

### Fixed

- Custom `MCP_HOST_HEADER` diteruskan melalui Undici karena standard Node fetch
  menghitung ulang header Host.
- Rate-limit response dipetakan ke HTTP 429 yang stabil.
- Oversized body dipetakan ke HTTP 413 yang stabil.
- Koneksi keep-alive idle ditutup saat graceful shutdown.
- Response stream custom Host tidak menghasilkan asynchronous stream error.

### Compatibility

- Bentuk response sukses endpoint legacy dipertahankan.
- Tool-level error tetap HTTP 200 dengan `ok: false`.
- Empty structured result tetap fallback ke text seperti implementasi Python awal.
