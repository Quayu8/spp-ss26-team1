/**
 * Occupancy-cubes visualizer — renders the AR-space occupancy grid as one
 * `THREE.InstancedMesh` of cubes (2026-06-11 depth occupancy-grid port
 * plan §3/Iter 5). The TS equivalent of the Unity debug cubes in
 * `ArCursorOnDepthSurface.cs`: refreshed at ~1 Hz by
 * `wireOccupancyGridSubscribers`, drawing all occupied cells when under
 * the instance cap and a random subset above it (the "randomly picking
 * points every second" behavior — no geometry-shader point billboard is
 * ported, WebGL has none).
 *
 * Coloring: height-based per-instance color (HSL ramp over the cell's Y)
 * until per-point RGB capture lands (plan §5).
 *
 * Scene is injected explicitly (no `getScene()` call) so the class stays
 * unit-testable — same P3 rule as `FrameTileVisualizer`.
 */

import * as THREE from 'three';
import type { GridCell } from 'gps-plus-slam-app-framework/ar';

/** The read surface of the framework's `OccupancyGrid` this class draws. */
export interface OccupancyGridSource {
  readonly cellSizeM: number;
  getOccupiedCells(minObservations?: number): readonly GridCell[];
  getCellCenter(cell: GridCell): readonly [number, number, number];
}

export interface OccupancyCubesVisualizerOptions {
  /** Maximum rendered cubes (InstancedMesh capacity). Default 2000. */
  readonly maxInstances?: number;
  /**
   * Minimum observation count for a cell to be drawn (noise filter,
   * forwarded to `getOccupiedCells`). Default 1 — tuned in Iter 6.
   */
  readonly minObservations?: number;
  /**
   * Random source for the over-cap subset selection. Injected so tests
   * are deterministic. Default `Math.random`.
   */
  readonly rng?: () => number;
}

const DEFAULT_MAX_INSTANCES = 2000;
const MESH_NAME = 'occupancy-cubes';

/** Height range mapped onto the color ramp (meters, raw WebXR Y). */
const COLOR_Y_MIN = -1;
const COLOR_Y_MAX = 3;

export class OccupancyCubesVisualizer {
  private readonly scene: THREE.Scene;
  private readonly minObservations: number;
  private readonly rng: () => number;
  private readonly mesh: THREE.InstancedMesh;
  private readonly geometry: THREE.BoxGeometry;
  private readonly material: THREE.MeshBasicMaterial;
  private disposed = false;

  constructor(
    scene: THREE.Scene,
    options: OccupancyCubesVisualizerOptions = {}
  ) {
    this.scene = scene;
    this.minObservations = options.minObservations ?? 1;
    this.rng = options.rng ?? Math.random;
    const maxInstances = options.maxInstances ?? DEFAULT_MAX_INSTANCES;

    this.geometry = new THREE.BoxGeometry(1, 1, 1);
    this.material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.7,
    });
    this.mesh = new THREE.InstancedMesh(
      this.geometry,
      this.material,
      maxInstances
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.name = MESH_NAME;
    this.mesh.count = 0;
    this.mesh.frustumCulled = false; // instances spread across the room
    this.scene.add(this.mesh);
  }

  /** Number of cubes currently drawn. */
  getCount(): number {
    return this.mesh.count;
  }

  /**
   * Redraw from the grid: every sufficiently-observed cell when under the
   * instance cap, otherwise a random subset of cap size.
   */
  refresh(grid: OccupancyGridSource): void {
    if (this.disposed) return;
    const occupied = grid.getOccupiedCells(this.minObservations);
    const capacity = this.mesh.instanceMatrix.count;
    const cells =
      occupied.length <= capacity
        ? occupied
        : pickRandomSubset(occupied, capacity, this.rng);

    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (cell === undefined) continue;
      const [x, y, z] = grid.getCellCenter(cell);
      matrix.makeScale(grid.cellSizeM, grid.cellSizeM, grid.cellSizeM);
      matrix.setPosition(x, y, z);
      this.mesh.setMatrixAt(i, matrix);
      this.mesh.setColorAt(i, heightColor(color, y));
    }
    this.mesh.count = cells.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }
  }

  /** Hide all cubes (e.g. on store swap); the mesh stays in the scene. */
  clear(): void {
    this.mesh.count = 0;
  }

  /** Remove the mesh from the scene and release GPU resources. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.remove(this.mesh);
    this.mesh.dispose(); // releases the instance buffers
    this.geometry.dispose();
    this.material.dispose();
  }
}

/** Map cell height to a stable HSL ramp (blue floor → red ceiling). */
function heightColor(target: THREE.Color, y: number): THREE.Color {
  const t = Math.min(
    1,
    Math.max(0, (y - COLOR_Y_MIN) / (COLOR_Y_MAX - COLOR_Y_MIN))
  );
  // 0.66 (blue) down to 0 (red)
  return target.setHSL(0.66 * (1 - t), 1, 0.5);
}

/**
 * Pick `count` distinct elements via partial Fisher–Yates on a copy —
 * O(count), unbiased for an unbiased rng, deterministic for injected rngs.
 */
function pickRandomSubset<T>(
  items: readonly T[],
  count: number,
  rng: () => number
): T[] {
  const pool = [...items];
  const result: T[] = [];
  const limit = Math.min(count, pool.length);
  for (let i = 0; i < limit; i++) {
    const j = i + Math.floor(rng() * (pool.length - i));
    const a = pool[i];
    const b = pool[j];
    if (a === undefined || b === undefined) continue; // rng out of [0,1)
    pool[i] = b;
    pool[j] = a;
    result.push(b);
  }
  return result;
}
