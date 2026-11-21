# @worksocial/owner-staging

M4 / NEXT-13–15 owner staging workflow service.

- Activation checklist + connections + sites
- Page snapshot / GSC / GA4 collectors with FIXTURE vs LIVE provenance
- Staging CMS simulator: apply → independent read-back → recovery
- Owner-safe mission / review / evidence surfaces
- `/owner/status` Temporal label uses the shared binding probe
  (`probeTemporalConnection` → `runtimeTemporalLabel`) — frontend
  reachability only; M4 missions still use the staging CMS simulator

**Not production-activated.** Default unbound Temporal label is `NOT_WIRED`;
reachable frontend reports `TEMPORAL` (same honesty as `/roles/status`).
That is **not** an M4 Temporal enqueue claim. External effects: none unless
explicitly fixture/simulator. Does not claim R1-complete.

See `docs/product/temporal-binding.md`.
