/**
 * Tests for `FrameTileVisualizer` — F3.3 of
 * [2026-05-26-tracking-quality-regression-and-replay-gaps-user-feedback.md](../../../../gps-plus-slam/GpsPlusSlamJs_Docs/docs/2026-05-26-tracking-quality-regression-and-replay-gaps-user-feedback.md).
 *
 * Texture decoding is deliberately not exercised here: the class
 * accepts a pre-built `THREE.Texture` so tests run cleanly under
 * jsdom (no `createImageBitmap`). The decode + broken-frame filter
 * live in `wireFrameTileSubscribers` (F3.4).
 *
 * Coordinate frame (2026-06-13 fix,
 * [2026-06-12-followup-frame-tile-visualizer-frame-check.md](../../../../gps-plus-slam/GpsPlusSlamJs_Docs/docs/2026-06-12-followup-frame-tile-visualizer-frame-check.md)):
 * `selectFrameTilesInWebXR` emits **raw WebXR** poses, so the
 * visualizer hangs tiles off a `WEBXR_TO_NUE` basis node under the
 * AR-space node (arWorldGroup) — the camera's `alignment × WEBXR_TO_NUE`
 * chain — NOT the scene root. The world-pose test below asserts this
 * under a *non-trivial* alignment, because (per lessons-learned)
 * identity fixtures hide a missing basis change.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { FrameTileVisualizer } from './frame-tile-visualizer';
import type { ArImageCapture } from 'gps-plus-slam-app-framework/core';
import { WEBXR_TO_NUE } from 'gps-plus-slam-app-framework/ar/webxr-nue-basis';

function makeFrame(overrides: Partial<ArImageCapture> = {}): ArImageCapture {
  return {
    imageFile: overrides.imageFile ?? 'frames/frame-000001.jpg',
    position: overrides.position ?? [1, 2, -3],
    rotation: overrides.rotation ?? [0, 0, 0, 1],
    screenRotation: overrides.screenRotation ?? 0,
    capturedAt: overrides.capturedAt,
  };
}

/** The basis node the visualizer parents all tiles under. */
function findBasisNode(parent: THREE.Object3D): THREE.Object3D {
  const node = parent.getObjectByName('frame-tile-basis');
  if (!node) {
    throw new Error('frame-tile-basis node not found under AR-space node');
  }
  return node;
}

function findTile(parent: THREE.Object3D, imageFile: string): THREE.Mesh {
  const mesh = parent.getObjectByName(`frame-tile-${imageFile}`);
  if (!(mesh instanceof THREE.Mesh)) {
    throw new Error(`tile mesh for "${imageFile}" not found`);
  }
  return mesh as THREE.Mesh;
}

