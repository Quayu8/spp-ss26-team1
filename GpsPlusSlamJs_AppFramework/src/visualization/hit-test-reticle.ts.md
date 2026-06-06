# hit-test-reticle.ts

## Purpose

The shared hit-test reticle for the framework's example/starter apps — a
faithful port of the reticle from the stock three.js `webxr_ar_hittest` example.
It is the small, deterministic "reticle view-model": given the latest hit-test
pose (a column-major 4×4 transform) or `null`, it drives a Three.js mesh's
visibility + transform.

The per-frame XR plumbing (requesting the hit-test source, reading
`frame.getHitTestResults(...)`) lives in each app's WebXR glue; only the logic
here is unit-tested because it is what a porting developer is most likely to get
subtly wrong.

## Public API

- `type HitMatrix = Float32Array | number[]` — a column-major 16-element
  transform, as produced by `XRPose.transform.matrix`.
- `createReticleMesh(): Mesh` — builds a thin ring laid flat in the XZ plane.
  Returns a mesh with `matrixAutoUpdate = false` and `visible = false`.
- `updateReticle(reticle: Object3D, matrix: HitMatrix | null): void` — applies
  the pose:
  - non-null 16-element matrix → the reticle's **world** pose adopts it and the
    reticle becomes visible. The pose is in the WebXR reference space (the
    three.js scene-root/world frame); when the reticle has a parent (e.g.
    `arWorldGroup`, which carries the GPS alignment) the pose is converted into
    the parent's local space so the reticle's _world_ pose equals the hit pose
    regardless of the parent transform. With no parent the local matrix adopts
    the pose verbatim.
  - `null` → reticle is hidden.

Exported from `gps-plus-slam-app-framework/visualization`.

## Invariants & assumptions

- `matrixAutoUpdate` **must** stay `false` on the reticle: the world transform
  is written wholesale from the hit pose each frame, so letting Three.js
  recompose it from position/quaternion/scale would discard the pose.
- The mesh is parented under `getArWorldGroup()` (AR-local space) by the caller,
  **not** the GPS-aligned scene root — so any placed content shares the same
  scene subtree. Because the hit pose is a **live world-space pose**, the reticle
  itself must _not_ ride the parent's alignment: `updateReticle` cancels the
  parent transform (`reticle.matrix = parent.matrixWorld⁻¹ · pose`) so the
  reticle stays pinned under the screen centre. Writing the pose into the local
  matrix directly (the previous behaviour) double-applied `arWorldGroup`'s
  alignment and drifted the reticle sideways on-device.
- `updateReticle` operates on any `Object3D`, so it is testable without a WebGL
  context. It does not validate matrix length; callers pass the 16-element
  `XRPose.transform.matrix`.

## Examples

```ts
import {
  createReticleMesh,
  updateReticle,
} from 'gps-plus-slam-app-framework/visualization';

const reticle = createReticleMesh();
arWorldGroup.add(reticle);
// each XR frame:
updateReticle(reticle, hitPose ? hitPose.transform.matrix : null);
```

## Tests

[hit-test-reticle.test.ts](hit-test-reticle.test.ts) — pins: the mesh starts
hidden with manual matrix updates; a hit pose makes it visible and is adopted
verbatim when unparented (including a `Float32Array` pose); a `null` hit hides it
(no stale reticle); and, under a transformed parent (a yaw+translation
alignment), the reticle's resulting **world** pose equals the hit pose (the
screen-centre-drift regression).

## Consumers

- `GpsPlusSlamJs_MinimalExample/src/main.ts` — tap-to-place reticle.
- `GpsPlusSlamJs_AnchorStarter/src/main.ts` — cache-miss placement reticle.
