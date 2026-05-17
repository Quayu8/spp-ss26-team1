# tracking-quality.ts

## Purpose

Phase A of the tracking-quality / GPS↔SLAM convergence reporter described in
[docs/2026-05-16-tracking-quality-metrics-plan.md](../../../../../gps-plus-slam/GpsPlusSlamJs_Docs/docs/2026-05-16-tracking-quality-metrics-plan.md).
Computes a single `TrackingQualityReport` from already-public Redux state
(`gpsData`, `tracking`, `recording`) plus a small auxiliary slice
(`trackingQuality`) that buffers the last N alignment matrices.

Five sub-scores, each in `[0, 1]`, gate a single overall `confidence` value
(`min(...)`):

- **convergence** (§4.1) — how stable consecutive alignment matrices are.
- **residualConsensus** (§4.2) — agreement between odometry-projected pose and
  GPS fixes, normalised by `latLongAccuracy`.
- **compassAgreement** (§4.3) — bearing the alignment claims vs. the absolute
  compass reading (skipped when `absolute !== true`).
- **gpsAccuracy** (§4.4) — median reported `latLongAccuracy` over the recent
  K samples.
- **coverage** (§4.5) — combination of walked distance and direction spread.

Each sub-score is exposed alongside human-readable diagnostics. A coarse
state machine collapses the score to `'warming-up' | 'ar-lost' | 'degraded' |
'ok'`.

## Public API

- **Functions**
  - `computeTrackingQualityReport(state, options?)` — pure aggregator over the
    base `SlamAppRootState` (extended with `trackingQuality`).
  - `computeConvergence(snapshots, options?)` / `matrixDelta(a, b)` — §4.1.
  - `computeResidualConsensus(matrix, gps, odom, zeroRef, options?)` — §4.2.
  - `computeCompassAgreement(matrix, sensorOrientation, arPose, options?)` —
    §4.3.
  - `computeGpsAccuracy(gpsPoints, options?)` — §4.4.
  - `computeCoverage(odomPositions, options?)` — §4.5.
  - `computeGpsVsFusedDivergence(...)` — §4.6 diagnostic only.
  - `createTrackingQualityListenerMiddleware(options?)` — Redux listener that
    buffers alignment matrices and recomputes the report on relevant actions.
- **Reducer / actions**
  - `trackingQualityReducer`.
  - `snapshotPushed(AlignmentSnapshot)`, `snapshotsTrimmed({size})`,
    `reportUpdated(report | null)`, `firstAgreementReached(observationIndex)`,
    `resetTrackingQuality()`.
- **Selectors**
  - `selectTrackingQuality(state)`, `selectRecentAlignments(state)`,
    `selectFirstAgreementObservationIndex(state)`.
- **Constants / types**
  - `DEFAULT_TRACKING_QUALITY_OPTIONS` (seed values from the plan; will be
    tuned on the TestDataJs corpus in Phase B).
  - `TrackingQualityState`, `TrackingQualityReport`, `TrackingQualityOptions`,
    `AlignmentSnapshot`, `TrackingQualitySliceState`,
    `ConvergenceResult`, `ResidualConsensusResult`, `GpsAccuracyResult`,
    `CoverageResult`, `CompassAgreementResult`.

All inputs are treated as **readonly**. Helpers never mutate arrays they
receive — copies are taken before sorting or sliding-window operations.

## Invariants & assumptions

- `Matrix4` is column-major (per `fusedGpsFromOdom` in `gps-plus-slam-js`).
- `Vector3` uses the library's NUE convention: `[north, up, east]` (metres).
  Coverage / bearing math reads `[0]` as north and `[2]` as east; up is
  ignored.
- The reported AR-forward axis is the GL-camera convention `(0, 0, -1)`. This
  matches the camera-quaternion rotation produced by WebXR and by
  `recordGpsEvent`'s synthetic pose.
- Listener middleware **defends against missing slice state** (`state.trackingQuality?`)
  so it stays usable in tests/stores that only mount a subset of slices.
- Listener middleware uses **shallow change detection** — `reportUpdated` is
  only dispatched when the freshly-computed report differs from the previously
  cached one (using `reportsEqual`).
- Reset triggers (`recording/startSession`, `tracking/resetTracking`) clear
  both the matrix buffer and the cached report.
- Compass score returns `null` (and is excluded from `min`) when the device
  doesn't report an absolute heading. This is by design — magnetometers on
  iOS report `absolute === false` until a calibration succeeds.
- All sub-scores are clamped to `[0, 1]`; never `NaN` for empty input.

## Defensive measures

- `matrixDelta` validates length-16 matrices and returns zero deltas otherwise.
- `computeResidualConsensus` returns score 0 (and `null` median) when alignment
  matrix or zero reference is missing.
- `computeGpsAccuracy` skips entries with non-finite `latLongAccuracy`.
- `computeCoverage` handles zero or one odom samples and pure stand-still loops.
- `computeCompassAgreement` returns all-null fields when the sensor isn't
  absolute, the alignment matrix is missing, or the AR pose is unavailable.

## Examples

```ts
import {
  createTrackingQualityListenerMiddleware,
  trackingQualityReducer,
  selectTrackingQuality,
} from 'gps-plus-slam-app-framework';

const store = configureStore({
  reducer: { /* ... */, trackingQuality: trackingQualityReducer },
  middleware: (gdm) =>
    gdm({ serializableCheck: false }).prepend(
      createTrackingQualityListenerMiddleware()
    ),
});

store.subscribe(() => {
  const report = selectTrackingQuality(store.getState());
  if (report?.state === 'ok') console.log('confidence:', report.confidence);
});
```

## Tests

- Co-located unit tests: [tracking-quality.test.ts](tracking-quality.test.ts) —
  38 tests covering pure helpers, slice reducers, the aggregator
  state-machine, anti-validation cases from plan §6, and the listener
  middleware contract.
- Investigation sweep (Phase B): `GpsPlusSlamJs_Investigation/src/tracking-quality.test.ts`
  (to be added) will exercise the report against the `TestDataJs/` corpus.

## Related docs

- Plan: [2026-05-16-tracking-quality-metrics-plan.md](../../../../../gps-plus-slam/GpsPlusSlamJs_Docs/docs/2026-05-16-tracking-quality-metrics-plan.md)
- Rotation conventions: [2026-04-08-rotation-convention-plan.md](../../../../../gps-plus-slam/GpsPlusSlamJs_Docs/docs/2026-04-08-rotation-convention-plan.md)
- Tracking slice: [tracking-slice.ts.md](tracking-slice.ts.md)
