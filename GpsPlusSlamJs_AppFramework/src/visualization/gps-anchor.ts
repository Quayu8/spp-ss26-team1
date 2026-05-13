/**
 * `createGpsAnchor` — GPS-anchored placement of a single `THREE.Object3D`.
 *
 * See the colocated sidecar (`gps-anchor.ts.md`) and the port plan at
 * `gps-plus-slam/GpsPlusSlamJs_Docs/docs/2026-05-13-gps-anchor-port-plan.md`
 * for the full design, state machine, and test matrix.
 *
 * This file implements **sub-step 2 (bootstrap phase)** of that plan.
 * The steady-state recompute loop (sub-steps 3+) lives in a later
 * iteration; this file deliberately keeps the `anchored` phase a no-op
 * beyond exposing `gpsPoint` and `isFullyAnchored`.
 */
import type * as THREE from 'three';
import type { LatLong, LatLongAlt } from '../core/index.js';
import { registerFrameUpdate } from '../ar/frame-loop.js';

export type GpsAnchorMode = 'snap-when-offscreen' | 'snap-every-tick';
export type GpsAnchorPhase = 'bootstrap' | 'anchored';

/**
 * The minimum shape needed for the bootstrap median — a `LatLong` with
 * optional altitude. Re-exported as a named alias so the sidecar and
 * tests can refer to "the kind of point the anchor samples" without
 * importing core types.
 */
export type GpsAnchorSamplePoint = LatLong | LatLongAlt;

export interface GpsAnchorOptions {
  readonly object3D: THREE.Object3D;
  readonly arWorldGroup: THREE.Object3D;
  readonly camera: THREE.Camera;
  readonly gpsPoint: LatLong | LatLongAlt;
  readonly skipBootstrap?: boolean;
  readonly getAlignmentMatrix: () => readonly number[] | null;
  readonly getGpsZeroRef: () => LatLong | null;
  /** Returns the current GPS reading at "now", or null when no fix yet. */
  readonly getCurrentGpsPoint: () => GpsAnchorSamplePoint | null;
  readonly mode?: GpsAnchorMode;
  readonly floorY?: () => number | null;
  readonly distanceThreshold?: number;
  readonly angleThresholdInDegrees?: number;
  readonly targetPosRefreshRateInSec?: number;
  /** Number of 1 Hz samples collected during bootstrap. Default 7. */
  readonly secondsToAccumulateGpsPose?: number;
  /** Wait window (seconds) at phase entry during which no samples are taken. Default 0. */
  readonly settlingSeconds?: number;
  readonly heightAboveGround?: number | null;
}

export interface GpsAnchor {
  readonly phase: GpsAnchorPhase;
  readonly isFullyAnchored: boolean;
  /** Current target GPS pose; during `bootstrap` this is the seed, post-bootstrap the median. */
  readonly gpsPoint: LatLong | LatLongAlt;
  markMovedExternally(): void;
  setGpsPoint(point: LatLong | LatLongAlt): void;
  dispose(): void;
  /** @internal — testing seam; exposed in lieu of pumping `runFrameUpdates`. */
  __tickForTests(dt: number, elapsed: number): void;
}

/**
 * Module-level registry of objects currently owned by a `GpsAnchor`.
 * Used to detect nested anchors (parent + child both anchored) which
 * we explicitly forbid; mirrors the C# invariant.
 */
const anchoredObjects = new WeakSet<THREE.Object3D>();

function isObjectInAnchoredChain(object: THREE.Object3D): boolean {
  let cursor: THREE.Object3D | null = object;
  while (cursor) {
    if (anchoredObjects.has(cursor)) return true;
    cursor = cursor.parent;
  }
  return false;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function medianPoint(samples: readonly GpsAnchorSamplePoint[]): LatLong | LatLongAlt {
  const lat = median(samples.map((s) => s.lat));
  const lon = median(samples.map((s) => s.lon));
  const alts = samples
    .map((s) => ('altitude' in s ? s.altitude : undefined))
    .filter((a): a is number => typeof a === 'number');
  if (alts.length > 0) {
    return { lat, lon, altitude: median(alts) };
  }
  return { lat, lon };
}

export function createGpsAnchor(options: GpsAnchorOptions): GpsAnchor {
  if (isObjectInAnchoredChain(options.object3D)) {
    throw new Error(
      'createGpsAnchor: nested GpsAnchors are not supported — ' +
        'the supplied object3D is already inside an anchored parent chain.'
    );
  }
  anchoredObjects.add(options.object3D);

  const sampleCount = options.secondsToAccumulateGpsPose ?? 7;
  const settlingSeconds = options.settlingSeconds ?? 0;

  let phase: GpsAnchorPhase = options.skipBootstrap === true ? 'anchored' : 'bootstrap';
  let isFullyAnchored = phase === 'anchored';
  let gpsPoint: LatLong | LatLongAlt = options.gpsPoint;
  let phaseEnteredAtElapsed: number | null = null;
  let lastSampleAtElapsed: number | null = null;
  const samples: GpsAnchorSamplePoint[] = [];

  const enterBootstrap = (): void => {
    phase = 'bootstrap';
    isFullyAnchored = false;
    phaseEnteredAtElapsed = null;
    lastSampleAtElapsed = null;
    samples.length = 0;
  };

  const commitMedian = (): void => {
    gpsPoint = medianPoint(samples);
    phase = 'anchored';
    isFullyAnchored = true;
    samples.length = 0;
  };

  const tick = (_dt: number, elapsed: number): void => {
    if (phase !== 'bootstrap') return;
    if (phaseEnteredAtElapsed === null) {
      phaseEnteredAtElapsed = elapsed;
      lastSampleAtElapsed = elapsed - 1; // allow a sample on the next tick if no settling
    }
    // Settling window: ignore samples until it elapses.
    if (elapsed - phaseEnteredAtElapsed < settlingSeconds) return;
    // Sample at most once per second.
    if (lastSampleAtElapsed !== null && elapsed - lastSampleAtElapsed < 1) return;
    const sample = options.getCurrentGpsPoint();
    if (sample === null || sample === undefined) return;
    samples.push(sample);
    lastSampleAtElapsed = elapsed;
    if (samples.length >= sampleCount) {
      commitMedian();
    }
  };

  const unregister = registerFrameUpdate(tick);

  return {
    get phase() {
      return phase;
    },
    get isFullyAnchored() {
      return isFullyAnchored;
    },
    get gpsPoint() {
      return gpsPoint;
    },
    markMovedExternally(): void {
      enterBootstrap();
    },
    setGpsPoint(point: LatLong | LatLongAlt): void {
      gpsPoint = point;
    },
    dispose(): void {
      unregister();
      anchoredObjects.delete(options.object3D);
    },
    __tickForTests(dt: number, elapsed: number): void {
      tick(dt, elapsed);
    },
  };
}
