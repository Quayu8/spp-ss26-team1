import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import {
  buildCameraFrustum,
  isObjectInCameraFrustum,
  isPointInCameraFrustum,
  isSphereInCameraFrustum,
} from './frustum-visibility.js';

/**
 * Why these tests matter:
 * The `GpsAnchor` `'snap-when-offscreen'` mode (Item 1 of the C# port plan)
 * gates pose commits on whether the anchored object is currently visible to
 * the camera. We want a single tested helper module that exposes three
 * predicates sharing a cached scratch `Frustum`/`Matrix4` so callers doing
 * many checks per frame only rebuild the frustum once. These tests pin
 * down the inside/outside boundary for points, spheres, and objects, plus
 * the documented `frustum?` injection for reusing a cached one.
 */

function makeCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  // Camera at origin, looking down -Z (Three.js default).
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -1);
  camera.updateMatrixWorld();
  return camera;
}

describe('buildCameraFrustum', () => {
  it('returns a Frustum derived from the camera projection × matrixWorldInverse', () => {
    const camera = makeCamera();
    const frustum = buildCameraFrustum(camera);

    const inside = new THREE.Vector3(0, 0, -5);
    const behind = new THREE.Vector3(0, 0, 5);

    expect(frustum.containsPoint(inside)).toBe(true);
    expect(frustum.containsPoint(behind)).toBe(false);
  });

  it('writes into the caller-provided scratch Frustum when given one', () => {
    const camera = makeCamera();
    const scratch = new THREE.Frustum();
    const returned = buildCameraFrustum(camera, scratch);

    expect(returned).toBe(scratch);
  });
});

describe('isPointInCameraFrustum', () => {
  it('returns true for a point straight ahead inside near/far', () => {
    const camera = makeCamera();
    expect(isPointInCameraFrustum(camera, new THREE.Vector3(0, 0, -5))).toBe(
      true
    );
  });

  it('returns false for a point behind the camera', () => {
    const camera = makeCamera();
    expect(isPointInCameraFrustum(camera, new THREE.Vector3(0, 0, 5))).toBe(
      false
    );
  });

  it('returns false for a point past the far plane', () => {
    const camera = makeCamera();
    expect(isPointInCameraFrustum(camera, new THREE.Vector3(0, 0, -1000))).toBe(
      false
    );
  });

  it('returns false for a point far to the side outside the FOV', () => {
    const camera = makeCamera();
    expect(isPointInCameraFrustum(camera, new THREE.Vector3(100, 0, -5))).toBe(
      false
    );
  });

  it('reuses the provided frustum without rebuilding it', () => {
    const camera = makeCamera();
    const frustum = buildCameraFrustum(camera);
    // Mutate camera so a rebuild would *change* the answer if it happened.
    camera.position.set(0, 0, -1000);
    camera.updateMatrixWorld();
    // Using the stale frustum keeps the original "looking down -Z from origin"
    // result.
    expect(
      isPointInCameraFrustum(camera, new THREE.Vector3(0, 0, -5), frustum)
    ).toBe(true);
  });
});

describe('isSphereInCameraFrustum', () => {
  it('returns true for a sphere entirely inside the frustum', () => {
    const camera = makeCamera();
    const sphere = new THREE.Sphere(new THREE.Vector3(0, 0, -5), 1);
    expect(isSphereInCameraFrustum(camera, sphere)).toBe(true);
  });

  it('returns true when the sphere overlaps a frustum plane (partially visible)', () => {
    const camera = makeCamera();
    // Centre behind the camera but radius reaches in front.
    const sphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0.5), 1);
    expect(isSphereInCameraFrustum(camera, sphere)).toBe(true);
  });

  it('returns false for a sphere fully behind the camera', () => {
    const camera = makeCamera();
    const sphere = new THREE.Sphere(new THREE.Vector3(0, 0, 10), 1);
    expect(isSphereInCameraFrustum(camera, sphere)).toBe(false);
  });

  it('accepts an injected frustum for reuse', () => {
    const camera = makeCamera();
    const frustum = buildCameraFrustum(camera);
    const sphere = new THREE.Sphere(new THREE.Vector3(0, 0, -5), 1);
    expect(isSphereInCameraFrustum(camera, sphere, frustum)).toBe(true);
  });
});

