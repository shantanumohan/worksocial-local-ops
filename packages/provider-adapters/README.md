# `@worksocial/provider-adapters`

R1-03 scaffolds for website/CMS/repo/CRM/booking adapters, plus M4 collectors and staging CMS simulator.

| Status | Meaning |
|--------|---------|
| `NOT_WIRED` | Descriptor only; no network calls |
| `FIXTURE` | Offline fixture reads for ownership/evidence tests |
| `SIMULATOR` | In-process staging CMS with independent read-back |
| `LIVE` | Only when explicit credentials exist; otherwise fall back to fixture labels |

M4 exports: `capturePageSnapshot`, `readGscObservations`, `readGa4Observations`, `createStagingCmsSimulator`.
Measurement provenance is preserved (`FIXTURE` vs `LIVE`). Apply ≠ verified.

No live Zoho, CMS, booking, or OAuth mutations by default. Connection ≠ permission ≠ verified.
