# Codex Working Agreement

## Scope

Instruksi ini berlaku untuk seluruh repository. Tujuannya menjaga perubahan oleh
Codex tetap aman, dapat diuji, kompatibel, dan terdokumentasi.

Repository ini hanya berisi REST-to-MCP client gateway. Jangan menambahkan MCP
server produksi, implementasi tool, database, frontend, reverse proxy, atau data
topologi ke repository ini tanpa keputusan arsitektur eksplisit dari pemilik
sistem.

## Source of truth

Gunakan urutan berikut bila dokumen berbeda:

1. Contract test pada `test/contract/` untuk perilaku API dan MCP yang sengaja
   dipertahankan.
2. Source pada `src/` untuk implementasi runtime aktual.
3. `docs/adr/` untuk keputusan arsitektur yang telah diterima.
4. Dokumentasi pada `docs/` dan `README.md`.
5. `BLUEPRINT_REBUILD.md` sebagai konteks awal rekonstruksi.

Jangan mengubah contract test hanya agar implementasi yang rusak menjadi lulus.
Perubahan kontrak memerlukan persetujuan pemilik sistem, penjelasan breaking
change, test baru, dokumentasi migrasi, dan entri changelog.

## Mandatory workflow

Sebelum mengubah file:

1. Baca `README.md`, `docs/README.md`, file source terkait, test terkait, dan ADR
   yang relevan.
2. Periksa status Git. Jangan menimpa perubahan pengguna yang tidak berkaitan.
3. Nyatakan asumsi bila keputusan bisnis atau keamanan belum tersedia.
4. Buat perubahan terkecil yang menyelesaikan masalah.

Setelah mengubah file:

1. Tambahkan atau perbarui test yang membuktikan perubahan.
2. Perbarui dokumentasi yang terdampak sesuai matriks di bawah.
3. Tambahkan entri pada `CHANGELOG.md` di bagian `Unreleased`.
4. Jalankan quality gate yang relevan.
5. Laporkan hasil test dan hal yang belum dapat diverifikasi.

Tidak ada perubahan source yang dianggap selesai bila dokumentasi pengguna atau
developer menjadi tidak sesuai dengan runtime.

## Required quality gates

Untuk semua perubahan JavaScript:

```bash
npm run lint
npm test
```

Untuk adapter MCP, lifecycle jaringan, timeout, Host header, concurrency, atau
shutdown:

```bash
npm run test:contract
```

Untuk dependency:

```bash
npm ci
npm audit --audit-level=high
npm run check
npm run test:contract
```

Untuk deployment, validasi juga Dockerfile, Compose, dan systemd bila tool tersedia.
Jangan mengklaim image berhasil dibangun bila container engine tidak tersedia.

## Documentation impact matrix

| Perubahan | Dokumentasi wajib diperbarui |
|---|---|
| Endpoint, request, response, status, auth | `docs/api.md`, contract test, `CHANGELOG.md` |
| Environment variable/default/limit | `.env.example`, `docs/configuration.md`, `README.md`, config test |
| Modul, dependency direction, lifecycle | `docs/architecture.md`, ADR bila keputusan signifikan |
| Cara development atau script npm | `docs/development.md`, `docs/testing.md`, `README.md` |
| Docker, Compose, systemd, port | `docs/deployment.md`, artefak `deploy/`, `CHANGELOG.md` |
| Log, metric, alert, health, incident | `docs/operations.md`, runbook terkait |
| Auth, allowlist, secret, header, exposure | `docs/security.md`, security test, `CHANGELOG.md` |
| Dependency production | `package.json`, `package-lock.json`, `docs/architecture.md` bila perannya baru |

Jika perubahan memperkenalkan keputusan jangka panjang atau trade-off arsitektur,
buat ADR baru dengan nomor berurutan pada `docs/adr/`.

## Protected behavior

- `/health/live` tidak boleh memanggil MCP upstream.
- `/health/ready` harus melakukan handshake upstream dengan timeout.
- Request ke route MCP harus ditolak sebelum adapter dipanggil bila API key salah.
- `/tools/call` hanya boleh menjalankan tool pada `ALLOWED_TOOLS`.
- Raw exception, API key, authorization header, dan secret tidak boleh masuk response
  publik atau log.
- Timeout harus dipetakan ke HTTP 504; upstream unavailable ke HTTP 502.
- Tool-level `isError=true` tetap HTTP 200 pada kontrak legacy sampai ada keputusan
  versi API baru.
- Empty `structuredContent` tetap memakai fallback text pada kontrak legacy.
- `MCP_HOST_HEADER` harus diuji melalui transport nyata bila implementasinya berubah.
- Setiap operasi MCP membuat client/session baru; jangan mengaktifkan session reuse
  tanpa bukti concurrency dan lifecycle dari SDK/upstream.
- Jangan menambahkan retry untuk tool call. Retry dapat menggandakan side effect.

## Security rules

- Jangan commit `.env`, credential, token, private key, alamat internal sensitif,
  dump log, atau payload produksi.
- Production harus mengisi `API_KEY`; mode kosong hanya untuk development lokal.
- Penambahan tool ke allowlist memerlukan review kemampuan dan klasifikasi
  read-only/mutating.
- Gunakan constant-time comparison untuk API key.
- Jangan melemahkan body limit, rate limit, timeout, concurrency guard, redaction,
  atau container hardening tanpa alasan dan test.
- Jangan mengembalikan `error.cause`, stack trace, socket error, atau URL upstream
  berisi credential.

## Dependency rules

- Gunakan versi exact pada `package.json` dan commit `package-lock.json`.
- Pakai SDK MCP resmi untuk protokol; jangan membuat JSON-RPC MCP manual tanpa ADR.
- Dependency baru harus memiliki fungsi jelas, kompatibel dengan Node 22, dan lolos
  audit.
- Jangan menjalankan `npm audit fix --force` atau upgrade major otomatis.

## Testing rules

- Test normal harus offline dan memakai dependency injection/fake adapter.
- Test contract boleh membuka socket loopback dan dijalankan melalui
  `npm run test:contract`.
- Jangan menghubungi MCP produksi dari automated test.
- Test harus deterministik: jangan bergantung pada DNS eksternal, clock wall time,
  atau urutan test.
- Untuk bug, tambahkan regression test yang gagal sebelum perbaikan.

## Documentation style

- Gunakan Bahasa Indonesia yang teknis dan langsung; pertahankan identifier/code
  dalam Bahasa Inggris.
- Contoh harus dapat disalin dan tidak boleh berisi secret nyata.
- Tulis kondisi default, failure mode, dan konsekuensi keamanan secara eksplisit.
- Gunakan tanggal `YYYY-MM-DD` dan Semantic Versioning pada release.
- Jangan mendokumentasikan fitur yang belum ada sebagai fitur aktif; tandai sebagai
  rencana atau batasan.

## Completion checklist

- [ ] Scope perubahan sesuai repository.
- [ ] Test/regression test ditambahkan atau alasan tidak perlu dicatat.
- [ ] `npm run check` lulus.
- [ ] Contract test lulus bila networking/MCP terdampak.
- [ ] Audit dependency lulus bila dependency berubah.
- [ ] Dokumentasi pada matriks dampak diperbarui.
- [ ] `CHANGELOG.md` diperbarui.
- [ ] Tidak ada secret atau artefak lokal baru.
- [ ] Risiko dan verifikasi yang belum dilakukan dilaporkan.