describe('isObjectInCameraFrustum', () => {
  function makeUnitSphereMesh(): THREE.Mesh {
    const geom = new THREE.SphereGeometry(1, 8, 8);
    const mat = new THREE.MeshBasicMaterial();
    return new THREE.Mesh(geom, mat);
  }

  it('returns true for an object positioned in front of the camera', () => {
    const camera = makeCamera();
    const mesh = makeUnitSphereMesh();
    mesh.position.set(0, 0, -5);
    mesh.updateMatrixWorld();
    expect(isObjectInCameraFrustum(camera, mesh)).toBe(true);
  });

  it('returns false for an object positioned behind the camera', () => {
    const camera = makeCamera();
    const mesh = makeUnitSphereMesh();
    mesh.position.set(0, 0, 10);
    mesh.updateMatrixWorld();
    expect(isObjectInCameraFrustum(camera, mesh)).toBe(false);
  });

  it('returns false for an object far outside the FOV', () => {
    const camera = makeCamera();
    const mesh = makeUnitSphereMesh();
    mesh.position.set(1000, 0, -5);
    mesh.updateMatrixWorld();
    expect(isObjectInCameraFrustum(camera, mesh)).toBe(false);
  });

  it('respects parent transforms (uses world bounding sphere)', () => {
    const camera = makeCamera();
    const group = new THREE.Group();
    group.position.set(0, 0, -5);
    const mesh = makeUnitSphereMesh();
    group.add(mesh);
    group.updateMatrixWorld(true);
    expect(isObjectInCameraFrustum(camera, mesh)).toBe(true);
  });

  it('accepts an injected frustum for reuse', () => {
    const camera = makeCamera();
    const frustum = buildCameraFrustum(camera);
    const mesh = makeUnitSphereMesh();
    mesh.position.set(0, 0, -5);
    mesh.updateMatrixWorld();
    expect(isObjectInCameraFrustum(camera, mesh, frustum)).toBe(true);
  });

  // Why this test matters: GpsAnchor passes its `object3D` directly, which is
  // frequently a plain `THREE.Group` container with no `geometry`. Three.js's
  // `Frustum.intersectsObject` does NOT treat such objects as "in frustum" —
  // it unconditionally reads `object.geometry.boundingSphere`, which throws a
  // TypeError for a Group. This test pins the safe default (treat geometry-less
  // objects as visible) and guards against a regression to the crashing path.
  it('treats a geometry-less object (Group) as in-frustum without throwing', () => {
    const camera = makeCamera();
    const group = new THREE.Group();
    // Position is irrelevant: a geometry-less object has no bounding sphere to
    // test, so the safe default applies regardless of where it sits.
    group.position.set(1000, 0, -5);
    group.updateMatrixWorld();
    expect(() => isObjectInCameraFrustum(camera, group)).not.toThrow();
    expect(isObjectInCameraFrustum(camera, group)).toBe(true);
  });

  // Why this test matters: the helper deliberately reads `geometry`
  // structurally instead of casting to `THREE.Mesh`, so non-mesh renderables
  // that also carry a `geometry` (e.g. `Points`, `Line`) are frustum-tested
  // via their own bounding sphere just like meshes. This pins that contract
  // and guards against a regression to a `Mesh`-only cast that would silently
  // skip the geometry path for these types.
  it('uses the geometry bounding sphere for non-Mesh renderables (Points, Line)', () => {
    const camera = makeCamera();
    const geom = new THREE.SphereGeometry(1, 8, 8);

    const points = new THREE.Points(geom, new THREE.PointsMaterial());
    points.position.set(0, 0, -5);
    points.updateMatrixWorld();
    expect(isObjectInCameraFrustum(camera, points)).toBe(true);

    const line = new THREE.Line(geom, new THREE.LineBasicMaterial());
    line.position.set(1000, 0, -5);
    line.updateMatrixWorld();
    expect(isObjectInCameraFrustum(camera, line)).toBe(false);
  });

  // --- Tier A: composite/container objects (Group, LOD, …) -----------------
  // Why these tests matter: GpsAnchor anchors are frequently plain `Group`
  // containers whose *visible* content lives in child meshes. The original
  // helper treated every geometry-less object as "always in frustum", which
  // means a container that is entirely off-screen would never be culled. These
  // tests pin the stronger contract: a container's visibility is the union of
  // its descendants' world bounding volumes.
  describe('Tier A: containers with children', () => {
    it('returns true for a Group whose child mesh is in front of the camera', () => {
      const camera = makeCamera();
      const group = new THREE.Group();
      const mesh = makeUnitSphereMesh();
      mesh.position.set(0, 0, -5);
      group.add(mesh);
      group.updateMatrixWorld(true);
      expect(isObjectInCameraFrustum(camera, group)).toBe(true);
    });

    it('returns false for a Group whose only child is far outside the FOV', () => {
      const camera = makeCamera();
      const group = new THREE.Group();
      const mesh = makeUnitSphereMesh();
      mesh.position.set(1000, 0, -5);
      group.add(mesh);
      group.updateMatrixWorld(true);
      // If the helper still used the old "geometry-less ⇒ always true" default
      // this would wrongly be true. The union-of-children box must drive it.
      expect(isObjectInCameraFrustum(camera, group)).toBe(false);
    });

    it('unions multiple children (off-screen + on-screen ⇒ visible)', () => {
      const camera = makeCamera();
      const group = new THREE.Group();
      const offscreen = makeUnitSphereMesh();
      offscreen.position.set(1000, 0, -5);
      const onscreen = makeUnitSphereMesh();
      onscreen.position.set(0, 0, -5);
      group.add(offscreen, onscreen);
      group.updateMatrixWorld(true);
      expect(isObjectInCameraFrustum(camera, group)).toBe(true);
    });

    it('works for THREE.LOD (its level meshes are children)', () => {
      const camera = makeCamera();
      const lod = new THREE.LOD();
      const near = makeUnitSphereMesh();
      lod.addLevel(near, 0);
      lod.position.set(0, 0, -5);
      lod.updateMatrixWorld(true);
      expect(isObjectInCameraFrustum(camera, lod)).toBe(true);
    });

    it('still treats a truly empty container (no geometry anywhere) as visible', () => {
      const camera = makeCamera();
      const outer = new THREE.Group();
      const innerEmpty = new THREE.Group();
      outer.add(innerEmpty);
      outer.position.set(1000, 0, -5);
      outer.updateMatrixWorld(true);
      // No descendant carries geometry ⇒ no bounding volume ⇒ conservative
      // default applies.
      expect(isObjectInCameraFrustum(camera, outer)).toBe(true);
    });
  });

  // --- Tier B: objects carrying their own world-extent bounding sphere ------
  // Why these tests matter: `InstancedMesh`/`SkinnedMesh` have a `geometry`
  // whose bounding sphere only covers the *base* geometry, not the spread of
  // instance matrices or the skinned/posed extent. Three.js gives these types
  // an object-level `boundingSphere` (via `computeBoundingSphere()`) that does
  // reflect the real extent. The helper must prefer that over the geometry
  // sphere so instanced/skinned objects are gated by where they actually draw.
  describe('Tier B: object-level boundingSphere (InstancedMesh / SkinnedMesh)', () => {
    it('uses the instance-aware sphere, not the base geometry sphere', () => {
      const camera = makeCamera();
      const geom = new THREE.SphereGeometry(1, 8, 8);
      const inst = new THREE.InstancedMesh(
        geom,
        new THREE.MeshBasicMaterial(),
        1
      );
      // Single instance translated far outside the FOV. The base geometry
      // sphere is centred at the (origin) mesh position — which sits at the
      // camera and would intersect the frustum — so a geometry-only check
      // would wrongly report "visible". The instance-aware sphere is centred
      // ~ (1000,0,-5) and must drive the result to false.
      const m = new THREE.Matrix4().makeTranslation(1000, 0, -5);
      inst.setMatrixAt(0, m);
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      inst.updateMatrixWorld();
      expect(isObjectInCameraFrustum(camera, inst)).toBe(false);
    });

    it('returns true for an InstancedMesh whose instances are in front', () => {
      const camera = makeCamera();
      const geom = new THREE.SphereGeometry(1, 8, 8);
      const inst = new THREE.InstancedMesh(
        geom,
        new THREE.MeshBasicMaterial(),
        1
      );
      inst.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 0, -5));
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      inst.updateMatrixWorld();
      expect(isObjectInCameraFrustum(camera, inst)).toBe(true);
    });

    it('honours a pre-set object-level boundingSphere (e.g. a posed SkinnedMesh)', () => {
      // A real SkinnedMesh needs a bound skeleton with skin attributes, which
      // is fragile to set up deterministically. The contract we care about is
      // that ANY object exposing a populated `boundingSphere` has it honoured
      // (SkinnedMesh.computeBoundingSphere() produces exactly such a sphere).
      // We simulate that by assigning the sphere directly.
      const camera = makeCamera();
      const obj = makeUnitSphereMesh() as THREE.Mesh & {
        boundingSphere: THREE.Sphere;
      };
      // Geometry sphere (origin) would intersect; the posed sphere far to the
      // side must win and cull.
      obj.boundingSphere = new THREE.Sphere(new THREE.Vector3(1000, 0, -5), 1);
      obj.updateMatrixWorld();
      expect(isObjectInCameraFrustum(camera, obj)).toBe(false);
    });
  });

  // --- Tier C: sprites ------------------------------------------------------
  // Why this test matters: `Sprite` is a screen-space billboard with no
  // meaningful world geometry (its internal quad geometry is tiny and not
  // representative of its rendered size). The right notion of "visible" for a
  // sprite is whether its world-space origin is inside the frustum, so we test
  // that as a point rather than via the quad's bounding sphere.
  describe('Tier C: sprites', () => {
    it('returns true for a sprite positioned in front of the camera', () => {
      const camera = makeCamera();
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
      sprite.position.set(0, 0, -5);
      sprite.updateMatrixWorld();
      expect(isObjectInCameraFrustum(camera, sprite)).toBe(true);
    });

    it('returns false for a sprite behind the camera', () => {
      const camera = makeCamera();
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
      sprite.position.set(0, 0, 10);
      sprite.updateMatrixWorld();
      expect(isObjectInCameraFrustum(camera, sprite)).toBe(false);
    });

    it('returns false for a sprite far outside the FOV', () => {
      const camera = makeCamera();
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
      sprite.position.set(1000, 0, -5);
      sprite.updateMatrixWorld();
      expect(isObjectInCameraFrustum(camera, sprite)).toBe(false);
    });
  });
});
