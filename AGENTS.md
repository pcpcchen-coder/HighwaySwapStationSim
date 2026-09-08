# Development rules
- Read docs/EXECUTION_CONTEXT.md, docs/HANDOFF.md and docs/MASTER_PROMPT.md before changing models.
- User authorization to implement and upload this project is established. Continue reversible engineering work autonomously.
- Do not alter source fixtures to make reported totals match; preserve provenance.
- Keep physics and financial formulas in packages, never in UI components.
- No credentials, private conversation screenshots, node_modules, build output or runtime state in Git.
- Add meaningful numeric regression tests when changing a model; run npm run test:core, npm run typecheck, npm run build.
- Update docs/HANDOFF.md and docs/VERIFICATION.md with actual status.
