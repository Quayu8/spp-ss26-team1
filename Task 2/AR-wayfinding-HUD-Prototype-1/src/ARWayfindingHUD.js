import * as THREE from 'three';

/**
 * ARWayfindingHUD manages a per-target set of frustum-locked indicators.
 * Each target gets its own arrow/circle pair so updates do not overwrite
 * one another when multiple targets are active in the same frame.
 */
export class ARWayfindingHUD {
    constructor(scene, camera, hudDistance = 2.5) {
        this.camera = camera;
        this.hudDistance = hudDistance;
        this.targetStates = [];

        // Bind HUD to the camera transform to keep indicators in view space.
        scene.add(this.camera);
    }

    _createHudMaterial(colorHex) {
        return new THREE.MeshBasicMaterial({
            color: colorHex,
            depthTest: false,
            depthWrite: false,
            transparent: true,
        });
    }

    _createArrowMesh(colorHex = 0xff3b30) {
        const geo = new THREE.ConeGeometry(0.1, 0.3, 16);
        geo.translate(0, 0.15, 0);
        const mesh = new THREE.Mesh(geo, this._createHudMaterial(colorHex));
        mesh.renderOrder = 999;
        mesh.visible = false;
        return mesh;
    }

    _createCircleMesh(colorHex = 0xff3b30) {
        const geo = new THREE.RingGeometry(0.08, 0.12, 32);
        const mesh = new THREE.Mesh(geo, this._createHudMaterial(colorHex));
        mesh.renderOrder = 999;
        mesh.visible = false;
        return mesh;
    }

    _ensureTargetState(index) {
        if (this.targetStates[index]) {
            return this.targetStates[index];
        }

        const arrowMesh = this._createArrowMesh();
        const circleMesh = this._createCircleMesh();

        this.camera.add(arrowMesh);
        this.camera.add(circleMesh);

        const state = {
            currentState: 'hidden',
            arrowMesh,
            circleMesh,
        };

        this.targetStates[index] = state;
        return state;
    }


    _syncTargetCount(targetCount) {
        for (let i = this.targetStates.length; i < targetCount; i += 1) {
            this._ensureTargetState(i);
        }

        for (let i = targetCount; i < this.targetStates.length; i += 1) {
            const state = this.targetStates[i];
            if (!state) {
                continue;
            }
            state.arrowMesh.visible = false;
            state.circleMesh.visible = false;
        }
    }

    _updateTargetState(targetWorldPos, state) {
        const fovRad = THREE.MathUtils.degToRad(this.camera.fov);
        const frustumHeight = 2.0 * this.hudDistance * Math.tan(fovRad / 2.0);
        const frustumWidth = frustumHeight * this.camera.aspect;

        const ndc = targetWorldPos.clone().project(this.camera);
        const localPos = targetWorldPos.clone().applyMatrix4(this.camera.matrixWorldInverse);
        const isBehind = localPos.z > 0;
        const distance = this.camera.position.distanceTo(targetWorldPos);

        const DISTANCE_MAX = 20.0;
        const DISTANCE_MIN = 18.0;
        const NDC_VOLUMETRIC_THRESHOLD = 1.15;

        const onScreen = !isBehind &&
            Math.abs(ndc.x) <= NDC_VOLUMETRIC_THRESHOLD &&
            Math.abs(ndc.y) <= NDC_VOLUMETRIC_THRESHOLD;

        if (onScreen) {
            if (distance < DISTANCE_MIN) {
                state.currentState = 'hidden';
            } else if (distance >= DISTANCE_MAX) {
                state.currentState = 'circle';
            } else if (state.currentState === 'arrow') {
                state.currentState = 'hidden';
            }

            if (state.currentState === 'hidden') {
                state.arrowMesh.visible = false;
                state.circleMesh.visible = false;
            } else if (state.currentState === 'circle') {
                state.arrowMesh.visible = false;
                state.circleMesh.visible = true;
                state.circleMesh.position.set(
                    THREE.MathUtils.clamp(ndc.x, -1, 1) * (frustumWidth / 2),
                    THREE.MathUtils.clamp(ndc.y, -1, 1) * (frustumHeight / 2),
                    -this.hudDistance
                );
            }

            return;
        }

        state.currentState = 'arrow';
        state.circleMesh.visible = false;
        state.arrowMesh.visible = true;

        if (isBehind) {
            ndc.x *= -1;
            ndc.y *= -1;
        }

        const physicalX = ndc.x * (frustumWidth / 2);
        const physicalY = ndc.y * (frustumHeight / 2);
        const angle = Math.atan2(physicalY, physicalX);

        const margin = 0.9;
        const maxAbsX = (frustumWidth / 2) * margin;
        const maxAbsY = (frustumHeight / 2) * margin;

        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        const tX = maxAbsX / Math.max(Math.abs(cosA), 0.0001);
        const tY = maxAbsY / Math.max(Math.abs(sinA), 0.0001);
        const t = Math.min(tX, tY);

        state.arrowMesh.position.set(cosA * t, sinA * t, -this.hudDistance);
        state.arrowMesh.rotation.set(0, 0, angle - Math.PI / 2);
    }

    /**
     * Evaluates all active targets and updates their HUD indicators.
     * @param {THREE.Vector3[]} targetWorldPositions
     */
    update(targetWorldPositions = []) {
        this._syncTargetCount(targetWorldPositions.length);

        targetWorldPositions.forEach((targetWorldPos, index) => {
            const state = this._ensureTargetState(index);
            this._updateTargetState(targetWorldPos, state);
        });
    }
}
