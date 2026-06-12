# occupancy-cubes-visualizer.ts

## Purpose

Renders the AR-space occupancy grid as one `THREE.InstancedMesh` of cubes — the TS equivalent of the Unity debug cubes in `ArCursorOnDepthSurface.cs` ("cubes randomly picking points every second"). Refreshed at ~1 Hz by `wireOccupancyGridSubscribers`; draws every occupied cell while under the instance cap and a random subset above it. Height-based per-instance color until per-point RGB capture lands (port plan §5).

Plan: `GpsPlusSlamJs_Docs/docs/2026-06-11-depth-occupancy-grid-port-plan.md` §3/Iter 5.

## Public API

- **`new OccupancyCubesVisualizer(scene, options?)`** — scene injected (never `getScene()` inside the class). Options: `maxInstances` (default 2000), `minObservations` (default 1, forwarded to `getOccupiedCells` as the noise filter), `rng` (default `Math.random`; injected for deterministic tests).
- **`refresh(grid: OccupancyGridSource): void`** — redraw from the grid (cubes at `getCellCenter`, scaled to `cellSizeM`). Over the cap: unbiased partial Fisher–Yates subset.
- **`clear(): void`** — hides all cubes (count 0); the mesh stays for the next refresh (store-swap path).
- **`dispose(): void`** — removes the mesh from the scene and disposes instance buffers, geometry, material. `refresh` after dispose is a safe no-op.
- **`getCount(): number`** — cubes currently drawn.
- **`OccupancyGridSource`** — the read surface required of the grid (`cellSizeM`, `getOccupiedCells`, `getCellCenter`); structurally satisfied by the framework's `OccupancyGrid`.

## Invariants & Assumptions

1. One `InstancedMesh` for all cubes — per-refresh cost is O(drawn cells), no per-cell scene objects.
2. The grid's cells/centers are **raw WebXR** coordinates; the visualizer attaches to the THREE scene root, which lives in the same frame (no NUE conversion).
3. `frustumCulled = false` — instances spread across the room; per-mesh culling would blink them out.
4. Color ramp: HSL blue (≤ −1 m) → red (≥ 3 m) over cell height.
5. Defensive: out-of-range injected `rng` values skip a pick instead of crashing.

## Examples

```ts
const visualizer = new OccupancyCubesVisualizer(scene, { maxInstances: 2000 });
visualizer.refresh(grid); // typically via wireOccupancyGridSubscribers
visualizer.dispose(); // on AR session teardown
```

## Tests

- `occupancy-cubes-visualizer.test.ts` — empty mesh on construction, per-cell matrices (center + scale), `minObservations` forwarding, deterministic over-cap subset via injected rng, height-color ordering, clear-keeps-mesh, dispose releases resources + no-op refresh afterwards.
