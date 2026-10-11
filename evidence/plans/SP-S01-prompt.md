Task: migrate server/finders/ (3 files, about 805 lines) from JavaScript to TypeScript with meaningful types. This is a type-only migration. Behaviour, exports and error handling must not change.

Context: Audiobookshelf server, a fork for a university experiment (no upstream pull requests). I am on branch Aung-Min-Myat/phase1 in my own clone. Do not create a worktree or another branch. tsconfig.server.json uses strict, allowJs and noEmitOnError, with no checkJs, and `npm test` runs `npm run build:server` first, so one type error stops all tests. Existing JavaScript callers use require(), so keep each module's export shape unchanged and do not edit caller files. If you think you must, list them and ask me.

Done means: `npm run build:server` passes with no errors and `npm test` passes all 356 tests (baseline: 356 pass, 0 fail).

Rules:
- Rename with `git mv` (.js to .ts) to keep history.
- No `any`, `as any`, `@ts-ignore`, `@ts-nocheck` or `@ts-expect-error`. Use real interfaces for result shapes. For external data such as HTTP responses or parsed JSON, use `unknown` and narrow it.
- Do not edit or delete tests, tsconfig.server.json, package.json or package-lock.json. Do not install packages. If a type package is missing, stop and tell me which one and why.
- No refactoring, no renaming of public functions, no behaviour changes. If you find a bug, report it and leave it.
- If the TDD skill wants a failing test first, the failing check is the type error or build failure in the file being converted. Propose any new test in the plan and wait for my approval.
- Save any design or plan documents under evidence/plans/, not docs/.
- Commit after each task on this branch, with the message starting "[SP-S01] ". Never push, merge or open a pull request. At the end, choose "keep branch" and stop.
- If anything fails or is left undone, say so plainly and show the exact command output. Do not say the work is complete unless the Done check passes.