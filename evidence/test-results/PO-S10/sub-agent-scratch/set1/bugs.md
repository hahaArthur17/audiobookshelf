# Set 1 bug log (server/managers/) - bugs are NOT fixed

Line numbers are those of the original JavaScript files (HEAD).

## NotificationManager.js
- 141-143: onTest() calls triggerNotification('onTest') without event data; sendNotification() then hands undefined to Notification.getApprisePayload(), and replaceVariablesInTemplate() throws on `data[...]` as soon as the template holds a `{{variable}}`. onTest() has no caller in server/ (dead code).
- 64-69, 90-94, 114-118: the event data holds numbers, booleans and null, but Notification.replaceVariablesInTemplate() (Notification.ts, converted) only substitutes truthy values, so `numFailed: 0` leaves `{{numFailed}}` in the text; its parameter type Record<string, string> is also narrower than what is passed.

## CronManager.js
- 212-215: executePodcastCron() returns early when no library item is left, without removing the expression from podcastCronExpressionsExecuting (line 218 is skipped). A cron started later with the same expression is then reported as "already executing" on every tick and never runs.
- 166: startPodcastCron() passes libraryItemIds as a second argument to executePodcastCron(expression), which takes one parameter and ignores it (TS2554).
- 248: `libraryItem.media.metadata?.title` reads the shape of the old model; the Podcast model has no `metadata`, so this fallback is always undefined.
- 143: `podcast.libraryItem.id` is not guarded. The include is a left join, so a podcast row without a library item would throw in initPodcastCrons() during server start.
- 175: the log line in CronManager.startPodcastCron() is tagged `[PodcastManager]`.

## PlaybackSessionManager.js
- 104-106: syncLocalSessionsRequest() guards `req.body?.deviceInfo` and then reads `req.body.sessions` without a guard (throws when the request has no body).
- 33-37: the JSDoc says getSession() returns a PlaybackSession; it returns undefined when no session matches.
- 240, 254, 399: the library setting markAsFinishedPercentComplete can be null and is passed in a payload whose type (User.ProgressUpdatePayload) has no null for it.
- 213: isNaN(jsDate) is passed a Date; 332: Number.parseFloat() is passed a number. Both work only through coercion (lib types reject them).

## RssFeedManager.js (stays JavaScript)
- 183-186: getFeed() calls feed.buildXml() on the result of feed.updateFeedForEntity(), which returns null when the update fails or the entity is gone (Feed.ts). That is a TypeError inside the request handler.
- 90-94 and 122-137: `feed.entity = await feed.getEntity(...)` can be null (entity deleted after the feed was opened); the next lines dereference feed.entity without a test.
- 57: the JSDoc says findFeedForEntityId() returns Promise<Feed>; findOne() can return null.
- 281-282: getFeedOptionsFromReqOptions() returns null for ownerName and ownerEmail, while the typedef FeedOptions (Feed.ts) says string.
