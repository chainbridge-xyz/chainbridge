# Diagrams

Six diagrams covering every flow in ChainBridge, defined in code and rendered
to SVG. The shipped artifacts are in [`exports/`](exports/); the `.excalidraw`
form is an optional side output for canvas editing, and is not kept in the repo.

```bash
python3 docs/diagrams/build.py    # -> exports/*.svg
```

## What each one shows

| Diagram | Shows | Use it for |
|---|---|---|
| [`01-system-overview`](exports/01-system-overview.svg) | Agent → SDK modules → Base. Solid boxes are shipped, dashed are designed-only. | The one-slide "what is this" |
| [`02-x402-payment-flow`](exports/02-x402-payment-flow.svg) | Three lanes — agent, seller, USDC — through the full 402 → sign → retry → settle round trip. | Explaining the wedge |
| [`03-wallet-provisioning`](exports/03-wallet-provisioning.svg) | Counterfactual address, then the four-stage build pipeline, then bundler → EntryPoint → deployed Safe. | Onboarding anyone to `@chainbridge/wallet` |
| [`04-eip3009-signer-constraint`](exports/04-eip3009-signer-constraint.svg) | Why a smart account cannot sign EIP-3009 and the EOA must. | The finding that shapes every code sample |
| [`05-settlement-models`](exports/05-settlement-models.svg) | ADR-004 side by side — self-host vs facilitator — with the measured gas economics. | Investor and partner conversations |
| [`06-identity-registry`](exports/06-identity-registry.svg) | Controller + nonce → `agentId` → on-chain record, and why the id format beats the alternatives. | Explaining ERC-8004 identity |

If you only ever show two, show **02** and **04**. The first is the product;
the second is the non-obvious constraint that proves you actually built it.

## Editing on the Excalidraw canvas

Still possible when you want to move something by hand:

```bash
python3 docs/diagrams/build.py --excalidraw
```

Then open the generated file at [excalidraw.com](https://excalidraw.com) —
**File → Open**, or drag it onto the canvas.

Canvas edits are throwaway, though: the next `build.py` run overwrites the file.
For a change that should survive, edit `build.py` and regenerate. If you do want
to keep a hand-tweaked version, export it from Excalidraw straight into
`exports/` under the same base name — the docs site takes whatever is there and
doesn't care which tool produced it.

`build.py` uses fixed seeds, so output is byte-stable between runs: regenerating
produces no diff unless the content actually changed, which keeps the SVGs
reviewable in git.

## Exporting images

`build.py` writes SVG for all six in one pass — no browser, no manual step per
file. It works because these are drawn in architect mode (roughness 0), which
is plain geometry with no sketch simulation to reproduce.

If you need a **PNG for slides**, that's the one thing it doesn't do. Run
`build.py --excalidraw`, open the file at excalidraw.com, then
**File → Export image…** at 2×. Tick *Background* for slides. Leave *Dark mode*
off — the docs site handles its own theming, and a dark export baked into a
light page won't invert.

## Putting them in the docs site

Nothing to do here. The
[docs site](https://github.com/chainbridge-xyz/chainbridge-docs) copies
`exports/*.svg` into its own `public/diagrams/` on `npm run sync`, and pages
reference them by base name:

```mdx
<Diagram src="02-x402-payment-flow" caption="One paid HTTP request, end to end." />
```

So a regenerated export reaches the site by running the sync there and
committing the result — the same step that picks up an edited ADR. Adding a
*new* diagram additionally needs a `<Diagram>` call on whichever page should
carry it; nothing auto-places them.

This used to be a base64 injection step, back when the docs were one
self-contained HTML file whose security policy blocked external requests. On a
real site the SVGs are just files, and serving them separately means they cache
instead of being re-sent with every page.

## Visual system

The diagrams share the documentation site's colour tokens, so an exported
image drops onto the page without a clash. They're drawn in Excalidraw's
"architect" mode — clean lines rather than the sketchy default, which reads as
a whiteboard doodle next to the site's typography.

Only three hues carry meaning. Everything else is encoded by fill and stroke
style instead — fewer hues read as more deliberate, and survive being projected
in a meeting room or printed in greyscale:

| Treatment | Means |
|---|---|
| Petrol, filled | ChainBridge's own code — and, in diagram 04, the path that works |
| Bronze, filled | On-chain: contracts, EntryPoint, settled state |
| Ink, outlined | Actors and external systems — the agent, a seller API |
| Grey, dashed | Designed but not built |
| Crimson, filled | A constraint, or a rejected path |
