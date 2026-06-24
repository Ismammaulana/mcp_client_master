# Indeks Dokumentasi Developer

Dokumentasi ini menjelaskan sistem aktual pada versi JavaScript. Mulai dari dokumen
yang sesuai kebutuhan:

| Dokumen | Kegunaan |
|---|---|
| [Arsitektur](architecture.md) | Komponen, dependency direction, lifecycle MCP, dan alur request |
| [API](api.md) | Kontrak endpoint, auth, response, dan error code |
| [Konfigurasi](configuration.md) | Semua environment variable, validasi, dan tuning |
| [Development](development.md) | Setup lokal, struktur repository, dan cara melakukan perubahan |
| [Testing](testing.md) | Test suite, quality gate, dan penambahan regression test |
| [Deployment](deployment.md) | Node process, Docker, Compose, systemd, dan rollback |
| [Operasional](operations.md) | Health, metrics, logging, alert, capacity, dan troubleshooting |
| [Keamanan](security.md) | Trust boundary, auth, allowlist, secret, dan hardening |
| [Runbook insiden MCP](runbooks/mcp-upstream-incident.md) | Penanganan timeout dan upstream unavailable |
| [ADR](adr/README.md) | Keputusan arsitektur dan trade-off |

Dokumen proyek tingkat root:

- `README.md`: quick start dan ringkasan operator.
- `AGENTS.md`: aturan wajib untuk Codex dan automation agent.
- `CONTRIBUTING.md`: workflow kontribusi manusia.
- `CHANGELOG.md`: perubahan release dan perubahan yang belum dirilis.
- `BLUEPRINT_REBUILD.md`: spesifikasi awal rekonstruksi dari aplikasi Python.

## Batas sistem

Gateway menerima REST JSON, membuka sesi MCP Streamable HTTP, melakukan handshake,
menjalankan operasi, lalu menormalisasi response. Gateway tidak menyimpan state dan
tidak mengimplementasikan tool atau MCP server.

## Menjaga dokumentasi tetap aktual

Setiap perubahan source harus mengikuti documentation impact matrix pada
`AGENTS.md`. Dokumentasi, test, dan changelog harus berada pada pull request yang
sama dengan perubahan runtime.
