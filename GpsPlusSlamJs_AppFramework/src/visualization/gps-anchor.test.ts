/**
 * Tests for the `createGpsAnchor` bootstrap phase.
 *
 * Why this test matters: the bootstrap state machine is the part that
 * decides *when* an anchor commits to its first GPS pose. It MUST
 * - honour an optional settling window (no samples taken until the
 *   window elapses),
 * - sample at 1 Hz on subsequent ticks,
 * - take a per-coordinate median (so a single spike outlier cannot
 *   move the committed pose),
 * - flip `phase` to `'anchored'` and `isFullyAnchored` to true only
 *   when the configured number of samples has been collected,
 * - skip the entire phase when `skipBootstrap: true` and trust the
 *   supplied `gpsPoint` verbatim.
 *
 * Sub-step 2 of the GpsAnchor port plan
 * (../../../../gps-plus-slam/GpsPlusSlamJs_Docs/docs/2026-05-13-gps-anchor-port-plan.md).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  createGpsAnchor,
  type GpsAnchorSamplePoint,
} from './gps-anchor.js';
import { clearFrameUpdates } from '../ar/frame-loop.js';

function makeAnchorEnv() {
  const arWorldGroup = new THREE.Group();
  const object3D = new THREE.Object3D();
  arWorldGroup.add(object3D);
  const camera = new THREE.PerspectiveCamera();
  return { arWorldGroup, object3D, camera };
}

afterEach(() => {
  clearFrameUpdates();
});

describe('createGpsAnchor — bootstrap', () => {
  it('starts in `bootstrap` phase with `isFullyAnchored=false`', () => {
    const env = makeAnchorEnv();
    const anchor = createGpsAnchor({
      ...env,
      gpsPoint: { lat: 48.0, lon: 11.0 },
      getAlignmentMatrix: () => null,
      getGpsZeroRef: () => ({ lat: 48.0, lon: 11.0 }),
      getCurrentGpsPoint: () => ({ lat: 48.0, lon: 11.0 }),
    });
    expect(anchor.phase).toBe('bootstrap');
    expect(anchor.isFullyAnchored).toBe(false);
    anchor.dispose();
  });

  it('skipBootstrap=true commits the supplied gpsPoint and flips to `anchored` immediately', () => {
    const env = makeAnchorEnv();
    const seed = { lat: 48.1, lon: 11.2, altitude: 500 };
    const anchor = createGpsAnchor({
      ...env,
      gpsPoint: seed,
      skipBootstrap: true,
      getAlignmentMatrix: () => null,
      getGpsZeroRef: () => ({ lat: 48.0, lon: 11.0 }),
      getCurrentGpsPoint: () => null,
    });
    expect(anchor.phase).toBe('anchored');
    expect(anchor.isFullyAnchored).toBe(true);
    expect(anchor.gpsPoint).toEqual(seed);
    anchor.dispose();
  });

  it('collects samples at 1 Hz and commits the median after `secondsToAccumulateGpsPose` samples', () => {
    const env = makeAnchorEnv();
    let currentSample: GpsAnchorSamplePoint = { lat: 48.0, lon: 11.0 };
    const anchor = createGpsAnchor({
      ...env,
      gpsPoint: { lat: 48.0, lon: 11.0 },
      getAlignmentMatrix: () => null,
      getGpsZeroRef: () => ({ lat: 48.0, lon: 11.0 }),
      getCurrentGpsPoint: () => currentSample,
      secondsToAccumulateGpsPose: 5,
    });
    // 5 samples with strictly increasing lat — median = the middle one.
    const lats = [48.001, 48.002, 48.003, 48.004, 48.005];
    let elapsed = 0;
    for (const lat of lats) {
      elapsed += 1;
      currentSample = { lat, lon: 11.0 };
      anchor.__tickForTests(1, elapsed);
    }
    expect(anchor.phase).toBe('anchored');
    expect(anchor.isFullyAnchored).toBe(true);
    expect(anchor.gpsPoint.lat).toBeCloseTo(48.003, 6);
    expect(anchor.gpsPoint.lon).toBeCloseTo(11.0, 6);
    anchor.dispose();
  });

  it('median is robust to a single spike outlier', () => {
    const env = makeAnchorEnv();
    let currentSample: GpsAnchorSamplePoint = { lat: 48.0, lon: 11.0 };
    const anchor = createGpsAnchor({
      ...env,
      gpsPoint: { lat: 48.0, lon: 11.0 },
      getAlignmentMatrix: () => null,
      getGpsZeroRef: () => ({ lat: 48.0, lon: 11.0 }),
      getCurrentGpsPoint: () => currentSample,
      secondsToAccumulateGpsPose: 5,
    });
    // Four clustered samples + one wildly outlier sample. The median
    // (sorted middle) is one of the clustered values — NOT the mean.
    const lats = [48.001, 48.002, 999.0, 48.003, 48.004];
    let elapsed = 0;
    for (const lat of lats) {
      elapsed += 1;
      currentSample = { lat, lon: 11.0 };
      anchor.__tickForTests(1, elapsed);
    }
    expect(anchor.isFullyAnchored).toBe(true);
    // Sorted: [48.001, 48.002, 48.003, 48.004, 999]; median = 48.003.
    expect(anchor.gpsPoint.lat).toBeCloseTo(48.003, 6);
    anchor.dispose();
  });

  it('honours a `settlingSeconds` window — samples in the settling window are ignored', () => {
    const env = makeAnchorEnv();
    const samples: GpsAnchorSamplePoint[] = [];
    let currentSample: GpsAnchorSamplePoint = { lat: 48.0, lon: 11.0 };
    const anchor = createGpsAnchor({
      ...env,
      gpsPoint: { lat: 48.0, lon: 11.0 },
      getAlignmentMatrix: () => null,
      getGpsZeroRef: () => ({ lat: 48.0, lon: 11.0 }),
      getCurrentGpsPoint: () => {
        samples.push(currentSample);
        return currentSample;
      },
      secondsToAccumulateGpsPose: 3,
      settlingSeconds: 4,
    });
    // Tick once per second for 10 seconds: ticks 1..4 are inside the
    // settling window and MUST NOT be sampled; ticks 5,6,7 are sampled.
    for (let t = 1; t <= 10; t++) {
      currentSample = { lat: 48.0 + t * 0.001, lon: 11.0 };
      anchor.__tickForTests(1, t);
      if (anchor.phase === 'anchored') break;
    }
    expect(samples.length).toBe(3);
    expect(anchor.isFullyAnchored).toBe(true);
    // Sampled values were t=5,6,7 → lats 48.005, 48.006, 48.007.
    expect(anchor.gpsPoint.lat).toBeCloseTo(48.006, 6);
    anchor.dispose();
  });

  it('skips a tick when `getCurrentGpsPoint` returns null (no GPS reading yet)', () => {
    const env = makeAnchorEnv();
    const samples: Array<GpsAnchorSamplePoint | null> = [];
    let currentSample: GpsAnchorSamplePoint | null = null;
    const anchor = createGpsAnchor({
      ...env,
      gpsPoint: { lat: 48.0, lon: 11.0 },
      getAlignmentMatrix: () => null,
      getGpsZeroRef: () => ({ lat: 48.0, lon: 11.0 }),
      getCurrentGpsPoint: () => {
        samples.push(currentSample);
        return currentSample;
      },
      secondsToAccumulateGpsPose: 2,
    });
    // First two ticks: no GPS reading. Should NOT count as samples.
    anchor.__tickForTests(1, 1);
    anchor.__tickForTests(1, 2);
    expect(anchor.phase).toBe('bootstrap');
    expect(anchor.isFullyAnchored).toBe(false);
    // Now GPS comes online.
    currentSample = { lat: 48.001, lon: 11.0 };
    anchor.__tickForTests(1, 3);
    currentSample = { lat: 48.003, lon: 11.0 };
    anchor.__tickForTests(1, 4);
    expect(anchor.phase).toBe('anchored');
    expect(anchor.gpsPoint.lat).toBeCloseTo(48.002, 6); // median of [.001,.003]
    anchor.dispose();
  });

  it('`markMovedExternally()` resets the anchor to `bootstrap` and clears the sample buffer', () => {
    const env = makeAnchorEnv();
    let currentSample: GpsAnchorSamplePoint = { lat: 48.0, lon: 11.0 };
    const anchor = createGpsAnchor({
      ...env,
      gpsPoint: { lat: 48.0, lon: 11.0 },
      getAlignmentMatrix: () => null,
      getGpsZeroRef: () => ({ lat: 48.0, lon: 11.0 }),
      getCurrentGpsPoint: () => currentSample,
      secondsToAccumulateGpsPose: 2,
    });
    // Drive into `anchored` state.
    currentSample = { lat: 48.001, lon: 11.0 };
    anchor.__tickForTests(1, 1);
    currentSample = { lat: 48.003, lon: 11.0 };
    anchor.__tickForTests(1, 2);
    expect(anchor.phase).toBe('anchored');
    anchor.markMovedExternally();
    expect(anchor.phase).toBe('bootstrap');
    expect(anchor.isFullyAnchored).toBe(false);
    // Re-bootstrap with new samples.
    currentSample = { lat: 49.001, lon: 11.0 };
    anchor.__tickForTests(1, 10);
    currentSample = { lat: 49.003, lon: 11.0 };
    anchor.__tickForTests(1, 11);
    expect(anchor.phase).toBe('anchored');
    expect(anchor.gpsPoint.lat).toBeCloseTo(49.002, 6);
    anchor.dispose();
  });

  it('`dispose()` unregisters the anchor from the global frame loop', async () => {
    const env = makeAnchorEnv();
    const getCurrentGpsPoint = vi.fn<() => GpsAnchorSamplePoint | null>(
      () => ({ lat: 48.0, lon: 11.0 })
    );
    const anchor = createGpsAnchor({
      ...env,
      gpsPoint: { lat: 48.0, lon: 11.0 },
      getAlignmentMatrix: () => null,
      getGpsZeroRef: () => ({ lat: 48.0, lon: 11.0 }),
      getCurrentGpsPoint,
      secondsToAccumulateGpsPose: 999, // never finishes
    });
    const { runFrameUpdates } = await import('../ar/frame-loop.js');
    runFrameUpdates(1, 1);
    expect(getCurrentGpsPoint).toHaveBeenCalledTimes(1);
    anchor.dispose();
    runFrameUpdates(1, 2);
    expect(getCurrentGpsPoint).toHaveBeenCalledTimes(1);
  });

  it('throws when the parent chain already contains a `GpsAnchor`-managed object', () => {
    const env = makeAnchorEnv();
    const childObject = new THREE.Object3D();
    env.object3D.add(childObject);
    const parentAnchor = createGpsAnchor({
      ...env,
      gpsPoint: { lat: 48.0, lon: 11.0 },
      getAlignmentMatrix: () => null,
      getGpsZeroRef: () => ({ lat: 48.0, lon: 11.0 }),
      getCurrentGpsPoint: () => null,
    });
    expect(() =>
      createGpsAnchor({
        arWorldGroup: env.arWorldGroup,
        object3D: childObject,
        camera: env.camera,
        gpsPoint: { lat: 48.0, lon: 11.0 },
        getAlignmentMatrix: () => null,
        getGpsZeroRef: () => ({ lat: 48.0, lon: 11.0 }),
        getCurrentGpsPoint: () => null,
      })
    ).toThrow(/nested/i);
    parentAnchor.dispose();
  });
});
