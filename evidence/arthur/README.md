# Arthur Gao Audiobookshelf experiment evidence

This index provides the code, contracts, prompts, checking scripts and recorded results for Arthur's COMPX574 JavaScript-to-TypeScript migration experiments. The accepted cumulative result is 59 of 183 first-party server/entry JavaScript files migrated (32.2%): 13 Phase 2 metadata files plus 46 Phase 3 Stage 1 utility files. Stage 2 and later stages were not started.

The three experimental branches are in the group's [shared fork](https://github.com/hahaArthur17/audiobookshelf). Use the fixed commits below when checking the reported results. The Phase 3 branch also contains a subsequent documentation-only commit adding this index, the saved type audit and dated source records; that publication step does not change the accepted migration code.

## Code snapshots

All experiments use common baseline [`7d10b8fc`](https://github.com/hahaArthur17/audiobookshelf/commit/7d10b8fc4abe57a4e777a07b7b462ca32c33371c).

| Experiment | Branch | Accepted code commit | Relationship |
| --- | --- | --- | --- |
| Phase 1 | [arthur/phase1-contract-agents](https://github.com/hahaArthur17/audiobookshelf/tree/arthur/phase1-contract-agents) | [`6e73974e`](https://github.com/hahaArthur17/audiobookshelf/commit/6e73974e1f9dcf8c25199672628488f32a4e4ffb) | Independent three-Finder trial from the common baseline |
| Phase 2 | [arthur/phase2-contract-agents](https://github.com/hahaArthur17/audiobookshelf/tree/arthur/phase2-contract-agents) | [`5f37b6a7`](https://github.com/hahaArthur17/audiobookshelf/commit/5f37b6a7932ec53ce00d56f2888f6f7c057ae746) | Independent 13-file metadata trial from the common baseline |
| Phase 3 Stage 1 | [arthur/phase3-contract-agents](https://github.com/hahaArthur17/audiobookshelf/tree/arthur/phase3-contract-agents) | [`e599d1a2`](https://github.com/hahaArthur17/audiobookshelf/commit/e599d1a2dbcfe0b262425260afbea4576a4c712c) | Continues from Phase 2 with 46 additional utility files in 28 batches |

Phase 1 overlaps Phase 2 and is not added to the cumulative 59-file result. These are course experiment branches in the fork, not upstream Audiobookshelf pull requests.

## Evidence map for the group report

| Reference | Open first | Supporting material |
| --- | --- | --- |
| AG-1 | [Phase 1 run record](https://github.com/hahaArthur17/audiobookshelf/blob/6e73974e1f9dcf8c25199672628488f32a4e4ffb/evidence/arthur/phase1-run.md) | [Phase 1 directory](https://github.com/hahaArthur17/audiobookshelf/tree/6e73974e1f9dcf8c25199672628488f32a4e4ffb/evidence/arthur): context, contract, prompts, behavior script and raw logs |
| AG-2 | [Phase 2 run record](https://github.com/hahaArthur17/audiobookshelf/blob/5f37b6a7932ec53ce00d56f2888f6f7c057ae746/evidence/arthur/phase2-run.md) | [Phase 2 directory](https://github.com/hahaArthur17/audiobookshelf/tree/5f37b6a7932ec53ce00d56f2888f6f7c057ae746/evidence/arthur): context, contract, prompts, comparison summary, behavior script and raw logs |
| AG-3 | [Migration index](../../MIGRATION.md) | [Dated plans and result summaries](source-records/), including the Phase 1/2 plan and Phase 3 staged plan |
| AG-4 | [Stage 1 directory](phase3/) | Context, stage contract, frozen target manifest, all 28 batch contracts, 32 checking scripts and saved baseline outputs; [raw logs and diffs](phase3/logs/) |
| AG-5 | [Final acceptance record](phase3/stage1-session4.md) | [Strict typecheck](phase3/logs/stage1-final-typecheck.log), [fresh build](phase3/logs/stage1-final-clean-build.log), [coverage/tests](phase3/logs/stage1-final-coverage.log), [manifest audit](phase3/logs/stage1-final-manifest-audit.log), and final Batch 01–28 outputs in the logs directory |
| AG-6 | [Dated source records](source-records/) | Original plans, Phase 1/2 results, partial Stage 1 history, final Stage 1 results and weekly summary |
| AG-7 | [Saved type audit](type-quality/audit-2026-10-13.json) | [Read-only audit script](type-quality/audit.cjs); measured code commit is `e599d1a2`, recorded in the JSON `head` field |

The original local `Arthur-final-report` package uses a different folder layout. Its `evidence/phase1/` and `evidence/phase2/` correspond to `evidence/arthur/` on their respective accepted commits. Its `evidence/phase3-stage1/` corresponds to `evidence/arthur/phase3/`; its `evidence/type-quality/` and `source-records/` correspond to the directories linked above. The individual report and its Word copy remain in the original local package; the primary code and experimental evidence are directly accessible through this index.

## Recorded results and limits

| Measure | Recorded result | Interpretation |
| --- | --- | --- |
| Phase 1 | 0 strict build errors; 356 passing unchanged tests; 11/11 fixed offline comparisons equal | Covers the selected samples; not exhaustive behavior equivalence |
| Phase 2 | 0 strict build errors; 356 passing unchanged tests; 16/17 comparisons equal | Google Books missing-`volumeInfo` handling differs from the common baseline |
| Stage 1 | 46/46 planned targets in 28 accepted batches; 0 strict errors; 356 unchanged tests passing | All 28 final batch outputs and supplementary downloader stream/SQLite samples matched saved baselines |
| Final coverage | 19.03% overall line coverage; 17.01% for the `server` group | Passing tests do not establish full-server equivalence |
| Type syntax in 59 files | 372 `as`, 73 non-null `!`, 0 explicit `any` | Syntactic counts, not defect counts or a proof of type safety |
| Elapsed time | Phase 1 and 2 combined: reported 31 min 21 s; Stage 1: about 124 min across four sessions | Overlapping work is not added as separate elapsed time; human time savings were not measured |
| Cost | No verified task-specific token total or dollar cost | Account-wide quota snapshots are resource-use proxies and cannot be added across resets or converted to dollars |

The Phase 2 Google Books difference remains unresolved: for a missing-`volumeInfo` sample, the common baseline retained a `null` row and the migrated result filtered it. The final Stage 1 metadata regression matched the saved Phase 2 output, so it did not resolve this earlier difference. The checks did not establish equivalence for live providers, production databases or every server path.

The migration index explicitly labels ten batches as accepted after main-agent repair. The run records describe additional pre-acceptance corrections in Batches 01 and 27. Historical approval/sandbox settings and upstream-credential access were not recorded sufficiently to verify isolation. Publishing these evidence branches does not resolve those historical evidence limits.

Dated logs and source records are preserved as historical snapshots, including statements that branches were local at the time. This index records their subsequent publication for review. Reported measurements continue to refer to the accepted code commits above.

To inspect the saved type count, open the JSON and its `head` field first. The read-only script takes a checkout path with its TypeScript dependency installed: `node audit.cjs /path/to/checkout`. It records the checkout's current HEAD; reproducing the exact saved JSON requires the accepted code commit `e599d1a2`.
