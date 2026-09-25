# MediaFetch visual exploration

Date: 2026-09-25. Status: the owner selected A — Slate. Extension 0.1.2 implements that direction; see [production evidence](../DOCUMENTATION.md#slate-implementation-012--2026-09-25). The original four-concept exploration and sample-only preview are preserved below as design context.

## Design problem

The working MVP gives its identity, introductory text and setup guidance more prominence than the recurring task: finding a download, understanding its state and taking the next action. The green palette and spacious card grid make the list feel like a landing page. This is a design assessment, not a measured usability finding.

The proposals move attention to the job list. A compact entry form, consistent row alignment, textual status and clear groups make downloads easier to scan. Helper status stays visible but quiet. Stop, Continue, Retry and removal remain distinct. The popup shows a short recent list and a route to the full list, keeping the default concept below 600px tall at 408px wide.

## Four directions

| Direction | Visual decisions | Best fit | Tradeoff |
| --- | --- | --- | --- |
| A — Slate | Cool graphite, restrained lavender, compact navigation, sans-serif titles, aligned rows | A calm everyday desktop utility | Familiar rather than expressive; the sidebar consumes some width |
| B — Canvas | White surfaces, blue accent, soft corners, generous spacing, no sidebar | Clear, approachable use in a light environment | A longer list uses more vertical space |
| C — Signal | Ink and acid-lime, narrow icon rail, monospaced labels, sharp corners, prominent active transfer | A bold tool with visible transfer activity | Stronger contrast and personality can become tiring; hierarchy must stay disciplined |
| D — Archive | Warm paper, rust accent, serif titles, numbered entries, horizontal rules | A personal collection with an editorial character | Long titles and many concurrent jobs need more space |

Recommendation: start with Slate if the owner wants a restrained dark utility. Canvas is the strongest light alternative. Signal and Archive deliberately test more opinionated identities. Palette, density and typography can be combined after the owner selects a direction; shipping a theme picker is not implied by this exploration.

## Research translated into choices

- [Fluent 2 layout guidance](https://fluent2.microsoft.design/layout) uses proximity, spacing, alignment and hierarchy to express relationships. Here, the source, quality, progress and actions belong to one aligned job row; group spacing separates state categories.
- [Linear's UI redesign case study](https://linear.app/now/how-we-redesigned-the-linear-ui) describes reducing visual noise, distinguishing navigation from task content and testing density and appearance. Here, introductory chrome is reduced and the same realistic job states appear across all four concepts. These are original MediaFetch compositions, not copied product screens.

The research informs layout principles; it does not prove a particular concept is more usable. The owner's preference is the next design input.

## Scope and interaction fidelity

`mediafetch-directions.html` is an HTML fragment for the conversation preview. It contains a full download-list concept plus a popup and an in-page button specimen for every direction. All labels and sample content are English. Sample jobs, progress, dates and quality values are illustrative. The in-page video is an explicit placeholder.

The controls simulate local state only: Stop, Continue, Retry, partial deletion, individual removal, Remove all, queueing, Settings and Reset. There are no Chrome, helper, filesystem or download calls. Remove all preserves the simulated active and stopped jobs; production eligibility remains the helper's authoritative contract, including checks for real partial files. Settings demonstrate layout and are not persisted to the extension. Only presentation choices can be remembered by the conversation host.

No thumbnail fetching, new provider, library indexing, cloud account, redesigned engine or new permission is proposed. The full-list grouping and popup content limit are presentation proposals. Actual Settings, setup/error guidance, multi-video selection and less common job states still need to be carried through when the selected direction is implemented. The inline control must retain the verified Reddit/X anchors and GIF filtering.

## Validation and reproduction

Render the fragment with the installed visualize skill's `scripts/render.py` into `artifacts/mediafetch-directions-preview.html`, then run:

```powershell
$env:MEDIAFETCH_TEST_CHROME = 'C:\project\MediaFetch\.local\chrome-stable\chrome-win64\chrome.exe'
pnpm exec node scripts/design-smoke.mjs
```

The renderer wraps the fragment in an iframe and provides the preview host styles and icons. For this development environment, its path is `C:\Users\ckajs\.codex\plugins\cache\openai-bundled\visualize\1.0.39\skills\visualize\scripts\render.py`. Invoke it with the absolute fragment path and preview destination; use `--force` when regenerating the preview. The preview wrapper is generated evidence, not part of the extension bundle.

Passed: all four list and popup variants; default popup height at 408px; no horizontal overflow at 736px, 360px and 320px; local Stop/Continue/Remove all/Settings/queue/Reset interactions; no JavaScript page errors. Screenshots of all eight variants were visually inspected. Small supporting text was raised to 11px and Archive's muted text darkened. A resulting 603px popup was tightened through spacing and passed the height check on rerun.

Evidence: ignored `artifacts/design/*.png` and `artifacts/design/validation.json`. These are design-preview checks, not extension integration tests, a full accessibility audit or validation in the user's live browser. Production code, installed files and the helper were unchanged. After selection, implementation can proceed within the existing architecture with appropriate extension checks and manual visual review.
