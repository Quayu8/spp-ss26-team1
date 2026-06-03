import { describe, expect, it } from 'vitest';
import { Group, Scene, Vector3 } from 'three';

import { ANCHOR_MODE, coSpawnAtWorldPose } from './co-spawn.js';

/**
 * Why these tests matter: the contrast demo is only honest if both objects
 * start at the *same world pose* despite living under different parent frames
 * (scene vs. arWorldGroup). A naive port that copies the same local position
 * into both parents would place them metres apart whenever arWorldGroup carries
 * any alignment transform. We pin world-pose coincidence under a non-trivial
 * arWorldGroup transform, plus the required snap-when-offscreen mode.
 */
describe('coSpawnAtWorldPose', () => {
  it('places both objects at the same WORLD pose under different parents', () => {
    const scene = new Scene();
    const arWorldGroup = new Group();
    scene.add(arWorldGroup);
    // Non-trivial alignment: translate + rotate the AR world group so a shared
    // *local* position would NOT coincide in world space.
    arWorldGroup.position.set(10, -1, 5);
    arWorldGroup.rotateY(Math.PI / 3);
    scene.updateMatrixWorld(true);

    const worldPosition = new Vector3(1, 2, 3);
    const { cube, anchorObject } = coSpawnAtWorldPose({
      scene,
      arWorldGroup,
      worldPosition: worldPosition.clone(),
    });

    scene.updateMatrixWorld(true);
    const cubeWorld = cube.getWorldPosition(new Vector3());
    const anchorWorld = anchorObject.getWorldPosition(new Vector3());

    expect(cubeWorld.distanceTo(worldPosition)).toBeLessThan(1e-6);
    expect(anchorWorld.distanceTo(worldPosition)).toBeLessThan(1e-6);
  });

  it('parents the cube under scene and the anchor object under arWorldGroup', () => {
    const scene = new Scene();
    const arWorldGroup = new Group();
    scene.add(arWorldGroup);
    scene.updateMatrixWorld(true);

    const { cube, anchorObject } = coSpawnAtWorldPose({
      scene,
      arWorldGroup,
      worldPosition: new Vector3(0, 0, 0),
    });

    expect(cube.parent).toBe(scene);
    expect(anchorObject.parent).toBe(arWorldGroup);
  });

  it('uses snap-when-offscreen (keeps the teaching jump out of view)', () => {
    expect(ANCHOR_MODE).toBe('snap-when-offscreen');
  });
});