describe('FrameTileVisualizer', () => {
  let arSpaceNode: THREE.Group;
  let texture: THREE.Texture;

  beforeEach(() => {
    arSpaceNode = new THREE.Group();
    texture = new THREE.Texture();
  });

  // Why: every accepted add2dImage must produce one visible tile, and its
  // LOCAL pose must be the captured raw-WebXR pose verbatim (the basis
  // node, not the tile, carries the WebXR→NUE conversion).
  it('adds one mesh per frame with the captured pose applied verbatim (local)', () => {
    const viz = new FrameTileVisualizer(arSpaceNode);
    viz.addTile(makeFrame({ position: [1, 2, -3] }), texture);

    const mesh = findTile(arSpaceNode, 'frames/frame-000001.jpg');
    expect(mesh.position.toArray()).toEqual([1, 2, -3]);
    expect(mesh.quaternion.toArray()).toEqual([0, 0, 0, 1]);
    expect(mesh.name).toBe('frame-tile-frames/frame-000001.jpg');
    expect(viz.getCount()).toBe(1);
  });

  // Why: this is the bug the fix closes. The selector emits raw WebXR
  // poses; without the basis node under arWorldGroup the tiles are
  // East/North axis-swapped and detached from the alignment matrix.
  it('parents tiles under a WEBXR_TO_NUE basis node on the AR-space node', () => {
    const viz = new FrameTileVisualizer(arSpaceNode);
    const basis = findBasisNode(arSpaceNode);
    expect(basis.matrixAutoUpdate).toBe(false);
    expect(basis.matrix.toArray()).toEqual(WEBXR_TO_NUE.toArray());

    // The tile is a child of the basis node, not of the AR-space node.
    viz.addTile(makeFrame(), texture);
    const mesh = findTile(arSpaceNode, 'frames/frame-000001.jpg');
    expect(mesh.parent).toBe(basis);
    viz.dispose();
  });

  // Why: the decisive regression test. A tile's WORLD pose must ride the
  // same `alignment × WEBXR_TO_NUE × pose` chain as the camera. A
  // non-trivial alignment (rotation + translation) is mandatory — an
  // identity fixture passes even with the old scene-root parenting.
  it('tile world pose rides alignment × WEBXR_TO_NUE — the camera chain', () => {
    const scene = new THREE.Scene();
    const arWorldGroup = new THREE.Group();
    arWorldGroup.matrixAutoUpdate = false;
    const alignment = new THREE.Matrix4()
      .makeRotationY(Math.PI / 3)
      .setPosition(10, -2, 5);
    arWorldGroup.matrix.copy(alignment);
    scene.add(arWorldGroup);

    const viz = new FrameTileVisualizer(arWorldGroup);
    // A non-identity tile rotation so the test also catches a dropped or
    // doubled rotation in the chain.
    const tileRot = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.PI / 4
    );
    viz.addTile(
      makeFrame({
        imageFile: 'frames/a.jpg',
        position: [1, 0.5, -2], // raw WebXR
        rotation: [tileRot.x, tileRot.y, tileRot.z, tileRot.w],
      }),
      texture
    );
    scene.updateMatrixWorld(true);

    const mesh = findTile(arWorldGroup, 'frames/a.jpg');
    // decompose (not setFromMatrix*) so the tile's 0.2 scale is factored
    // out of the extracted rotation.
    const world = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    mesh.matrixWorld.decompose(world, worldQuat, new THREE.Vector3());
    // Hand-converted NUE position: NUE_X = -WebXR_Z = 2, NUE_Y = 0.5,
    // NUE_Z = WebXR_X = 1 — then alignment maps it into GPS world.
    const expectedPos = new THREE.Vector3(2, 0.5, 1).applyMatrix4(alignment);
    expect(world.x).toBeCloseTo(expectedPos.x);
    expect(world.y).toBeCloseTo(expectedPos.y);
    expect(world.z).toBeCloseTo(expectedPos.z);

    // World rotation = alignmentQuat × basisQuat × tileRot.
    const expectedQuat = new THREE.Quaternion()
      .setFromRotationMatrix(alignment)
      .multiply(new THREE.Quaternion().setFromRotationMatrix(WEBXR_TO_NUE))
      .multiply(tileRot);
    // Quaternions are sign-ambiguous; compare |dot| ≈ 1.
    expect(Math.abs(worldQuat.dot(expectedQuat))).toBeCloseTo(1);

    viz.dispose();
  });

  // Why: tile size is observable via mesh.scale because the geometry
  // is a unit plane shared across all tiles. Default 20 cm keeps tiles
  // visible without dominating the scene.
  it('scales the shared unit-plane geometry to the configured size (20 cm default)', () => {
    const viz = new FrameTileVisualizer(arSpaceNode);
    viz.addTile(makeFrame(), texture);
    const mesh = findTile(arSpaceNode, 'frames/frame-000001.jpg');
    expect(mesh.scale.toArray()).toEqual([0.2, 0.2, 0.2]);
  });

  it('honours an explicit sizeMeters option', () => {
    const viz = new FrameTileVisualizer(arSpaceNode, { sizeMeters: 0.5 });
    viz.addTile(makeFrame(), texture);
    const mesh = findTile(arSpaceNode, 'frames/frame-000001.jpg');
    expect(mesh.scale.toArray()).toEqual([0.5, 0.5, 0.5]);
  });

  // Why: the slice is append-only; a duplicate dispatch must not
  // produce a second mesh or leak a second material.
  it('is idempotent on duplicate imageFile keys', () => {
    const viz = new FrameTileVisualizer(arSpaceNode);
    viz.addTile(makeFrame({ imageFile: 'frames/dup.jpg' }), texture);
    viz.addTile(makeFrame({ imageFile: 'frames/dup.jpg' }), texture);
    const basis = findBasisNode(arSpaceNode);
    expect(basis.children).toHaveLength(1);
    expect(viz.getCount()).toBe(1);
  });

  // Why: replay restart clears the slice and the visualizer needs to
  // match — no leftover meshes, materials, or textures — but the basis
  // node must survive so the next attach can keep adding tiles.
  it('clear() removes every tile and disposes per-tile material + texture, keeping the basis node', () => {
    const viz = new FrameTileVisualizer(arSpaceNode);
    const tex = new THREE.Texture();
    viz.addTile(makeFrame(), tex);
    const mesh = findTile(arSpaceNode, 'frames/frame-000001.jpg');
    const material = mesh.material as THREE.MeshBasicMaterial;

    let materialDisposed = false;
    let textureDisposed = false;
    material.addEventListener('dispose', () => {
      materialDisposed = true;
    });
    tex.addEventListener('dispose', () => {
      textureDisposed = true;
    });

    viz.clear();

    const basis = findBasisNode(arSpaceNode);
    expect(basis.children).toHaveLength(0);
    expect(viz.getCount()).toBe(0);
    expect(materialDisposed).toBe(true);
    expect(textureDisposed).toBe(true);

    // The visualizer is reused after a store-swap clear(): a fresh tile
    // must still land under the surviving basis node.
    viz.addTile(makeFrame({ imageFile: 'frames/after-clear.jpg' }), texture);
    expect(viz.getCount()).toBe(1);
    expect(findTile(arSpaceNode, 'frames/after-clear.jpg').parent).toBe(basis);
  });

  // Why: dispose is the end-of-life path; unlike clear() it also detaches
  // the basis node so re-entering AR doesn't leak an empty group on
  // arWorldGroup each cycle.
  it('dispose() clears tiles and detaches the basis node', () => {
    const viz = new FrameTileVisualizer(arSpaceNode);
    viz.addTile(makeFrame(), texture);
    viz.dispose();
    expect(viz.getCount()).toBe(0);
    expect(arSpaceNode.children).toHaveLength(0);
    expect(arSpaceNode.getObjectByName('frame-tile-basis')).toBeUndefined();
  });
});
