# Set 1: declarations needed

None. The three converted files (NotificationManager.ts, CronManager.ts, PlaybackSessionManager.ts) are clean without any
new declaration in server/models/ or server/types/. pending.d.ts is unchanged (no untyped npm package in this set; uuid is
already declared in server/types/untypedModules.d.ts).

Not requests, only observations (types in converted files that are narrower than what the callers pass; see report section 4):
- server/objects/Notification.ts: getApprisePayload / parseTitleTemplate / parseBodyTemplate / replaceVariablesInTemplate take `data: Record<string, string>`.
- server/models/Book.ts and Podcast.ts: checkCanDirectPlay(supportedMimeTypes: string[]) although the body tests Array.isArray().
- server/models/User.ts: User.ProgressUpdatePayload.markAsFinishedPercentComplete?: number (the library setting can be null).
- server/models/Feed.ts: Feed.FeedOptions.ownerName / ownerEmail: string (RssFeedManager passes null).
