# Workflow card: SP (Superpowers)

Member: [Aung Min Myat]
Tool: Claude Code 2.1.286, Opus 5.5, xhigh effort
Plugin: superpowers 6.4.1 (version checked at the start of every session)
Slice: server/finders/ (3 files, about 805 lines), Phase 1, time box about 6 hours
Branch: Aung-Min-Myat/phase1, from 7d10b8fc
Baseline: 356 passing, 0 failing (Node 24.21.0)

Decomposition: brainstorming, then a plan of small tasks that I approve, then one sub-agent per task.
Context: my first prompt, the brainstorming answers, the saved plan, and the Superpowers skills. No CLAUDE.md.
Verification: npm run build:server and npm test after each task, the skills' review steps, and my own checks after every session (diff of tests and config, any-count, full build and test).

Deviations from default Superpowers: worktree step skipped (own clone and branch); no package installs; test edits blocked by permission rule; plan documents saved under evidence/plans/.
Enforcement: deny rules for git push, merge, rebase and reset --hard, npm install, and edits to test/** (evidence/context-files/settings.local.json).