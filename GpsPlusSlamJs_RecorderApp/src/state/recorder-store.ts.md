# recorder-store.ts

## Purpose

Recorder-app composable Redux store. Wraps the framework's
[`createSlamAppStore`](../../../GpsPlusSlamJs_AppFramework/src/state/create-slam-app-store.ts.md)
and supplies the recorder-only slices via `extraReducers`:

- `routing` — local [routing-slice.ts](routing-slice.ts.md).
- `refPoints` — still framework-owned (moves out in Iter 3 per the
  [boundary plan](../../../../gps-plus-slam/GpsPlusSlamJs_Docs/docs/2026-05-03-appframework-vs-recorderapp-boundary-analysis.md)).

Re-exports the same library / framework symbols the legacy
`gps-plus-slam-app-framework/state/store` previously did, so consumer
call sites only changed their import path, not the imported names.

## Public API

- `createRecorderStore(options?)` — produces a `RecorderStore`.
- `RecorderStore` — `{ getState, dispatch, subscribe, writeFrame, writeSessionMetadata }`.
- `RecorderStoreOptions` — `{ onWriteFailure?, storageBackend?, enableDevChecks?, licenseKey? }`.
- `CombinedRootState` — `LibraryRootState & { recorder; refPoints; routing }`.
- `RootState`, `AppDispatch` — convenience type aliases.

## Invariants

- `storageBackend` defaults to `OpfsStorageBackend`. Tests / replay must
  pass `NullStorageBackend`.
- `licenseKey` defaults to the bundled community key via the framework
  factory; validation always runs and throws on invalid keys.
- `routing` is mounted as an `extraReducer` — the framework factory has
  no concept of routing.

## Examples

```ts
import { createRecorderStore } from './recorder-store';

const store = createRecorderStore({
  onWriteFailure: (err) => showToast(err.message),
});
store.dispatch(navigateTo('ar'));
```

## Tests

- [recorder-store.test.ts](recorder-store.test.ts) — combined-store
  integration coverage (slices wired, persistence routing, license
  validation). Migrated from the framework's now-removed `store.test.ts`.

## Related

- [routing-slice.ts](routing-slice.ts.md) — local routing slice.
- [Iter 1 plan](../../../../gps-plus-slam/GpsPlusSlamJs_Docs/docs/2026-05-03-appframework-vs-recorderapp-boundary-analysis.md).
