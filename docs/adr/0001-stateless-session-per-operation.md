# ADR 0001: Stateless Gateway dan MCP Session per Operation

- Status: Accepted
- Date: 2026-06-23

## Context

Gateway perlu menerjemahkan request REST independen menjadi operasi MCP. Lifecycle
dan concurrency session reuse pada MCP upstream belum memiliki jaminan yang cukup,
sedangkan aplikasi awal Python membuat session baru untuk setiap operasi.

## Decision

Gateway tetap stateless dan membuat MCP client, Streamable HTTP transport, serta
session baru untuk setiap list, call, atau readiness probe. Client selalu ditutup
pada `finally`.

Concurrency dibatasi per process untuk melindungi upstream.

## Consequences

Positif:

- Lifecycle sederhana dan terisolasi per request.
- Tidak ada shared session race atau stale session state.
- Horizontal scaling tidak memerlukan shared state/sticky session.
- Failure satu session tidak mengotori request berikutnya.

Negatif:

- Initialize handshake menambah latency setiap operasi.
- Lebih banyak connection/session churn.
- Readiness juga membuat session singkat.

## Alternatives considered

- Shared client/session global: lebih efisien tetapi membutuhkan bukti thread-safe,
  reconnect semantics, session expiry, dan upstream concurrent session behavior.
- Session pool: menambah lifecycle/health complexity dan belum dibutuhkan.

## Validation

Transport contract test memverifikasi initialize, list, call, close, timeout,
disconnect, dan concurrency. Session reuse hanya boleh diusulkan melalui ADR baru
dengan load test dan connection-leak verification.
