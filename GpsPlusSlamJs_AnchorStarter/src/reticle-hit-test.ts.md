# reticle-hit-test.ts

## Purpose

WebXR glue that drives a screen-centre hit-test reticle for the cache-miss
placement flow. It parents the framework's reticle mesh under `arWorldGroup` and
moves/shows/hides it from the XR frame loop, exposing a small `ReticleHandle`
the `#place-button` glue reads at press time.

The reticle _view-model_ (`createReticleMesh` / `updateReticle`) is the
framework's tested [hit-test-reticle.ts](../../GpsPlusSlamJs_AppFramework/src/visualization/hit-test-reticle.ts);
only the device-only per-frame plumbing lives here.

## Public API

- `interface ReticleHandle`:
  - `isVisible(): boolean` — is a surface under the screen-centre reticle?
  - `getWorldPosition(out: Vector3): Vector3` — the reticle's current world pose
    (GPS-world NUE once `arWorldGroup` carries the alignment).
  - `dispose(): void` — remove the mesh + unregister the frame loop (idempotent).
- `startReticleHitTest({ arWorldGroup }): ReticleHandle` — install + start.

## Invariants & assumptions

- AnchorStarter does **not** wire a `select` (tap) handler — placement is the
  `#place-button`, unlike the MinimalExample.
- The reticle stays hidden until a hit-test source is obtained and a surface is
  found; on older runtimes without `requestHitTestSource` it stays hidden.
- `dispose()` is idempotent (guarded), so disposing on successful placement and
  again on `beforeunload`/boot-rollback is safe.
- Swapped wholesale in e2e via the `startReticleHitTest` seam (Playwright
  Chromium has no WebXR), so the per-frame loop here is verified on-device only.

## Examples

```ts
const handle = startReticleHitTest({ arWorldGroup });
// at Place time:
if (handle.isVisible()) {
  const worldPose = handle.getWorldPosition(new Vector3());
  // …place the marker at worldPose…
}
handle.dispose();
```

## Tests

The per-frame XR loop is device-only glue (no unit test). The placement decision
it feeds is unit-tested in
[placement-decision.test.ts](placement-decision.test.ts), and the e2e
[placement-flow.spec.js](../playwright-tests/placement-flow.spec.js) drives the
seam fake to assert the reticle gate (visible → places; hidden → hint).
