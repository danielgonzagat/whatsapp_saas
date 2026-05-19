# Safe Cleanup Note

The benchmark tmp worktrees are around 134-135 MB each, with a few larger
outliers around 500 MB. They are useful only while their round evidence is being
audited. This round's evidence is persisted in `metadata.env` and
`codex-subagents-verdict.md`.

No cleanup was executed during active worker execution.
