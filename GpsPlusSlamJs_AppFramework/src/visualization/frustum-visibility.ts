import * as THREE from 'three';

/**
 * Frustum-visibility predicates used by GPS-anchored components and any other
 * caller that needs to know whether a world-space point/sphere/object is
 * currently visible to a camera. Three.js's `Frustum` has the primitives we
 * need; this module wraps them so:
 *
 *  - All three predicates share a module-level scratch `Frustum`/`Matrix4`
 *    so a single frame's worth of checks pays the matrix multiply once.
 *  - Each predicate accepts an optional `frustum` parameter for callers that
 *    already have one built (e.g. via `buildCameraFrustum`) and want to
 *    keep doing many checks against it without rebuilding.
 *
 * The Three.js convention here is that `Frustum.containsPoint` is strict
 * (point must be inside all six planes) while `intersectsSphere`/
 * `intersectsObject` accept overlap with any plane, which is the right
 * notion for "is this object at least partially on screen".
 */

const scratchMatrix = new THREE.Matrix4();
const scratchFrustum = new THREE.Frustum();

/**
 * Build (or refresh) a Three.js `Frustum` from `camera`'s current world
 * transform and projection matrix. If `out` is provided, the frustum is
 * written into it and returned; otherwise the module-level scratch frustum
 * is used. Callers MUST treat the returned frustum as immutable until they
 * next call this function or use one of the predicates without an injected
 * frustum (both reuse the same scratch).
 */
export function buildCameraFrustum(
  camera: THREE.Camera,
  out?: THREE.Frustum
): THREE.Frustum {
  scratchMatrix.multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse
  );
  const target = out ?? scratchFrustum;
  target.setFromProjectionMatrix(scratchMatrix);
  return target;
}

/**
 * Strictly check whether a single world-space point lies inside all six
 * frustum planes. Useful for HUD/follow logic where the caller already has
 * the target world position and wants the cheapest possible check.
 */
export function isPointInCameraFrustum(
  camera: THREE.Camera,
  point: THREE.Vector3,
  frustum?: THREE.Frustum
): boolean {
  const f = frustum ?? buildCameraFrustum(camera);
  return f.containsPoint(point);
}

/**
 * Check whether a world-space bounding sphere intersects the camera frustum
 * (returns true even for partial overlap). Useful for callers that maintain
 * a precomputed bounding sphere (LOD systems, instanced meshes, future
 * `ArPowerSaver`).
 */
export function isSphereInCameraFrustum(
  camera: THREE.Camera,
  sphere: THREE.Sphere,
  frustum?: THREE.Frustum
): boolean {
  const f = frustum ?? buildCameraFrustum(camera);
  return f.intersectsSphere(sphere);
}

const objectScratchSphere = new THREE.Sphere();
const objectScratchBox = new THREE.Box3();
const objectScratchVec = new THREE.Vector3();

/**
 * Check whether an `Object3D` is currently (at least partially) inside the
 * camera frustum. The world bounding volume is resolved in tiers, cheapest
 * first, so each common Three.js object type is gated by where it actually
 * draws:
 *
 *  1. **Sprites** (`isSprite`) are screen-space billboards with no meaningful
 *     world geometry, so their world-space origin is tested as a point.
 *  2. **Objects carrying an object-level `boundingSphere`** (`InstancedMesh`,
 *     `SkinnedMesh`, or any caller that pre-populates one) use that sphere,
 *     which reflects the instance spread / posed extent — unlike the base
 *     geometry sphere. It is computed lazily via `computeBoundingSphere()`
 *     when missing.
 *  3. **Single renderables carrying a `geometry`** (`Mesh`, `Points`, `Line`,
 *     …) use the geometry's local bounding sphere × `matrixWorld`.
 *  4. **Containers with children** (`Group`, `LOD`, …) use the world-space
 *     union of their descendants' bounding boxes (`Box3.setFromObject`),
 *     converted to a sphere.
 *  5. **Truly empty / geometry-less objects** have no bounding volume and are
 *     treated as visible (`true`) — the conservative default for visibility
 *     gating.
 *
 * This deliberately avoids `Frustum.intersectsObject`, which unconditionally
 * dereferences `object.geometry.boundingSphere` and therefore throws a
 * `TypeError` for geometry-less objects such as `Group`s.
 *
 * Callers should ensure `object.updateMatrixWorld()` (with descendants, for
 * containers: `updateMatrixWorld(true)`) has already run this frame (it
 * normally has, via `renderer.render`).
 */
