# contract

Focused R1-02 contracts (offline, no live providers):

- `unauthorized-write.contract.test.ts` — gateway denies writes without a matching grant
- `stop-switch.contract.test.ts` — gateway denies writes when outbound is stopped

Run: `pnpm test:contract`
