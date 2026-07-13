import * as THREE from 'three';
import { DistanceLabel } from './DistanceLabel.js';

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
            distanceLabel
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
        let evalCamera = this.camera;
        if (this.renderer.xr.isPresenting) {
            const xrCamera = this.renderer.xr.getCamera();
            if (xrCamera.cameras && xrCamera.cameras.length > 0) {
                evalCamera = xrCamera.cameras[0];
            }
        }

        let frustumHeight, frustumWidth;
        if (this.renderer.xr.isPresenting) {
            // In WebXR the sub-camera's fov/aspect properties are not reliably updated.
            // Extract them directly from the projection matrix instead.
            // projectionMatrix.elements[5] = 1/tan(fovY/2), elements[0] = 1/tan(fovX/2)
            const m = evalCamera.projectionMatrix.elements;
            const tanHalfFovY = 1.0 / m[5];
            const tanHalfFovX = 1.0 / m[0];
            frustumHeight = 2.0 * this.hudDistance * tanHalfFovY;
            frustumWidth  = 2.0 * this.hudDistance * tanHalfFovX;
        } else {
            const fovRad = THREE.MathUtils.degToRad(evalCamera.fov);
            frustumHeight = 2.0 * this.hudDistance * Math.tan(fovRad / 2.0);
            frustumWidth  = frustumHeight * evalCamera.aspect;
        }

        const ndc = targetWorldPos.clone().project(evalCamera);
        const localPos = targetWorldPos.clone().applyMatrix4(evalCamera.matrixWorldInverse);
        const isBehind = localPos.z > 0;
        const distance = evalCamera.position.distanceTo(targetWorldPos);
        
        // Format distance string
        const distanceString = distance.toFixed(1) + ' m';

        const VIEWPORT_INNER = 0.95; 
        const VIEWPORT_OUTER = 1.0; 

        let onScreen = false;
        
        if (!isBehind) {
            if (state.currentState === 'arrow') {
                onScreen = Math.abs(ndc.x) <= VIEWPORT_INNER && Math.abs(ndc.y) <= VIEWPORT_INNER;
            } else {
                onScreen = Math.abs(ndc.x) <= VIEWPORT_OUTER && Math.abs(ndc.y) <= VIEWPORT_OUTER;
            }
        }

        if (onScreen) {
            if (distance < this.distanceMin) {
                state.currentState = 'hidden';
            } else if (distance >= this.distanceMax) {
                state.currentState = 'circle';
            } else if (state.currentState !== 'circle') {
                state.currentState = 'circle';
            }

            if (state.currentState === 'hidden') {
                state.arrowMesh.visible = false;
                state.circleMesh.visible = false;
                state.distanceLabel.getMesh().visible = false;
            } else if (state.currentState === 'circle') {
                state.arrowMesh.visible = false;
                state.circleMesh.visible = true;
                
                const circleX = THREE.MathUtils.clamp(ndc.x, -1, 1) * (frustumWidth / 2);
                const circleY = THREE.MathUtils.clamp(ndc.y, -1, 1) * (frustumHeight / 2);
                
                state.circleMesh.position.set(circleX, circleY, -this.hudDistance);
                
                // Update and position label slightly below the circle
                state.distanceLabel.updateText(distanceString);
                state.distanceLabel.getMesh().position.set(circleX, circleY - this.hudDistance * 0.08, -this.hudDistance);
                state.distanceLabel.getMesh().visible = true;
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

        const arrowX = cosA * t;
        const arrowY = sinA * t;

        state.arrowMesh.position.set(arrowX, arrowY, -this.hudDistance);
        if (this._useArrowSprite) {
            state.arrowMesh.material.rotation = angle - Math.PI / 2;
        } else {
            state.arrowMesh.rotation.set(0, 0, angle - Math.PI / 2);
        }

        // Update and position label slightly offset from the edge towards the center
        // This prevents the label from rendering outside the camera frustum
        state.distanceLabel.updateText(distanceString);
        const labelOffsetX = arrowX - (cosA * this.hudDistance * 0.1);
        const labelOffsetY = arrowY - (sinA * this.hudDistance * 0.1);
        state.distanceLabel.getMesh().position.set(labelOffsetX, labelOffsetY, -this.hudDistance);
        state.distanceLabel.getMesh().visible = true;
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