export function isObjectInCameraFrustum(
  camera: THREE.Camera,
  object: THREE.Object3D,
  frustum?: THREE.Frustum
): boolean {
  const f = frustum ?? buildCameraFrustum(camera);

  // Tier 1 — Sprite: screen-space billboard, no representative world geometry.
  // Test its world-space origin as a point.
  if ((object as { isSprite?: boolean }).isSprite) {
    object.getWorldPosition(objectScratchVec);
    return f.containsPoint(objectScratchVec);
  }

  // Tiers 2–4: resolve a world-space bounding sphere into `objectScratchSphere`
  // (object-level sphere → geometry sphere → children union). If none applies
  // the object has no bounding volume and we fall back to the conservative
  // "visible" default (Tier 5).
  if (!resolveObjectWorldSphere(object, objectScratchSphere)) {
    return true;
  }
  return f.intersectsSphere(objectScratchSphere);
}

/**
 * Resolve the world-space bounding sphere for `object` into `out`, returning
 * `true` when a bounding volume was found and `false` for objects that have
 * none (e.g. an empty `Group`). Resolution order mirrors the tiers documented
 * on {@link isObjectInCameraFrustum}: object-level `boundingSphere`
 * (`InstancedMesh`/`SkinnedMesh`), then geometry bounding sphere, then the
 * world-space union of descendant bounding boxes.
 */
function resolveObjectWorldSphere(
  object: THREE.Object3D,
  out: THREE.Sphere
): boolean {
  // Tier 2 — object-level bounding sphere (instance spread / posed extent).
  if (tryObjectLevelSphere(object, out)) {
    return true;
  }

  // Tier 3 — single renderable carrying a `geometry` (Mesh, Points, Line, …).
  const geometry = (object as { geometry?: THREE.BufferGeometry }).geometry;
  if (geometry) {
    if (!geometry.boundingSphere) {
      geometry.computeBoundingSphere();
    }
    if (geometry.boundingSphere) {
      out.copy(geometry.boundingSphere).applyMatrix4(object.matrixWorld);
      return true;
    }
  }

  // Tier 4 — container (Group, LOD, …): union descendant world bounding boxes.
  if (object.children.length > 0) {
    objectScratchBox.setFromObject(object);
    if (!objectScratchBox.isEmpty()) {
      objectScratchBox.getBoundingSphere(out);
      return true;
    }
  }

  // Tier 5 — no bounding volume.
  return false;
}

/**
 * Tier 2 of {@link resolveObjectWorldSphere}: use an object-level
 * `boundingSphere` when the object is an `InstancedMesh`/`SkinnedMesh` (whose
 * sphere reflects instance spread / posed extent) or already carries a
 * populated sphere. Computes it lazily via `computeBoundingSphere()` when
 * missing. Writes the world-space sphere into `out` and returns `true` on
 * success, `false` when no object-level sphere applies.
 */
function tryObjectLevelSphere(
  object: THREE.Object3D,
  out: THREE.Sphere
): boolean {
  const withSphere = object as {
    boundingSphere?: THREE.Sphere | null;
    computeBoundingSphere?: () => void;
    isInstancedMesh?: boolean;
    isSkinnedMesh?: boolean;
  };
  const eligible =
    withSphere.isInstancedMesh ||
    withSphere.isSkinnedMesh ||
    withSphere.boundingSphere;
  if (!eligible) {
    return false;
  }
  if (
    !withSphere.boundingSphere &&
    typeof withSphere.computeBoundingSphere === 'function'
  ) {
    withSphere.computeBoundingSphere();
  }
  if (!withSphere.boundingSphere) {
    return false;
  }
  out.copy(withSphere.boundingSphere).applyMatrix4(object.matrixWorld);
  return true;
}
