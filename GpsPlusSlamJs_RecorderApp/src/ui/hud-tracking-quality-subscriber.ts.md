# `hud-tracking-quality-subscriber.ts`

## Purpose

Wires the recorder app's HUD (`updateTrackingQuality`) to the
tracking-quality slice of the **currently active** store, surviving the
store swap that happens on `Start Recording` / replay. F1 fix from
[2026-05-26-tracking-quality-regression-and-replay-gaps-user-feedback.md](../../../../gps-plus-slam/GpsPlusSlamJs_Docs/docs/2026-05-26-tracking-quality-regression-and-replay-gaps-user-feedback.md).

## Public API

- `subscribeHudToTrackingQuality({ storeRef, updateHud }) → dispose`
  - `storeRef: StoreRef<RecorderStore>` — observable accessor for the
    current store (see `state/store-ref.ts`).
  - `updateHud(report)` — called with each non-redundant
    `TrackingQualityReport`. The same report reference is never delivered
    twice (selector identity is the dedup key).
  - Returns a `dispose()` function that detaches both the per-store
    `store.subscribe` and the `storeRef.subscribe` listener.

## Invariants

- On construction, the current store's report (if any) is pushed
  through `updateHud` immediately. The HUD therefore reflects the
  initial state without waiting for the first dispatch.
- On every store swap (`storeRef.set(newStore)`), the old subscription
  is detached, `lastReport` is reset against the new store, and the
  new store's current report is pushed through `updateHud` if present.
  The next dispatch on the new store then drives updates as usual.
- The `null` report from `selectTrackingQuality` is treated as "nothing
  to render"; `updateHud` is not called with `null`.
- Dedup is by selector-identity (`report !== lastReport`), matching the
  framework's `reportUpdated` slice contract — the reducer only assigns
  a new reference when the report content actually changes.

## Tests

- `hud-tracking-quality-subscriber.test.ts` — covers the bare contract
  (initial push, swap rewires, dispose, dedup).
- The recorder-app integration test (see the field-test feedback doc
  §3) exercises the full chain end-to-end against a real recording.
