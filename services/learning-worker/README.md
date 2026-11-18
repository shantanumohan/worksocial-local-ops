# learning-worker

Local multi-model learning worker. Consumes verified SUCCESS/FAILURE outcome ledgers and emits versioned playbook/ranking/risk **proposals under review**.

## Isolation (hard)

- Principal: `learning-worker` only
- **No** action-gateway write principal
- **No** production effect credentials (credential-broker denies mint/reveal)
- Proposals cannot expand grants / spend / CRM write / publish authority

## Real vs stub

| Capability | Status |
|------------|--------|
| Multi-model registry (≥2 OSS pins) | **real** |
| Feature extraction + fixture exclusion | **real** |
| Offline fixture train/predict in CI | **real** |
| Local train from verified outcomes | **real** (file-backed ledgers) |
| Auto-apply authority / spend changes | **forbidden** |
| Production-canary-verified learning | **not claimed** |
| Probe/CRM canary labels | **stub until R1-05** |
