# Superpowers test session (S-test)

Date: 2 October 2026 Folder: D:\SEM-2\574\Project\sp-test (outside the repo) Environment: Windows, PowerShell in VS Code, Node v24.21.0, npm 11.19.0 Claude Code: 2.1.286

## Plugin

superpowers @ claude-plugins-official, version 6.4.1, author Jesse Vincent Scope: user. Status: enabled. Skills: brainstorming, diagnosing-superpowers, dispatching-parallel-agents, executing-plans, finishing-a-development-branch, receiving-code-review, requesting-code-review, subagent-driven-development, systematic-debugging, test-driven-development, using-git-worktrees, using-superpowers, verification-before-completion, writing-plans, writing-skills Hooks: SessionStart Install screen estimate of context cost: about 940 tokens every turn, about 55k tokens when a skill is invoked (an estimate shown by Claude Code, not measured).

## Models

Opus 5.5 was selected at the start. In /model I pressed Enter on Fable 5.1 by mistake, which saved it as the default. The test ran on Fable 5.1. I switched back to Opus 5.5 afterwards.

## /usage (this session, Fable 5.1)

Cost: $0.62 (api-equivalent, plan not billed) Time: 4m 24s wall-clock, 15s API Fable 5.1: 6 input, 984 output, 139.3k cache read, 26.6k cache write Haiku 4.5: 898 input, 11 output, 0 cache read, 0 cache write, $0.0010 Prompt cache: 3 requests, 84% of input from cache, no misses Plan limits at that point: session 7%, week (all models) 25%, week (Fable) 12%

## /usage (last 24h view)

/superpowers:brainstorming: 44% of usage Plugin "superpowers": 44% of usage The screen says these are independent characteristics, not a breakdown, so they overlap and are not additive.

## Observations

- I typed "Let's make a small todo list app". Claude loaded the brainstorming skill by itself (Skill(superpowers:brainstorming)), without me naming it.
- It searched the empty folder first, then asked one multiple-choice question about the app's purpose before writing any code.
- My answer: none. I did not answer the question and exited the session at that point.
- Not comparable with Phase 1: different model and no real task.
