# Session logs of Aung Min Myat

This branch holds the raw Claude Code session logs of Aung Min Myat's eleven runs in the Audiobookshelf JavaScript to TypeScript experiment for COMPX574-26B. It contains no source code. The group report uses these logs as evidence for the time, token and cost figures of Appendix C (Table 12) and for statements about what the agents did in each run.

The notes, prompts, results and transcripts of the same runs are in the folder `evidence/` on the branch `Aung-Min-Myat/phase1` of this fork. This branch adds the part that was missing there, which is the raw logs.

The branch has 61 files (74 MB). 37 of them are logs. `MANIFEST.csv` lists every file with its size, its record count, its first and last timestamp and its SHA-256 checksum.

## How to read a log

Claude Code writes one JSON record per line (`.jsonl`). Every record has a `timestamp` in UTC. Records of the assistant show the model name in `message.model` and the token counts in `message.usage`. Tool calls and their results are stored in the same file. The main agent of a run has one file. Every subagent that the main agent started has its own file in a `subagents` folder, and for most runs Claude Code wrote a small `.meta.json` file next to it. Claude Code also saved some long tool outputs as separate text files in a `tool-results` folder.

The file name of a main log is its session ID. The report uses the first eight characters, for example PO-S08 (6e0ca4b8).

## Index of runs

| Run | Date (NZ) | Workflow in the report | What the run did | Prompt to last message (NZ time) | Folder under `session-logs/` (log ID) | Subagent logs | Panel cost |
|---|---|---|---|---|---|---|---|
| SP-S01 | 2 Oct | W2 (plan first) | Superpowers plugin, written spec and plan, one task per file, `server/finders/` (3 files). Two sessions. | S01: 2 Oct 01:40 to 05:48. S02: 2 Oct 21:23 to 22:29 | `SP-S01-S01` (03d0fa39) and `SP-S01-S02` (f30c058e) | 0 | about $20.0 |
| PO-S01 | 3 Oct | W3b (rule file) | One prompt and the rule file `CLAUDE.md`. The agent chose its own files. | 3 Oct 02:13 to 02:52 | `PO-S01` (3a6f52b6) | 0 | $4.88 |
| PO-S02 | 3 Oct | W3b (rule file) | Spike on five named targets with relaxed rules. | 3 Oct 04:12 to 04:53 | `PO-S02` (775d6c92) | 0 | $4.35 |
| PO-S03 | 3 Oct | W5 (parallel subagents) | Main agent and 3 subagents on separate folders. | 3 Oct 05:31 to 06:16 | `PO-S03` (0bf83f6f) | 3 | $13.48 |
| PO-S04 | 10 Oct | W3b (rule file) | Pilot of the Sequelize pattern on 3 models. | 10 Oct 13:34 to 14:09 | `PO-S04` (2d937ae2) | 0 | $5.15 |
| PO-S05 | 10 Oct | W5 (parallel subagents) | 22 models. Main agent and 4 subagents in two waves. | 10 Oct 15:56 to 17:03 | `PO-S05` (a0a40682) | 4 | $39.57 |
| PO-S06 | 10 to 11 Oct | W3a (criteria in the prompt) | One short prompt, 14 named files, no rule file, separate copy of the code. | 10 Oct 23:22 to 11 Oct 00:48 | `PO-S06` (44babef5) | 0 | $21.39 |
| PO-S07 | 10 Oct | W3b (rule file) | One agent, 8 models one at a time, tests written first for bug fixes. | 10 Oct 20:28 to 21:40 | `PO-S07` (d7c0ac72) | 0 | $16.09 |
| PO-S08 | 11 Oct | W5 (parallel subagents) | 22 controllers. Main agent and 5 subagents in two waves. | 11 Oct 04:33 to 06:02 | `PO-S08` (6e0ca4b8) | 5 | $53.88 |
| PO-S09 | 11 Oct | W5 (parallel subagents) | Declarations for the layer below first, then the 8 restored controllers with 4 subagents. | 11 Oct 13:22 to 14:56 | `PO-S09` (9d365d79) | 4 | $47.66 |
| PO-S10 | 11 Oct | W5 (parallel subagents) | 60 files in 6 sets. Main agent and 6 subagents in one wave. | 11 Oct 16:46 to 17:55 | `PO-S10` (bca2b50b) | 6 | $59.35 |

Dates and times are New Zealand time (UTC+13), measured from the logs. The logs themselves use UTC. "Prompt to last message" runs from the moment the task prompt was pasted to the last message of the run, so some logs are longer, because the session was open before the prompt or stayed open afterwards. Panel cost is the figure read from the Claude Code usage panel at the end of the run, in US dollars at API prices. The files `usage-start.txt` and `usage-end.txt` in `evidence/test-results/` hold the readings. For SP-S01 the cost of the first session ($17.26) is computed from the log, because its end panel was not saved. Table 12 of the report gives the same figures.

## Later copies

The folder `_live-copy-2026-10-11` holds later copies of the logs of PO-S05, PO-S06 and PO-S07, which were taken while those sessions were still open. Each later copy contains every record of the copy in the run folder and a few more records (4 more for PO-S05, 3 more for PO-S06 and 27 more for PO-S07). The log of PO-S07 in this folder also continues for about 43 minutes longer. Please read the copy in the run folder first. The later copies are published because they are longer.

## What was changed before publishing

Two kinds of text were replaced and nothing else was changed.

1. Two personal email addresses of Aung were replaced with `[email-redacted]` (81 replacements).
2. The Windows user name in folder paths, for example `C:\Users\<name>\AppData`, was replaced with `USER` (5,548 replacements).

The prompts, the replies of the agents, the code and the tool results are as Claude Code wrote them. The number of records and the totals of the token counts in `message.usage` were compared before and after the replacement and are the same for every log. `MANIFEST.csv` gives two checksums for each file. `sha256_published` is the checksum of the file in this branch. `sha256_original` is the checksum of the original file on Aung's computer, so the originals can be shown on request.

A scan of the logs found no access tokens, passwords, API keys or private keys. The words `token`, `apiKey` and `password` that appear in the logs belong to the Audiobookshelf source code that the agents read.

## What is not published

- `PO-S06-agent-scratchpad` (about 23 MB, 1,822 files). These are temporary files of the agent in PO-S06, such as test servers, compiled copies and sample media files. They are working files and not records of the run.
- An earlier and shorter copy of the PO-S06 log. Every record of it is in the published PO-S06 log.
- The later copy of the PO-S04 log. It is identical to the PO-S04 log in the run folder.
- The other working folders on Aung's computer, for example `po-s08-store`, `po-s09-store` and `po-s10-store`. The main text results from them are in `evidence/test-results/` on the branch `Aung-Min-Myat/phase1`. The rest (scratchpads and copies of compiler output) is working data that can be shown on request.

## Limits of the logs

The logs do not hold all of the usage that the Claude Code panel shows. For PO-S03, PO-S05, PO-S08, PO-S09 and PO-S10 the cost that can be computed from the logs is lower than the panel figure, and the cause is not known. The report therefore uses the panel figures and uses the logs for times, the number of messages and tool calls, and the permission decisions.
