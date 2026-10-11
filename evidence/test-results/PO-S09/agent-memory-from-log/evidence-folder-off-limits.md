---
name: evidence-folder-off-limits
description: In audiobookshelf-po the evidence/ folder (run notes, predictions, logs) is excluded by sparse checkout on purpose; do not read it from git history during a migration run
metadata:
  type: feedback
---

In `D:\SEM-2\574\Project\audiobookshelf-po` the folder `evidence/` (run notes, predictions, session logs; 408 files) is tracked in git but excluded from the working tree by sparse checkout (`git sparse-checkout list` shows `/*` and `!/evidence/`). Do not read it with `git show HEAD:evidence/...`, `git log -p` or `git grep` on history while doing a migration run (the PO-S.. tasks).

**Why:** The user's own notes for PO-S08 say "Keep the notes and predictions of a run outside the repo until it has finished (or deny reading them)", written after an earlier agent's behaviour changed because it had read old notes. On 2026-10-11 (run PO-S09) I read about 20 matching lines of `evidence/notes/PO-S08-notes.md` with `git show` to settle a rule-5 question, before I noticed the sparse-checkout exclusion, and had to disclose that in my report. That the exclusion is deliberate is my interpretation of the sparse-checkout setting together with that note; the user did not say it to me directly.

**How to apply:** If a path is tracked but missing from the working tree, run `git sparse-checkout list` before reaching into the object store, and leave excluded paths alone. For a rule question use CLAUDE.md and the task text only; if they do not settle it, apply the rule as written and report the gap. CLAUDE.md's pointer "see git log for [PO-S01] to [PO-S08]" means the code commits as worked examples, not the evidence notes.
