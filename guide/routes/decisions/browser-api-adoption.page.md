# ADR-0020 · Browser API Adoption Plan

**Status**: Living document

A running ledger of newer browser APIs to adopt selectively when the
framework's architecture lets it deliver them transparently.

## Adopted

- **Container queries** (1.11.0) — widgets auto-set `container-type:
  inline-size`. Every widget becomes a natural container; consumer CSS
  can use `@container` against widget sizes for free.

## On the table

- `:has()` + custom states (`CustomStateSet`) — already documented.
- `AbortSignal.timeout()` — replaces manual `setTimeout` cleanup in
  `getData()`.
- `CloseWatcher` — unifies dialog/popover dismissal across keyboard,
  back gesture, and OS-level events.
- CSS anchor positioning — to evaluate once Safari ships it.

## Why a plan, not a release

Browser APIs ship asynchronously across vendors. A flat "adopt
everything" policy leads to feature cliffs in non-Chromium browsers. A
running document lets each API be evaluated when broad support arrives,
with emroute taking advantage of whichever ones land in a way that
benefits *all* consumers, not just Chromium users.

[All decisions](.) · [On GitHub](https://github.com/emko-io/emroute/blob/main/doc/architecture/ADR-0020-browser-api-adoption.md)
