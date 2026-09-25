# Main branch and README delivery

The owner requested updating README on main, committing and pushing it. Inspection found GitHub default branch codex/mvp at merged commit 4d5ff05 and no main. The owner explicitly authorized creating main from that integrated history and making it the GitHub default. Existing branches are preserved.

README now presents the 0.2.0 feature/provider scope, a fresh-clone installation flow, actual folder discovery, helper upgrade steps and main migration. It retains download/recovery semantics and coverage limits, and separates isolated browser fixtures from tests that use the installed native helper. DOCUMENTATION.md records the branch transition and documentation-only scope.

Validation passed: 12 local links/anchors, balanced Markdown fences and details, UTF-8/final newline, referenced scripts, 0.2.0 package/manifest consistency, command/source review and Git whitespace validation. No runtime tests, build, installer execution or browser changes were needed. Commit/push and GitHub default-branch configuration follow the owner's explicit request, with remote HEAD and commit synchronization checked before reporting completion.
