import * as THREE from 'three';
import { DistanceLabel } from './DistanceLabel.js';
import {
    computeTargetPlacement,
    getEvaluationCamera,
} from './hud-placement.js';

/**
 * ARWayfindingHUD manages a per-target set of frustum-locked indicators.
 * Each target gets its own arrow/circle pair and distance label.
 */
export class ARWayfindingHUD {
    /**
     * @param {THREE.Scene} scene
     * @param {THREE.PerspectiveCamera} camera
     * @param {THREE.WebGLRenderer} renderer
     * @param {object} config
     * @param {number} config.distanceMin - Distance (m) below which the indicator is hidden.
     * @param {number} config.distanceMax - Distance (m) above which the circle indicator is shown.
     * @param {number} [config.hudDistance=2.5] - Distance (m) at which HUD elements are placed in front of the camera.
     * @param {string|THREE.Texture} [config.arrowSprite] - Optional custom texture for the directional arrow indicator.
     *   Accepts a URL string or a pre-built THREE.Texture. If omitted, a procedural ConeGeometry is used as fallback.
     *   IMPORTANT: The arrow asset must point UPWARD (12 o'clock) and be centered on the image canvas.
     *   The rotation logic uses atan2 with a -90° offset, so an upward-pointing sprite will correctly
     *   track the target direction at runtime.
     * @param {string|THREE.Texture} [config.circleSprite] - Optional custom texture for the on-screen ring indicator.
     *   Accepts a URL string or a pre-built THREE.Texture. If omitted, a procedural RingGeometry is used as fallback.
     * @param {number} [config.indicatorScale=1.0] - Uniform scale multiplier for arrow and circle indicators.
     *   Use values < 1.0 (e.g. 0.5) to shrink indicators on mobile screens.
     * @param {number} [config.labelScale=1.0] - Uniform scale multiplier for distance labels.
     *   Use values < 1.0 (e.g. 0.5) to shrink labels on mobile screens.
     */
    constructor(scene, camera, renderer, config) {
        if (!config || typeof config.distanceMin === 'undefined' || typeof config.distanceMax === 'undefined') {
            throw new Error(
                "ARWayfindingHUD initialization failed: A configuration object containing " +
                "'distanceMin' and 'distanceMax' is strictly required."
            );
        }

        this.camera = camera;
        this.renderer = renderer; 
        
        this.distanceMin = config.distanceMin;
        this.distanceMax = config.distanceMax;
        this.hudDistance = config.hudDistance !== undefined ? config.hudDistance : 2.5;

        this._arrowTexture = config.arrowSprite || null;
        this._circleTexture = config.circleSprite || null;
        this._useArrowSprite = !!this._arrowTexture;
        this._useCircleSprite = !!this._circleTexture;
        this._indicatorScale = config.indicatorScale !== undefined ? config.indicatorScale : 1.0;
        this._labelScale = config.labelScale !== undefined ? config.labelScale : 1.0;

        this.targetStates = [];
        this._waypoints = [];
        scene.add(this.camera);
    }

    /**
     * Replace the entire waypoint list.
     * @param {THREE.Vector3[]} positions
     */
    setWaypoints(positions) {
        this._waypoints = [...positions];
    }

    /**
     * Append a single waypoint.
     * @param {THREE.Vector3} position
     */
    addWaypoint(position) {
        this._waypoints.push(position);
    }

    /**
     * Remove the waypoint at the given index.
     * @param {number} index
     */
    removeWaypoint(index) {
        this._waypoints.splice(index, 1);
    }

    _createHudMaterial(colorHex) {
        return new THREE.MeshBasicMaterial({
            color: colorHex,
            depthTest: false,
            depthWrite: false,
            transparent: true,
        });
    }

    _resolveTexture(source) {
        if (source instanceof THREE.Texture) {
            return source;
        }
        return new THREE.TextureLoader().load(source);
    }

    _createArrowSprite() {
        const texture = this._arrowTexture
            ? this._resolveTexture(this._arrowTexture)
            : null;
        const material = new THREE.SpriteMaterial({
            map: texture,
            color: texture ? 0xffffff : 0xff3b30,
            depthTest: false,
            depthWrite: false,
            transparent: true,
        });
        const sprite = new THREE.Sprite(material);
        sprite.renderOrder = 999;
        sprite.scale.set(0.3 * this._indicatorScale, 0.3 * this._indicatorScale, 1);
        sprite.visible = false;
        return sprite;
    }

