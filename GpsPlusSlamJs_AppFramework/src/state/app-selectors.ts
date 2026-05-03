/**
 * App-level memoized selectors for CombinedRootState.
 *
 * Wraps library getter functions with createSelector (RTK/reselect) for
 * standard memoization. The library getters already return stable references
 * via immutable state, but createSelector adds:
 * - Explicit memoization contract (input comparison → cached output)
 * - Consistent select* naming convention matching selectCachedKnownRefPoints
 * - Composition-ready building blocks for derived selectors
 *
 * Used by subscribeToSelector in store-subscribers.ts for change detection.
 *
 * @see docs/2026-04-07-architecture-observations-consolidated.md §1
 */

import { createSelector } from '@reduxjs/toolkit';
import type { CombinedRootState } from './combined-root-state';
import type { RefPointMark } from '../storage/ref-point-loader';
import type {
  GpsPoint,
  LatLong,
  Matrix4,
  Quaternion,
  ReferencePoint,
  Vector3,
} from 'gps-plus-slam-js';

// ---------------------------------------------------------------------------
// Stable fallback constants — must be module-level to maintain referential
// stability across calls (same contract as the library's selectors.ts).
// ---------------------------------------------------------------------------

const EMPTY_GPS_POSITIONS: readonly GpsPoint[] = [];
const EMPTY_ODOM_POSITIONS: readonly Vector3[] = [];
const EMPTY_ODOM_ROTATIONS: readonly Quaternion[] = [];
const EMPTY_REF_POINTS: readonly ReferencePoint[] = [];
const EMPTY_REF_POINT_MARKS: readonly RefPointMark[] = [];

// ---------------------------------------------------------------------------
// Input selector — shared across all selectors for gpsData-derived values.
// createSelector compares this by reference; if gpsData hasn't changed,
// the output selector is skipped and the cached result is returned.
// ---------------------------------------------------------------------------

const selectGpsData = (state: CombinedRootState) => state.gpsData;

// ---------------------------------------------------------------------------
// Memoized selectors
// ---------------------------------------------------------------------------

/** Alignment matrix (4×4), or null if not yet computed. */
export const selectAlignmentMatrix = createSelector(
  [selectGpsData],
  (gpsData): Matrix4 | null => gpsData?.gpsEvents?.alignmentMatrix ?? null
);

/** Recorded GPS positions with metadata. */
export const selectGpsPositions = createSelector(
  [selectGpsData],
  (gpsData): readonly GpsPoint[] =>
    gpsData?.gpsEvents?.gpsPositions ?? EMPTY_GPS_POSITIONS
);

/** Recorded odometry positions (AR-local space). */
export const selectOdometryPositions = createSelector(
  [selectGpsData],
  (gpsData): readonly Vector3[] =>
    gpsData?.gpsEvents?.odometryPositions ?? EMPTY_ODOM_POSITIONS
);

/** Recorded odometry rotations (AR-local space). */
export const selectOdometryRotations = createSelector(
  [selectGpsData],
  (gpsData): readonly Quaternion[] =>
    gpsData?.gpsEvents?.odometryRotations ?? EMPTY_ODOM_ROTATIONS
);

/** GPS zero reference (origin for coordinate conversion), or null. */
export const selectZeroReference = createSelector(
  [selectGpsData],
  (gpsData): LatLong | null => gpsData?.zero ?? null
);

/** User-defined reference points for ground truth validation. */
export const selectReferencePoints = createSelector(
  [selectGpsData],
  (gpsData): readonly ReferencePoint[] =>
    gpsData?.referencePoints ?? EMPTY_REF_POINTS
);

// ---------------------------------------------------------------------------
// RefPoint marks — drive 3D sphere rendering via store subscription.
// See docs/2026-04-30-refpoint-marks-into-redux-plan.md (Finding 5).
// ---------------------------------------------------------------------------

const selectRefPoints = (state: CombinedRootState) => state.refPoints;
const selectPriorMarksRaw = (state: CombinedRootState) =>
  state.refPoints?.priorMarks;
const selectCurrentMarksRaw = (state: CombinedRootState) =>
  state.refPoints?.currentMarks;

/** Marks loaded from prior sessions (rendered as green spheres). */
export const selectPriorRefPointMarks = createSelector(
  [selectPriorMarksRaw],
  (priorMarks): readonly RefPointMark[] => priorMarks ?? EMPTY_REF_POINT_MARKS
);

/** Marks added during the current session (rendered as red spheres). */
export const selectCurrentRefPointMarks = createSelector(
  [selectCurrentMarksRaw],
  (currentMarks): readonly RefPointMark[] =>
    currentMarks ?? EMPTY_REF_POINT_MARKS
);

// `selectRefPoints` is exported in case future selectors need to compose
// across all slice fields without each becoming a sibling selector.
export { selectRefPoints };
