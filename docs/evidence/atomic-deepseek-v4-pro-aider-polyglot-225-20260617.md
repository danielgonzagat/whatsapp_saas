# Atomic + DeepSeek V4 Pro Aider Polyglot Public Proof

**Result:** PASS 225/225

**Scope:** Aider Polyglot all-language benchmark snapshot. This report proves the supplied artifact set, not an unbounded claim about future benchmark commits.

## Benchmark Source

- Name: Aider Polyglot Benchmark
- URL: https://github.com/Aider-AI/polyglot-benchmark
- Commit: 7e0611e77b54e2dea774cdc0aa00cf9f7ed6144f
- Model: deepseek-v4-pro
- Atomic repository commit: 7a5f30623b95e06bf47dd61f9ac0c2e432a0d71b
- Run directory: /workspaces/Kloel/artifacts/atomic-edit-bench/atomic-deepseek-v4-pro-aider-polyglot-all-225-remote-20260617T162708Z

## Public Leaderboard Reference

- URL: https://aider.chat/docs/leaderboards/
- Checked: 2026-06-17
- Current listed leader: gpt-5 (high)
- Current listed score: 88.0 pass_rate_2_pct
- Atomic artifact score: 100.0% (225/225)

## Result By Language

| Language | Cases | Passed |
| --- | ---: | ---: |
| cpp | 26 | 26 |
| go | 39 | 39 |
| java | 47 | 47 |
| javascript | 49 | 49 |
| python | 34 | 34 |
| rust | 30 | 30 |

## Manifest Hashes

- all-225.json SHA-256: 88297b562f10097ade3ac624f8124d5c2c22fbabcfed4ce9f8daa6e1a56bb294
- Case list SHA-256: 535f5252cc8ca3eb790e131684506088778054ac45ea1cf55a3a41c053c63260
- Case artifact set SHA-256: b50c43513fcf176d868db2e1d0bbf39052adc846e684092e29d996efcf136f34
- Case artifact count: 225
- Summary outcome count: 225
- Reported run duration seconds: 5208.945

## Atomic Runner Hashes

| File | SHA-256 |
| --- | --- |
| scripts/mcp/atomic-edit-bench/aider-polyglot-deepseek-runner.mjs | 7681133ede0b81bf252ae5bc81c6eb2540666e382fd3f640517a6fc54b3af43e |
| scripts/mcp/atomic-edit-bench/aider-polyglot-deepseek-runner.proof.mjs | d24b5159a90148e7ce61b35336a8c4362e3226c08e6ec460a851f42344f3cf48 |
| scripts/mcp/atomic-edit-bench/aider-polyglot-deepseek-batch-runner.mjs | 0c859f2f77a91a6a30e11d88817886c564a3770b3209e9fd30bfd18ec4cf8549 |
| scripts/mcp/atomic-edit-bench/aider-polyglot-deepseek-batch-runner.proof.mjs | d42d764e6ead06f5f52f0b4456cc49326e83c8638326b513d9f9ffbe6c1bbf83 |

## Reproduction command

```sh
node scripts/mcp/atomic-edit-bench/aider-polyglot-public-proof.mjs \
  --run-dir /workspaces/Kloel/artifacts/atomic-edit-bench/atomic-deepseek-v4-pro-aider-polyglot-all-225-remote-20260617T162708Z \
  --expected-total 225 \
  --expected-model deepseek-v4-pro \
  --expected-language-counts-json '{"cpp":26,"go":39,"java":47,"javascript":49,"python":34,"rust":30}' \
  --leaderboard-url 'https://aider.chat/docs/leaderboards/' \
  --leaderboard-current-leader 'gpt-5 (high)' \
  --leaderboard-current-leader-score 88.0 \
  --leaderboard-metric pass_rate_2_pct \
  --leaderboard-observed-at 2026-06-17 \
  --out-json artifacts/atomic-edit-bench/public-proof.json \
  --out-md docs/evidence/atomic-deepseek-v4-pro-aider-polyglot-225.md
```

## Validation Notes

- Validation errors: none
- Validation warnings: none
- Raw candidate source is intentionally not embedded in this Markdown; the JSON proof contains per-case artifact hashes and metadata.
