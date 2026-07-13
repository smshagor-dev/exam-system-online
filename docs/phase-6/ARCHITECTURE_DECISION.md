# Phase 6 Architecture Decision

## Decision

Adopt a hybrid runtime:

- MongoDB remains authoritative.
- Redis carries volatile distributed state when available.
- In-memory runtime is retained as a controlled fallback so the application still boots in non-Redis environments.

## Why

- Phase 1-5 APIs and persistence rules remain intact.
- No Prisma schema migration was required for the first hardening pass.
- Attempt snapshotting could be introduced without adding new collections by persisting the frozen payload in `ActivityLog`.

## Key outcomes

- Multi-instance event fan-out is enabled through the Socket.IO Redis adapter.
- Timer leadership is coordinated with runtime locks.
- Reconnect state, presence, and answer cache survive individual socket reconnects.
- Submission is guarded by a distributed lock and kept idempotent.

## Tradeoff

The current implementation avoids schema changes, which reduced rollout risk, but means snapshot persistence is stored in `ActivityLog` rather than a dedicated collection.
