# contract

Focused offline contracts (no live providers):

- `unauthorized-write.contract.test.ts` — gateway denies writes without a matching grant
- `stop-switch.contract.test.ts` — gateway denies writes when outbound is stopped
- `read-evidence-required.contract.test.ts` — pilot writes require mapped ownership + prior read evidence
- `thirty-role-runtime.contract.test.ts` — 30 roles; fixture evaluations; no uncontrolled recursion; self-approval denied; permission bypass refused
- `learning-worker.contract.test.ts` — multi-model registry; fixture exclusion; authority non-bypass; learning-worker isolation; offline train/predict
- `evaluation-worker.contract.test.ts` — AA-20 EVAL_ONLY isolation; LIVE_NOT_WIRED; broker deny; Ads blocked; learning cannot expand effects
- `paid-media-proposals.contract.test.ts` — AA-19 analysis hypotheses + Google Ads fixture proposals; ChatGPT Ads ACCESS_BLOCKED; live execute NOT_WIRED; external effects NONE
- `recovery-evidence.contract.test.ts` — WP10 stale vs active vs URO; live recovery NOT_RUN; local credential paths fixture; live provider revoke NOT_WIRED
- `credential-rotation.contract.test.ts` — WP10 revoke → cancel queued → audit retained; live provider revoke NOT_WIRED; external effects NONE; catalog NOT_RUN
- `keyboard-focus-restore.contract.test.ts` — T-X061 open/trap/restore + FOCUS_LOST; soak map; fixture ACCEPTED ≠ VERIFIED; external effects NONE

Run: `pnpm test:contract`
