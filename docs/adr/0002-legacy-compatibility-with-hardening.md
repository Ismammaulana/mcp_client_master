# ADR 0002: Legacy Compatibility dengan Production Hardening

- Status: Accepted
- Date: 2026-06-23

## Context

Consumer lama menggunakan endpoint dan success response aplikasi Python. Rebuild
JavaScript juga harus mengatasi generic unauthenticated tool execution, raw error
leak, unbounded request, dan tidak adanya observability.

Compatibility penuh dan security penuh saling bertentangan pada failure/auth
behavior.

## Decision

Pertahankan endpoint dan bentuk response sukses legacy, termasuk:

- tool-level error HTTP 200 dengan `ok: false`;
- Python-style empty structured content fallback;
- shortcut response shape;
- compatibility `/health`.

Tambahkan hardening yang boleh mengubah failure/access behavior:

- optional static API key (wajib diisi production);
- exact tool allowlist;
- stable error envelope tanpa raw exception;
- rate/body/concurrency limit;
- live/ready health dan metrics;
- request ID dan log redaction.

## Consequences

- Consumer sukses tetap kompatibel.
- Consumer harus menangani 401/403/413/429/502/503/504 typed errors.
- Legacy `/health` dan `/simulate-path` masih mengekspos MCP URL.
- Semantik tool-level error tetap mudah disalahartikan.

## Alternatives considered

- Compatibility 100% termasuk raw error dan unauthenticated call ditolak karena
  risiko security.
- Breaking replacement langsung ditolak karena tidak ada migration agreement.
- API v2 direkomendasikan untuk menghapus legacy semantics di masa depan.

## Validation

Legacy contract test membekukan success behavior. Integration/security test
memverifikasi auth, allowlist, redaction, error mapping, dan resource controls.