    _createCircleSprite() {
        const texture = this._circleTexture
            ? this._resolveTexture(this._circleTexture)
            : null;
        const material = new THREE.SpriteMaterial({
            map: texture,
            color: texture ? 0xffffff : 0xff3b30,
            depthTest: false,
            depthWrite: false,
            transparent: true,
        });
        const sprite = new THREE.Sprite(material);
        sprite.renderOrder = 999;
        sprite.scale.set(0.3 * this._indicatorScale, 0.3 * this._indicatorScale, 1);
        sprite.visible = false;
        return sprite;
    }

    _createArrowMesh(colorHex = 0xff3b30) {
        const s = this._indicatorScale;
        const geo = new THREE.ConeGeometry(0.1 * s, 0.3 * s, 16);
        geo.translate(0, 0.15 * s, 0);
        const mesh = new THREE.Mesh(geo, this._createHudMaterial(colorHex));
        mesh.renderOrder = 999;
        mesh.visible = false;
        return mesh;
    }

    _createCircleMesh(colorHex = 0xff3b30) {
        const s = this._indicatorScale;
        const geo = new THREE.RingGeometry(0.08 * s, 0.12 * s, 32);
        const mesh = new THREE.Mesh(geo, this._createHudMaterial(colorHex));
        mesh.renderOrder = 999;
        mesh.visible = false;
        return mesh;
    }

    _ensureTargetState(index) {
        if (this.targetStates[index]) {
            return this.targetStates[index];
        }

        const arrowMesh = this._useArrowSprite ? this._createArrowSprite() : this._createArrowMesh();
        const circleMesh = this._useCircleSprite ? this._createCircleSprite() : this._createCircleMesh();
        const distanceLabel = new DistanceLabel(this.hudDistance * this._labelScale);

        this.camera.add(arrowMesh);
        this.camera.add(circleMesh);
        this.camera.add(distanceLabel.getMesh());

        const state = {
            currentState: 'hidden',
            arrowMesh,
            circleMesh,
            distanceLabel,
            smoothedCirclePos: new THREE.Vector3()
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
            if (!state) continue;
            state.arrowMesh.visible = false;
            state.circleMesh.visible = false;
            state.distanceLabel.getMesh().visible = false;
        }
    }

    _updateTargetState(targetWorldPos, state) {
        const evalCamera = getEvaluationCamera(this.renderer, this.camera);
        const placement = computeTargetPlacement({
            targetWorldPos,
            camera: evalCamera,
            hudDistance: this.hudDistance,
            distanceMin: this.distanceMin,
            distanceMax: this.distanceMax,
            previousState: state.currentState,
            isXrSession: !!this.renderer?.xr?.isPresenting,
        });

        state.currentState = placement.state;

        if (placement.state === 'hidden') {
            state.arrowMesh.visible = false;
            state.circleMesh.visible = false;
            state.distanceLabel.getMesh().visible = false;
            return;
        }

        state.distanceLabel.updateText(placement.distanceLabel);
        state.distanceLabel.getMesh().position.copy(placement.labelPosition);
        state.distanceLabel.getMesh().visible = true;

        if (placement.state === 'circle') {
            state.arrowMesh.visible = false;
            state.circleMesh.visible = true;

            const circleDamping = 0.15;
            state.smoothedCirclePos.lerp(placement.circlePosition, circleDamping);
            state.circleMesh.position.copy(state.smoothedCirclePos);
            return;
        }

        state.circleMesh.visible = false;
        state.arrowMesh.visible = true;

        state.arrowMesh.position.copy(placement.arrowPosition);
        if (this._useArrowSprite) {
            state.arrowMesh.material.rotation = placement.arrowRotationZ;
        } else {
            state.arrowMesh.rotation.set(0, 0, placement.arrowRotationZ);
        }
    }

    update() {
        const targetWorldPositions = this._waypoints;
        this._syncTargetCount(targetWorldPositions.length);

        targetWorldPositions.forEach((targetWorldPos, index) => {
            const state = this._ensureTargetState(index);
            this._updateTargetState(targetWorldPos, state);
        });
    }
}
