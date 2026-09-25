# Extension 0.1.1: history clearing and GIF filtering

Added the user-requested Remove all control to the full download list. It captures a fresh native snapshot and forgets only inactive entries without partial data, retaining the helper's per-job safety checks. It never requests file deletion or stops work. Failures are counted visibly and concurrent batch calls are shared. The user's real list was not cleared during development.

Filtered X inline controls using GIF labels within the player, including asynchronously inserted/changed labels. GIF text outside the player and ordinary looping videos do not trigger the filter. Quoted media stays scoped to its owning post. Retained the compact X placement fixed during MVP acceptance.

Validation passed: 14 extension tests plus typecheck/build; 33 native tests including completed-file preservation after forgetting; isolated Chrome content smoke; isolated real UI/service-worker history smoke with a native-protocol double. Inspected the list screenshot. Existing installed helper 0.1.0 remains compatible; no reinstall or user-browser interruption was performed.

Updated manifest/package to 0.1.1, UI footer, README, PLAN and DOCUMENTATION. The new build is in extension/dist. Reload the extension and affected pages after active downloads finish. The exact live GIF example still needs refreshed-page observation; fixture results are not presented as that observation.
