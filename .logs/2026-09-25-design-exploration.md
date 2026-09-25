# Four visual directions

- Request: explore a new appearance and provide concrete mockups for selection after the user confirmed the 0.1.1 patch works.
- Delivered: Slate, Canvas, Signal and Archive; interactive download lists, popup and in-page control specimens; English design rationale with primary design references.
- Implementation boundary: original scoped HTML/CSS and sample-only interactions. No production or installed extension/helper changes, network calls or user-data mutations.
- Validation: isolated Chrome preview smoke passed eight variants, responsive widths, default popup height, local state interactions and no page errors. Screenshots inspected. Readability adjustments required tightening Archive popup spacing; rerun passed.
- Records: source in `design/`, smoke script in `scripts/`, generated evidence in ignored `artifacts/design/`, status in `DOCUMENTATION.md`.
- Remaining: owner selection, then implementation of the selected presentation within the existing contracts. No product/architecture/security/licensing change.
