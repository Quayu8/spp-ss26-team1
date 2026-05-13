# `gps-anchor.ts`

## Purpose

`createGpsAnchor` is the GPS-anchored placement primitive for a single
`THREE.Object3D`. It owns the object's local transform inside an
`arWorldGroup`, computes the target world pose from a stored GPS
coordinate × the current alignment matrix, and decides when to commit
the new pose using a configurable mode flag.

This is the JS port of the C# `GpsAnchor` / `GpsAnchorForNonEcsGos`
sibling pair, merged into one component because in the JS scene-graph
world they only differ by the steady-state commit policy.

For the design rationale, state machine, threshold formulas, and
parenting rules see the dedicated port plan:
[2026-05-13-gps-anchor-port-plan.md](../../../../../gps-plus-slam/GpsPlusSlamJs_Docs/docs/2026-05-13-gps-anchor-port-plan.md).

## Status

This file currently implements **sub-step 2 (bootstrap phase)** of the
port plan. The steady-state recompute loop (sub-steps 3, 4), explicit
floor correction (sub-step 6), and the alignment-matrix delta tracking
that powers the large-jump bypass are not yet wired up — they are
follow-up TDD iterations in the same file. The public API is the
final shape so consumers do not need to change as later sub-steps
land.

## Public API

- `type GpsAnchorMode = 'snap-when-offscreen' | 'snap-every-tick'` —
  steady-state commit policy. Default `'snap-when-offscreen'`.
- `type GpsAnchorPhase = 'bootstrap' | 'anchored'`.
- `type GpsAnchorSamplePoint = LatLong | LatLongAlt`.
- `interface GpsAnchorOptions` — required: `object3D`, `arWorldGroup`,
  `camera`, `gpsPoint`, `getAlignmentMatrix`, `getGpsZeroRef`,
  `getCurrentGpsPoint`. Optional: `skipBootstrap`, `mode`, `floorY`,
  `distanceThreshold` (default 2 m), `angleThresholdInDegrees`
  (default 15°), `targetPosRefreshRateInSec` (default 3 s),
  `secondsToAccumulateGpsPose` (default 7 samples at 1 Hz),
  `settlingSeconds` (default 0), `heightAboveGround`.
- `createGpsAnchor(options) → GpsAnchor` — the factory.
- `interface GpsAnchor` — `phase`, `isFullyAnchored`, `gpsPoint`,
  `markMovedExternally()`, `setGpsPoint(point)`, `dispose()`.

The `__tickForTests(dt, elapsed)` method is exposed on the returned
object as an `@internal` testing seam in lieu of pumping the global
`runFrameUpdates`. Production code MUST NOT call it.

## Invariants & assumptions

- **No nested anchors**: a `THREE.Object3D` whose parent chain already
  contains a `GpsAnchor`-managed object cannot be anchored — the
  constructor throws. Mirrors the C# invariant. Implementation: a
  module-level `WeakSet<Object3D>` tracks managed objects.
- **Self-registers with the frame loop**: the anchor registers via
  `registerFrameUpdate` at construction time and unregisters in
  `dispose()`. Callers do not pump it manually.
- **`elapsed` is monotonic seconds**: tied to `XRFrame.time / 1000`.
  Tests inject controlled values via `__tickForTests`.
- **Bootstrap median is per-coordinate**: `lat`, `lon`, and (if any
  sample carries one) `altitude` are independently medianed. Per-coord
  median is more robust to single-axis spikes than a vector median.
- **Sampling rate is 1 Hz**: at most one sample collected per second
  of wall-clock `elapsed`. The `secondsToAccumulateGpsPose` field is
  the *sample count* (default 7), not the window length — together
  with 1 Hz sampling this is also the window length in the default
  case.
- **`getCurrentGpsPoint` returning null is a non-error**: the tick is
  silently skipped (no sample pushed, `lastSampleAtElapsed` not
  updated, so the next tick will retry). Mirrors "no fix yet".
- **`gpsPoint` getter reflects the committed pose**: during
  `'bootstrap'` it is the seed; after the median is committed it is
  the median. Callers may use it to decide visibility (e.g. ghost the
  object until `isFullyAnchored`).

## Examples

```ts
import { createGpsAnchor } from 'gps-plus-slam-app-framework/visualization';

const anchor = createGpsAnchor({
  object3D: myMesh,
  arWorldGroup,
  camera,
  gpsPoint: { lat: 48.0, lon: 11.0 },  // seed
  getAlignmentMatrix: () => store.getState().gpsData.alignmentMatrix,
  getGpsZeroRef: () => store.getState().gpsData.zero,
  getCurrentGpsPoint: () => store.getState().gpsData.latest?.position ?? null,
  mode: 'snap-when-offscreen',
});

// Later, on user drag or re-survey:
anchor.markMovedExternally();
```

## Tests

See [gps-anchor.test.ts](gps-anchor.test.ts). Coverage:

- Initial phase + isFullyAnchored.
- `skipBootstrap: true` short-circuit.
- 1 Hz sampling and median commit at the configured count.
- Median robustness against a single outlier.
- `settlingSeconds` window correctly suppresses sampling.
- `null` GPS reading: tick is skipped, not counted as a sample.
- `markMovedExternally` resets the buffer and re-bootstraps.
- `dispose` unregisters from the frame loop.
- Nested-anchor detection throws.

## Related docs

- [port plan](../../../../../gps-plus-slam/GpsPlusSlamJs_Docs/docs/2026-05-13-gps-anchor-port-plan.md) —
  full design, sub-step list, test matrix.
- [`frustum-visibility.ts`](frustum-visibility.ts.md) — supplies
  `isObjectInCameraFrustum` for the upcoming `'snap-when-offscreen'`
  steady state.
- [`ar/frame-loop.ts`](../ar/frame-loop.ts.md) — the registry the
  anchor self-registers with.
- [`sync-gps-anchored-meshes.ts`](../../../../GpsPlusSlamJs_RecorderApp/src/visualization/sync-gps-anchored-meshes.ts.md) —
  the bulk counterpart for many-spheres-one-geometry use cases.
