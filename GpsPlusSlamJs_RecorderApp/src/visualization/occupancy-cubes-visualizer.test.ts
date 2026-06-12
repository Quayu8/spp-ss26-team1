/**
 * @vitest-environment jsdom
 *
 * Tests for `OccupancyCubesVisualizer` (occupancy-grid port plan Iter 5).
 *
 * Why this test matters:
 * The cubes are the only on-device feedback for whether the whole
 * depth→unprojection→grid pipeline produces geometry in the right place.
 * The instanced mesh must mirror the grid's occupied cells exactly while
 * under the cap, fall back to a deterministic (injected-RNG) random
 * subset above it, and release GPU resources on dispose.
 */

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  OccupancyCubesVisualizer,
  type OccupancyGridSource,
} from './occupancy-cubes-visualizer';
import type { GridCell } from 'gps-plus-slam-app-framework/ar';

function makeGridSource(
  cells: GridCell[],
  cellSizeM = 0.15
): OccupancyGridSource & { getOccupiedCells: ReturnType<typeof vi.fn> } {
  return {
    cellSizeM,
    getOccupiedCells: vi.fn(() => cells),
    getCellCenter: (cell: GridCell) =>
      [cell[0] * cellSizeM, cell[1] * cellSizeM, cell[2] * cellSizeM] as const,
  };
}

function findMesh(scene: THREE.Scene): THREE.InstancedMesh {
  const mesh = scene.getObjectByName('occupancy-cubes');
  if (!(mesh instanceof THREE.InstancedMesh)) {
    throw new Error('occupancy-cubes InstancedMesh not in scene');
  }
  // instanceof narrows to InstancedMesh<any, any, any>; pin the default
  // generics so the return type is lint-safe.
  return mesh as THREE.InstancedMesh;
}

describe('OccupancyCubesVisualizer', () => {
  it('adds an empty instanced mesh to the scene on construction', () => {
    const scene = new THREE.Scene();
    const visualizer = new OccupancyCubesVisualizer(scene);
    const mesh = findMesh(scene);
    expect(mesh.count).toBe(0);
    expect(visualizer.getCount()).toBe(0);
    visualizer.dispose();
  });

  it('draws one cube per occupied cell at the cell center, scaled to cellSizeM', () => {
    const scene = new THREE.Scene();
    const visualizer = new OccupancyCubesVisualizer(scene);
    const grid = makeGridSource(
      [
        [0, 0, -10],
        [2, 1, -4],
      ],
      0.5
    );

    visualizer.refresh(grid);
    const mesh = findMesh(scene);
    expect(mesh.count).toBe(2);

    const matrix = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    mesh.getMatrixAt(1, matrix);
    matrix.decompose(pos, quat, scale);
    expect(pos.toArray()).toEqual([1, 0.5, -2]); // cell · cellSizeM
    expect(scale.toArray()).toEqual([0.5, 0.5, 0.5]);

    visualizer.dispose();
  });

  it('forwards minObservations to the grid query', () => {
    const scene = new THREE.Scene();
    const visualizer = new OccupancyCubesVisualizer(scene, {
      minObservations: 3,
    });
    const grid = makeGridSource([]);
    visualizer.refresh(grid);
    expect(grid.getOccupiedCells).toHaveBeenCalledWith(3);
    visualizer.dispose();
  });

  it('draws a deterministic random subset when over the instance cap', () => {
    const scene = new THREE.Scene();
    // rng() === 0 always picks the next remaining element → first N cells
    const visualizer = new OccupancyCubesVisualizer(scene, {
      maxInstances: 2,
      rng: () => 0,
    });
    const grid = makeGridSource([
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
      [4, 0, 0],
    ]);

    visualizer.refresh(grid);
    const mesh = findMesh(scene);
    expect(mesh.count).toBe(2);

    const matrix = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    mesh.getMatrixAt(0, matrix);
    pos.setFromMatrixPosition(matrix);
    expect(pos.x).toBeCloseTo(1 * 0.15);
    mesh.getMatrixAt(1, matrix);
    pos.setFromMatrixPosition(matrix);
    expect(pos.x).toBeCloseTo(2 * 0.15);

    visualizer.dispose();
  });

  it('assigns per-instance height-based colors', () => {
    const scene = new THREE.Scene();
    const visualizer = new OccupancyCubesVisualizer(scene);
    visualizer.refresh(
      makeGridSource([
        [0, -10, 0],
        [0, 30, 0],
      ])
    );
    const mesh = findMesh(scene);
    expect(mesh.instanceColor).not.toBeNull();

    const low = new THREE.Color();
    const high = new THREE.Color();
    mesh.getColorAt(0, low);
    mesh.getColorAt(1, high);
    // Low cells are blue-ish, high cells red-ish
    expect(low.b).toBeGreaterThan(low.r);
    expect(high.r).toBeGreaterThan(high.b);

    visualizer.dispose();
  });

  it('clear hides all cubes but keeps the mesh for the next refresh', () => {
    const scene = new THREE.Scene();
    const visualizer = new OccupancyCubesVisualizer(scene);
    visualizer.refresh(makeGridSource([[0, 0, -1]]));
    expect(visualizer.getCount()).toBe(1);

    visualizer.clear();
    expect(visualizer.getCount()).toBe(0);
    expect(scene.getObjectByName('occupancy-cubes')).toBeDefined();

    visualizer.refresh(makeGridSource([[0, 0, -2]]));
    expect(visualizer.getCount()).toBe(1);
    visualizer.dispose();
  });

  it('dispose removes the mesh from the scene and releases GPU resources', () => {
    const scene = new THREE.Scene();
    const visualizer = new OccupancyCubesVisualizer(scene);
    const mesh = findMesh(scene);
    const meshDispose = vi.spyOn(mesh, 'dispose');
    const geometryDispose = vi.spyOn(mesh.geometry, 'dispose');
    const materialDispose = vi.spyOn(
      mesh.material as THREE.Material,
      'dispose'
    );

    visualizer.dispose();
    expect(scene.getObjectByName('occupancy-cubes')).toBeUndefined();
    expect(meshDispose).toHaveBeenCalled();
    expect(geometryDispose).toHaveBeenCalled();
    expect(materialDispose).toHaveBeenCalled();

    // refresh after dispose is a safe no-op
    expect(() =>
      visualizer.refresh(makeGridSource([[0, 0, -1]]))
    ).not.toThrow();
  });
});
