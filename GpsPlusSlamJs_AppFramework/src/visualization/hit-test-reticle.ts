/**
 * Hit-test reticle — the small, deterministic "reticle view-model" shared by
 * the framework's example/starter apps.
 *
 * A faithful port of the reticle from the stock three.js `webxr_ar_hittest`
 * example: a flat ring laid on whatever real-world surface the WebXR
 * `hit-test` API reports under the screen centre. The framework delta is
 * *where* the mesh is parented — apps add it under `getArWorldGroup()`
 * (AR-local space) rather than the GPS-aligned scene root, so the reticle and
 * any placed content ride the same lerped `arWorldGroup` alignment.
 *
 * The per-frame XR plumbing (requesting the hit-test source, reading
 * `frame.getHitTestResults(...)`) stays in each app's WebXR glue and is
 * verified manually on-device. The two functions here are the unit-tested core:
 * given the latest hit pose (a column-major 4x4 transform matrix) or `null`,
 * drive the mesh's visibility + transform. They are unit tested because that is
 * the logic a porting developer is most likely to get subtly wrong (e.g.
 * forgetting to hide the reticle when no surface is found, or letting Three.js
 * overwrite the matrix).
 */
import {
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  RingGeometry,
} from 'three';

/** A column-major 4x4 transform, as produced by `XRPose.transform.matrix`. */
export type HitMatrix = Float32Array | number[];

// Per-frame scratch matrices reused across `updateReticle` calls to avoid
// allocating a fresh `Matrix4` every animation frame.
const hitPoseMatrix = /* @__PURE__ */ new Matrix4();
const parentInverseWorldMatrix = /* @__PURE__ */ new Matrix4();

/**
 * Build the reticle mesh: a thin ring oriented flat (rotated to lie in the
 * XZ plane) so it reads as a marker on the ground/wall.
 *
 * `matrixAutoUpdate` is disabled because the reticle's world transform is
 * written wholesale from the hit-test pose every frame; letting Three.js
 * recompose it from position/quaternion/scale would discard that pose.
 *
 * The mesh starts hidden (`visible = false`) — there is no surface yet.
 */
export function createReticleMesh(): Mesh {
  const reticle = new Mesh(
    new RingGeometry(0.07, 0.09, 32).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ color: 0x4f8cff })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  return reticle;
}

/**
 * Apply the latest hit-test pose to the reticle.
 *
 * - When `matrix` is a 16-element transform, the reticle's **world** pose adopts
 *   it and the reticle becomes visible.
 * - When `matrix` is `null` (no surface under the screen centre, or the
 *   hit-test source is not ready yet), the reticle is hidden.
 *
 * The hit-test pose is expressed in the WebXR reference space — i.e. the
 * three.js scene-root/world frame. The reticle, however, is parented under
 * `getArWorldGroup()`, whose matrix carries the GPS alignment
 * (`alignment × WEBXR_TO_NUE`). Writing the world-space pose straight into the
 * reticle's *local* matrix would let that parent transform double-apply, so the
 * reticle would drift off screen-centre as the alignment rotates (only the up
 * axis stays roughly right). To keep the reticle pinned under the screen centre
 * we convert the world-space pose into the reticle's parent-local space, so its
 * resulting *world* pose equals the live hit pose regardless of alignment.
 *
 * Works on any `Object3D` (not just the mesh from `createReticleMesh`) so it can
 * be unit tested without a WebGL context.
 */
export function updateReticle(
  reticle: Object3D,
  matrix: HitMatrix | null
): void {
  if (matrix === null) {
    reticle.visible = false;
    return;
  }
  hitPoseMatrix.fromArray(matrix);
  const parent = reticle.parent;
  if (parent) {
    parent.updateWorldMatrix(true, false);
    parentInverseWorldMatrix.copy(parent.matrixWorld).invert();
    reticle.matrix.multiplyMatrices(parentInverseWorldMatrix, hitPoseMatrix);
  } else {
    reticle.matrix.copy(hitPoseMatrix);
  }
  reticle.visible = true;
}
