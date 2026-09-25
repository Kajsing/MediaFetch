# MediaFetch agent instructions

These instructions apply throughout this repository. Follow the user's current instructions and any higher-priority runtime instructions first.

## Start here

1. Read [README.md](README.md) for the project entry point.
2. Read [DOCUMENTATION.md](DOCUMENTATION.md) for actual status and validation evidence.
3. Read the relevant milestone and acceptance requirements in [PLAN.md](PLAN.md).
4. Check repository status and any more specific `AGENTS.md` before editing. Preserve existing user changes.

The [original feasibility study](mediafetch_chrome_extension_forundersoegelse.md) is historical input. Preserve it; record later decisions in the plan and status document. Do not infer implemented functionality from a checked planning milestone.

## Language and communication

- Converse with the project owner in Danish.
- Write code, comments, UI text, documentation, test names, and commit messages in English.
- Give concise progress updates during substantial work. Explain outcomes and real blockers plainly.
- Distinguish implemented behavior, automated checks, manual verification, and assumptions.

## Autonomy and scope

- Complete coherent milestone work, including related code, tests, documentation, and fixes for validation failures caused by the change.
- Make routine local implementation decisions autonomously within the plan. Document assumptions and small deviations.
- Do not ask for approval again when the current conversation already authorizes the work. Do not stop solely because an authorized milestone is large.
- Do not silently change product direction, major architecture, the security model, licensing, deployment, or data ownership. Do not introduce required paid/cloud dependencies or destructive operations without authorization.
- For a better approach that changes those boundaries, explain the proposed change, benefit, risk, and whether the existing plan can safely continue, then ask before changing direction.
- If blocked, report what was attempted, what failed, the evidence and category of failure, alternatives, the recommended next step, and any actual user decision needed. Continue independent work where possible.
- The future MCP/ChatGPT integration is parked. The owner authorized the YouTube milestone after the Slate release; follow its single-video scope in PLAN.md. Do not add speculative future integrations.

## Product and architecture constraints

- Target Windows 11 and Chrome/Chromium Manifest V3, initially installed unpacked.
- Use TypeScript for the extension, Python for the Native Messaging helper, and yt-dlp/ffmpeg for extraction and processing.
- Keep provider-specific DOM logic isolated. Work on Reddit before X and follow the milestone sequence in `PLAN.md`.
- The service worker owns orchestration and the native connection; popup lifetime must not control download lifetime.
- Preserve the hybrid architecture, enabling direct downloads only after their destination and lifecycle behavior meet the plan's acceptance criteria.
- Default output is the Windows Downloads known folder plus `VideoDownload`. Account explicitly for a different Chrome download destination.
- Maintain the persistent list and the distinct Stop, Continue, Retry, and Stop and delete semantics from the plan. Never promise universal resume support.
- Limit active jobs to two across the native scheduler, with additional jobs queued.

## Security and data ownership

- Treat page data and content-script payloads as untrusted. Validate senders, schemas, actions, options, and provider URLs before crossing each trust boundary.
- Pages cannot select arbitrary paths, executable locations, shell arguments, or privileged job-management actions.
- Use narrow permissions and exact native-host extension origins. Do not add broad host access, credential extraction, remote extension code, or bypass mechanisms.
- Invoke controlled executables with argument arrays and no shell. Isolate yt-dlp from ambient configuration and plugins; keep quality caps effective in every fallback.
- Keep native stdout reserved for framed protocol messages. Never log secrets or signed media URLs.
- Give each job exclusive staging ownership. Resolve and validate containment before cleanup, including reparse-point and filesystem-race handling.
- Stop and delete affects that job's unfinished artifacts only. Preserve completed videos, unrelated files, and other applications' processes.
- Keep private signing material and local state out of Git. A public development key used to stabilize the extension ID is not a private signing secret.
- Installing/uninstalling the helper must be per user and must preserve downloaded videos and recoverable data unless the user explicitly requests their deletion.

## Repository and implementation practices

- Use the proposed layout as components are implemented: `extension/`, `native-host/`, and `installer/`. Do not add empty scaffolding merely to mirror the study.
- Keep dependencies minimal and local. Inspect available tooling before choosing versions; commit applicable lockfiles once the toolchain exists.
- Follow `.editorconfig` and `.gitattributes`. Keep generated output, caches, credentials, downloads, and runtime state out of Git.
- Use `rg` for file/text searches when available. Prefer focused reads over large recursive dumps.
- Preserve the user's active browser and unrelated applications. Do not restart Chrome or terminate unrelated processes to simplify validation.
- Keep meaningful sanitized fixtures; do not commit personal browsing data, authentication material, or full captured sessions.
- Keep `PLAN.md` as the behavior/acceptance source and `DOCUMENTATION.md` as the current status source. Add separate design documents only when they explain a decision not adequately covered there.

## Validation

- Run checks appropriate to the component and milestone: typecheck/build, focused behavioral tests, integration checks, and the required real Windows/Chrome checks.
- Derive runnable commands from the actual checked-in tooling. Until those scripts exist, do not invent commands or claim they passed.
- Prioritize meaningful tests for URL and message boundaries, correct clicked-media identity, job transitions, queue limits, recovery, process ownership, and deletion races.
- Keep live provider tests explicit and opt-in rather than part of normal network-independent CI.
- Browser mocks or DOM fixtures do not prove Native Messaging, real permissions, process cleanup, or provider extraction works.
- For live video acceptance, inspect streams and duration, perform a full decode/playback check, and verify expected audio. Record what was actually observed.
- Documentation-only work needs link, consistency, and formatting checks; do not create tests that merely assert prose.
- Once relevant checks pass, proceed to completion unless new evidence warrants more validation.

## Handoff and project records

After each milestone or substantial work chunk:

1. Update `DOCUMENTATION.md` with completed work, changed files, commands/checks and results, assumptions, deviations, remaining work, and whether the next step can proceed autonomously.
2. Update milestone status in `PLAN.md` only when its exit criteria are met. Keep all status claims consistent with the evidence.
3. Add a concise English Markdown record under `.logs/` for complex work, using `YYYY-MM-DD-short-description.md`. Keep raw runtime logs and sensitive data out of these records.
4. Report the outcome in Danish and link to relevant files. Name unverified acceptance items explicitly rather than calling the product complete.
