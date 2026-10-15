# Group A plan: Audiobookshelf AI rewrite experiment (COMPX574)

Sources: issue #7 in the group's private repo (Arthur's proposal and Danny's comment), group chat of 1 Oct 2026, and Danny's statements on 3 Oct 2026.
Report due: 16 October 2026 (Agentic Development Review).

## Task
Experiment with an AI-agent-driven rewrite of the Audiobookshelf server (Express, JavaScript, Sequelize, SQLite) from JavaScript to TypeScript. Self-contained experiment, no pull request to the upstream Audiobookshelf project. The task has been sent to Cameron by email and is settled.

## Repository
- Shared fork: https://github.com/hahaArthur17/audiobookshelf (Arthur's fork, members added as collaborators).
- Baseline commit: 7d10b8fc. Base branch: master.
- Each person works on their own branches named <name>/<phase> (for example danny/phase1) and never pushes to the base branch or to someone else's branch.

## Baseline (Arthur's run)
- 356 tests passing, 0 failing. Overall line coverage 18.89%, so passing tests alone does not prove behaviour is unchanged.
- About 182 first-party JS files, about 52,000 lines. The 244 further .js files under server/libs are vendored third-party code (Danny's measurement).

## Scope and measurement
- Declared scope: the whole server, JavaScript to TypeScript.
- Attempted work: the metadata pipeline (server/finders/ + server/providers/ + SearchController, about 2.5k lines).
- Progress is measured against the whole server: files converted out of 182, TypeScript strict type errors, tests passing out of 356.
- Type errors are measured with `npm run build:server` (the first step of `npm test`), counting lines containing "error TS".

## Plan (Arthur's list of 1 Oct, based on Danny's suggestions)
1. Shared repo: everyone branches from the same baseline commit and keeps master unchanged.
2. Experiment rules: same task description and acceptance checks, each person uses a distinct AI workflow, and records tool/model, prompts, time, token usage where available, commits, test results and bugs.
3. Week 1: save baseline results. One volunteer makes a roughly one-hour whole-server AI conversion attempt. All four independently migrate the same three server/finders/ files (about 805 lines, BookFinder.js is 702 of them) and compare results.
4. Week 2: from the same baseline, each person attempts the larger metadata pipeline.
5. Week 3: compare results, pick one final code state, run checks, write the report. No new conversion.

Same task for everyone in both phases (Danny's proposal), so differences come from workflow and tool, not from different packages.

## Time limits
No fixed hour limits. The earlier proposal of about 6 h (Phase 1) and about 8 h (Phase 2) was dropped in the chat. Josten: use the available tools to their maximum, as long as model, environment, token consumption, time and cost estimate are clearly documented. Arthur's practical constraint is plan usage limits (for example two 5-hour limits per week).

## Candidate workflows (from Arthur's issue)
1. Give the agent the goal and acceptance criteria, then let it plan and implement.
2. Ask for a plan first, review it, then implement in milestones.
3. Migrate one file at a time with tests and review after each step.
4. Define shared contracts and context first, then implement against them.

Recorded so far:
- Aung: workflow 2. Claude Code with the Superpowers plugin on Opus 5.5, spec and implementation plan reviewed and approved, then one file per task with build, tests, compiled-output diff and shape checks. Claude chat used to write instructions and guide him. Phase 1 (finders): 3 of 3 files converted, 356 of 356 tests passing (his message, final checks nearly done).
- Danny: workflow 1 intended for the main runs. Local Claude Code on Linux, Opus 5.5, medium effort, no plugins installed.

## Status (3 Oct 2026)
- Danny completed the one-hour whole-server one-shot run. Prompt: "Rewrite the backend of this Audiobookshelf repository (the server directory, currently JavaScript with Express and Sequelize) in TypeScript. Convert the whole server." Result: it did not reach a working build. All 182 first-party files were renamed to .ts in the first five minutes, but 2,805 strict type errors remained across 104 files and none of the 356 tests could run (the test script compiles first). Branch: danny/oneshot.

## Evidence log
Each person keeps their own log (tool/model, prompts, time, tokens/cost, commits, test results) for the report appendix.
