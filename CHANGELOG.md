# Changelog

Semua perubahan penting pada proyek ini dicatat di file ini. Format mengikuti
Keep a Changelog dan versi mengikuti Semantic Versioning.

## Unreleased

### Added

- Dokumentasi developer lengkap pada `docs/`.
- `AGENTS.md` sebagai guardrail perubahan aman menggunakan Codex.
- Panduan kontribusi dan workflow dokumentasi perubahan.
- Pemeriksaan struktur/link dokumentasi pada quality gate dan contract test pada CI.

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
