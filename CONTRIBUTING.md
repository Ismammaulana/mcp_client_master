# Panduan Kontribusi

## Alur kerja

1. Buat branch dari baseline yang telah lulus CI.
2. Baca `AGENTS.md` dan dokumentasi domain yang akan diubah.
3. Implementasikan perubahan kecil dan terfokus.
4. Tambahkan test serta dokumentasi dalam perubahan yang sama.
5. Perbarui `CHANGELOG.md` pada bagian `Unreleased`.
6. Jalankan quality gate sebelum membuka review.

```bash
npm ci
npm run check
npm run test:contract
```

Contract test membuka socket loopback. Test tersebut tidak mengakses MCP server
produksi.

## Pull request

Deskripsi perubahan minimum harus memuat:

- masalah dan hasil yang diinginkan;
- perubahan kontrak API atau konfigurasi;
- risiko keamanan dan kompatibilitas;
- test yang dijalankan beserta hasilnya;
- dokumentasi yang diperbarui;
- prosedur deployment dan rollback bila runtime berubah.

Breaking change tidak boleh disisipkan pada endpoint legacy. Ajukan versi API baru
atau migration plan dan tunggu persetujuan pemilik sistem.

## Commit

Gunakan commit yang atomik dan deskriptif. Jangan memasukkan `.env`, `node_modules`,
coverage, log, atau file editor.

Contoh pesan:

```text
fix(mcp): preserve custom host header in streamable transport
docs(api): document readiness failure responses
test(security): cover API key redaction
```
