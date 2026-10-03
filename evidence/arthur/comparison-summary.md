# Arthur 方法与结果摘要（供小组报告引用）

2026-10-03，使用“先调查跨模块接口、固定类型与行为契约、再让文件所有权不重叠的 Sub-Agent 迁移”的流程，从同一提交 `7d10b8fc` 分别完成 Phase 1 和 Phase 2。两个独立分支是 `arthur/phase1-contract-agents` 与 `arthur/phase2-contract-agents`；Phase 2 没有继承 Phase 1 的实现。

| 指标 | Phase 1 | Phase 2 |
| --- | --- | --- |
| 第一方 JS→TS | 3 个 Finder | 3 个 Finder、9 个 Provider、1 个 Controller（13 个） |
| Sub-Agent | 2 个，文件所有权不重叠 | 2 个，按 Provider 依赖分组 |
| 干净 strict 构建 / 完整测试 | 通过 / 356 项通过 | 通过 / 356 项通过 |
| 固定离线行为样本 | 11 项与基线结构一致 | 17 项中 16 项一致；GoogleBooks 缺字段结果行由 `null` 被过滤 |
| 可取得的用量与费用 | 平台未提供，未估算 | 平台未提供，未估算 |
| 本地经过时间 | 约 20 分钟 | 约 17 分钟；两阶段有并行工作，不能相加作为独立实验耗时 |

契约确实帮助发现了接口事实：OpenLibrary 的 `{errorCode}` 与其他 Provider 的数组失败方式不同；Audnexus 和 iTunes 可返回 `null` 或可空字段；GoogleBooks `cleanResult` 会产生 `null` 行；Finder 与 Controller 的 CommonJS 导出都是实例，Provider 导出的是构造函数。Provider Agent 报告的缺字段被主 Agent 补进公共 TypeScript 类型，没有并发修改同一公共文件或合并冲突。主 Agent 在 Phase 1 修正过评分字段的 JSON 顺序，在 Phase 2 单列了 GoogleBooks 的行为修正。

这次记录不能证明该方法降低总成本或优于小组其他方法：主/子 Agent token 和费用不可获得，两个阶段的任务大小不同，客户端与模型的实际计费标识也没有完整暴露。现有 356 项测试及固定离线样本不覆盖真实第三方响应、网络超时、429 重试与所有 API 分支；小组统一限时和验收条件尚未确认。结果应作为“本地工具与流程组合”的观察值，不归因于某一个模型。

完整证据见两分支的 `evidence/arthur/phaseX-run.md`、契约、原始提示词和 `logs/`。没有对外推送、PR 或群消息；这些步骤需要小组对比较口径确认后进行。
