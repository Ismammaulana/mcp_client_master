# Runbook: MCP Upstream Incident

## Trigger

Gunakan runbook ini bila terjadi:

- readiness failure;
- lonjakan `MCP_UPSTREAM_UNAVAILABLE`/502;
- lonjakan `MCP_UPSTREAM_TIMEOUT`/504;
- tool call latency mendekati timeout;
- abrupt disconnect atau invalid MCP response.

## Safety

- Jangan menampilkan API key atau raw secret pada terminal bersama/screenshot.
- Jangan menjalankan mutating tool sebagai diagnosis.
- Jangan menaikkan timeout/concurrency atau menambah retry sebelum penyebab diketahui.
- Pertahankan request ID dan timestamp untuk korelasi.

## Triage

1. Konfirmasi liveness:

   ```bash
   curl -i http://127.0.0.1:9100/health/live
   ```

2. Konfirmasi readiness dengan secret dari environment aman:

   ```bash
   curl -i -H "x-api-key: $API_KEY" \
     http://127.0.0.1:9100/health/ready
   ```

3. Catat HTTP status, error code, request ID, waktu, replica, dan release version.
4. Periksa apakah failure terjadi pada semua replica atau satu replica.
5. Periksa perubahan terbaru pada DNS, firewall, certificate, MCP deployment,
   `MCP_SERVER_URL`, atau `MCP_HOST_HEADER`.

## Diagnosis 502

`MCP_UPSTREAM_UNAVAILABLE` dapat berarti connect failure, protocol/handshake failure,
invalid response, atau disconnect.

Periksa:

- DNS resolve dan network route dari environment gateway.
- TCP/TLS connectivity tanpa mencetak credential URL.
- MCP endpoint path benar.
- Virtual host membutuhkan `MCP_HOST_HEADER`.
- Certificate/SNI sesuai bila HTTPS.
- MCP server log pada request ID/timestamp yang sama.
- SDK/protocol version setelah upgrade.

Jangan mengubah `MCP_HOST_HEADER` menjadi input caller.

## Diagnosis 504

`MCP_UPSTREAM_TIMEOUT` menunjukkan initialize atau operation melewati timeout.

Periksa:

- latency MCP server dan dependency tool;
- resource saturation pada MCP server;
- jumlah replica × `MCP_MAX_CONCURRENCY`;
- event-loop/CPU/memory gateway;
- apakah tool normalnya memang lebih lama dari configured timeout;
- network packet loss atau proxy timeout yang lebih rendah.

Naikkan timeout hanya bila SLO/tool behavior membenarkannya. Sinkronkan supervisor
termination grace period bila request timeout dinaikkan.

## Mitigasi

Urutan preferensi:

1. Rollback perubahan MCP/gateway/network yang jelas berkorelasi.
2. Pulihkan dependency upstream yang gagal.
3. Kurangi traffic atau nonaktifkan caller bermasalah pada ingress.
4. Turunkan concurrency gateway bila upstream overload.
5. Scale MCP hanya bila bottleneck dan capacity plan mendukung.
6. Scale gateway bila gateway sendiri saturated dan upstream masih punya kapasitas.

Jangan menambahkan automatic retry untuk generic tool call sebagai mitigasi cepat.

## Recovery verification

- `/health/live` tetap 200.
- `/health/ready` stabil 200 pada seluruh replica.
- 502/504 kembali ke baseline.
- P95/P99 latency normal.
- Tidak ada kenaikan 503 concurrency limit.
- Satu safe/read-only tool call berhasil bila test tool tersedia.
- Tidak ada restart atau connection leak setelah recovery.

## Escalation data

Kirim data yang telah disanitasi:

- incident start/end time dan timezone;
- gateway release/image tag;
- affected replica/region;
- public error code dan request ID;
- metric rate/latency;
- sanitized gateway dan MCP log;
- config values non-secret yang relevan;
- perubahan sebelum insiden.

## Post-incident

- Buat timeline dan root cause.
- Tambahkan regression/chaos test bila dapat direproduksi.
- Perbarui runbook, alert, docs, dan changelog.
- Buat ADR bila mitigation mengubah lifecycle/retry/session strategy.
