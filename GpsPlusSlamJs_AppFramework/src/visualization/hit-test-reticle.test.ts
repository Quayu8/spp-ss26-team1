import { describe, expect, it } from 'vitest';
import { Matrix4, Object3D, Vector3 } from 'three';

import { createReticleMesh, updateReticle } from './hit-test-reticle.js';

/**
 * Why these tests matter: the reticle view-model is the small piece of the
 * hit-test glue most likely to be ported incorrectly. We pin two invariants
 * that the per-frame XR plumbing in each app relies on every frame:
 *   1. a hit pose makes the reticle visible AND adopts the pose verbatim, and
 *   2. the absence of a hit hides the reticle (otherwise a stale reticle would
 *      stick to the last surface).
 */
describe('createReticleMesh', () => {
  it('starts hidden with manual matrix updates (so the hit pose is not clobbered)', () => {
    const reticle = createReticleMesh();
    expect(reticle.visible).toBe(false);
    expect(reticle.matrixAutoUpdate).toBe(false);
  });
});

describe('updateReticle', () => {
  it('adopts the hit pose matrix and shows the reticle', () => {
    const reticle = new Object3D();
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;

    // A pose translated to (1, 2, 3): column-major identity with translation in
    // the last column's first three rows (elements 12,13,14).
    const pose = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 2, 3, 1];
    updateReticle(reticle, pose);

    expect(reticle.visible).toBe(true);
    expect(reticle.matrix.elements[12]).toBe(1);
    expect(reticle.matrix.elements[13]).toBe(2);
    expect(reticle.matrix.elements[14]).toBe(3);
  });

  it('hides the reticle when there is no hit (null)', () => {
    const reticle = new Object3D();
    reticle.visible = true;
    updateReticle(reticle, null);
    expect(reticle.visible).toBe(false);
  });

  it('accepts a Float32Array pose matrix (XRPose.transform.matrix shape)', () => {
    const reticle = new Object3D();
    reticle.matrixAutoUpdate = false;
    const pose = new Float32Array([
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 6, 7, 1,
    ]);
    updateReticle(reticle, pose);
    expect(reticle.visible).toBe(true);
    expect(reticle.matrix.elements[14]).toBe(7);
  });

  // Why this matters: the reticle is parented under arWorldGroup, whose matrix
  // carries the GPS alignment (alignment × WEBXR_TO_NUE). The hit pose is in the
  // WebXR reference space (the scene-root/world frame). If updateReticle wrote
  // that world pose straight into the reticle's LOCAL matrix, the parent's
  // alignment would double-apply and the reticle would drift off screen-centre
  // (the bug reported on-device: up axis right, but it slides to the side as the
  // alignment rotates). The reticle's resulting WORLD pose must equal the live
  // hit pose regardless of the parent transform.
  it("keeps the reticle's world pose equal to the hit pose under a transformed parent", () => {
    // arWorldGroup carries a 90°-yaw + translation alignment (non-identity).
    const arWorldGroup = new Object3D();
    arWorldGroup.matrixAutoUpdate = false;
    arWorldGroup.matrix
      .makeRotationY(Math.PI / 2)
      .setPosition(new Vector3(10, 20, 30));

    const reticle = new Object3D();
    reticle.matrixAutoUpdate = false;
    arWorldGroup.add(reticle);

    // A hit pose at world (1, 2, 3) under the screen centre.
    const pose = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 2, 3, 1];
    updateReticle(reticle, pose);

    // Compose the reticle's world matrix the way three.js would during render.
    const reticleWorld = new Matrix4().multiplyMatrices(
      arWorldGroup.matrix,
      reticle.matrix
    );
    const worldPosition = new Vector3().setFromMatrixPosition(reticleWorld);

    expect(reticle.visible).toBe(true);
    expect(worldPosition.x).toBeCloseTo(1, 6);
    expect(worldPosition.y).toBeCloseTo(2, 6);
    expect(worldPosition.z).toBeCloseTo(3, 6);
  });
});
