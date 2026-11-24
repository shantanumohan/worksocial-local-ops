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
<<<<<<< HEAD
- `indirect-prompt-injection-exfil.contract.test.ts` — T-X063 attack-suite deny + soak map; fixture ACCEPTED ≠ VERIFIED; external effects NONE
=======
- `unknown-usage-cancel.contract.test.ts` — T-X027 hold residual ≠ zero; liveBudgetProvider NOT_WIRED; soak map; ACCEPTED ≠ VERIFIED
>>>>>>> 9a0c03c9 (test(soak): L2 hillclimb T-X027 contract/e2e + heldMinor invariant)

Run: `pnpm test:contract`
- `unknown-policy-question.contract.test.ts` — T-X055 attack-suite escalate-without-promise + soak map; fixture ACCEPTED ≠ VERIFIED; external effects NONE
- `partial-campaign-destinations.contract.test.ts` — T-X045 attack-suite per-destination PARTIAL honesty + soak map; fixture ACCEPTED ≠ VERIFIED; external effects NONE
