# Architecture Decision Records

ADR mencatat keputusan yang memengaruhi struktur, keamanan, compatibility, atau
operasional jangka panjang.

## Status

- Proposed: sedang direview.
- Accepted: menjadi aturan aktif.
- Superseded: diganti ADR lain.
- Rejected: tidak digunakan, disimpan sebagai konteks.

## Daftar

| ADR | Status | Keputusan |
|---|---|---|
| [0001](0001-stateless-session-per-operation.md) | Accepted | Stateless gateway dan MCP session per operation |
| [0002](0002-legacy-compatibility-with-hardening.md) | Accepted | Pertahankan success contract legacy dengan hardening |
| [0003](0003-custom-host-header-transport.md) | Accepted | Undici untuk custom Host header |

## Template ADR baru

```markdown
# ADR NNNN: Judul

- Status: Proposed
- Date: YYYY-MM-DD

## Context

## Decision

## Consequences

## Alternatives considered

## Validation
```

Gunakan nomor berurutan. Jangan mengedit hasil keputusan lama untuk menyembunyikan
perubahan; buat ADR baru dan tandai ADR sebelumnya `Superseded`.
