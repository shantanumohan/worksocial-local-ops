# contract

Focused R1-02/R1-03 contracts (offline, no live providers):

- `unauthorized-write.contract.test.ts` — gateway denies writes without a matching grant
- `stop-switch.contract.test.ts` — gateway denies writes when outbound is stopped
- `read-evidence-required.contract.test.ts` — pilot writes require mapped ownership + prior read evidence

Run: `pnpm test:contract`
