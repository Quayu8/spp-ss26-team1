/**
 * `CombinedRootState` — back-compat type alias for "library + recorder + refPoints".
 *
 * This was previously exported from `state/store.ts`. Now that the recorder
 * store has moved into `GpsPlusSlamJs_RecorderApp`, framework modules that
 * still need a structural root-state type for selectors / replay use this
 * alias, which composes the public `createSlamAppStore` factory with the
 * `refPoints` slice that ships in the framework.
 *
 * @see ./create-slam-app-store.ts
 * @see ./ref-points-slice.ts
 */

import type { Reducer } from '@reduxjs/toolkit';
import type { SlamAppCombinedState } from './create-slam-app-store';
import type { RefPointsState } from './ref-points-slice';

export type CombinedRootState = SlamAppCombinedState<{
  refPoints: Reducer<RefPointsState>;
}>;
