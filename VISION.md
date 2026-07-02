# Product vision

Birdclaw is a local-first Twitter memory and operator console. The durable local archive is the product; live transports and AI improve that archive without becoming required read paths.

## Product order

1. Preserve complete, attributable data in SQLite with deterministic backups.
2. Make local search, timelines, and structured CLI output fast and useful offline.
3. Refresh through bounded, observable, resumable live reads.
4. Layer triage and AI workflows over stored source material with citations.

## Live-read policy

- Local reads never trigger surprise network traffic by default.
- Manual sync remains available everywhere a live collection is shown.
- Periodic web sync may be opt-in when it has a five-minute minimum, visible state, overlap protection, failure backoff, and no work from hidden pages.
- Browser scheduling is convenience while a page is mounted. Durable unattended refresh belongs to `birdclaw jobs`, with locks and audit logs.
- Live writes stay explicit, account-scoped, and transport-aware.

The spec's automatic `serve` sync direction therefore means user-enabled, bounded refresh rather than an unobservable polling loop.

## New data surfaces

A new Twitter surface belongs in Birdclaw when it can provide:

- a stable read transport and explicit rate-limit behavior
- durable schema, source attribution, freshness, and completeness metadata
- resumable sync plus backup/export coverage
- CLI and structured JSON access before UI-only or downstream integrations

Birdclaw owns the read-only List contract: explicit rate-limited sync, durable owned-List metadata and membership edges, freshness/completeness markers, backup coverage, CLI/JSON access, and local lexical filtering. Semantic-index products consume that contract for their own indexing and query UX.

## Boundaries

- No cloud-required backend or multi-tenant service.
- No hidden live writes.
- No UI-only state that should survive browser loss.
- No downstream-specific integration before the underlying local data contract is complete.

Detailed implementation decisions remain in [`docs/spec.md`](docs/spec.md).
