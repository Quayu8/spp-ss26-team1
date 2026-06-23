import * as THREE from 'three';

/**
 * ARWayfindingHUD manages the frustum-locked spatial indicators.
 * It translates 3D world coordinates into 2D viewport-constrained UI transformations.
 */
export class ARWayfindingHUD {
    constructor(scene, camera, hudDistance = 2.5) {
        this.camera = camera;
        this.hudDistance = hudDistance;
        this.currentState = 'hidden';
        
        this.arrowMesh = this._createArrowMesh();
        this.circleMesh = this._createCircleMesh();

        // Bind HUD to the camera transform to maintain a static relative position
        scene.add(this.camera);
        this.camera.add(this.arrowMesh);
        this.camera.add(this.circleMesh);
    }

    _createHudMaterial(colorHex) {
        return new THREE.MeshBasicMaterial({
            color: colorHex,
            depthTest: false,   // Render on top of scene geometry
            depthWrite: false,
            transparent: true,
        });
    }

    _createArrowMesh() {
        const geo = new THREE.ConeGeometry(0.1, 0.3, 16);
        geo.translate(0, 0.15, 0); // Shift pivot point to the base of the cone
        const mesh = new THREE.Mesh(geo, this._createHudMaterial(0xff3b30));
        mesh.renderOrder = 999;
        mesh.visible = false;
        return mesh;
    }

    _createCircleMesh() {
        const geo = new THREE.RingGeometry(0.08, 0.12, 32);
        const mesh = new THREE.Mesh(geo, this._createHudMaterial(0xff3b30));
        mesh.renderOrder = 999;
        mesh.visible = false;
        return mesh;
    }
/**
     * Evaluates spatial data and updates UI state.
     * @param {THREE.Vector3} targetWorldPos 
     */
    update(targetWorldPos) {
        // Calculate dynamic frustum dimensions based on current camera FOV and aspect ratio
        const fovRad = THREE.MathUtils.degToRad(this.camera.fov);
        const frustumHeight = 2.0 * this.hudDistance * Math.tan(fovRad / 2.0);
        const frustumWidth = frustumHeight * this.camera.aspect;

        const ndc = targetWorldPos.clone().project(this.camera);
        
        // Transform target to local camera space to verify if it is positioned behind the user
        const localPos = targetWorldPos.clone().applyMatrix4(this.camera.matrixWorldInverse);
        const isBehind = localPos.z > 0; 
        const distance = this.camera.position.distanceTo(targetWorldPos);

        // Hysteresis constants
        const DISTANCE_MAX = 20.0;
        const DISTANCE_MIN = 18.0;
        const NDC_VOLUMETRIC_THRESHOLD = 1.15;

        // Determine visibility bounds including volumetric geometry approximation
        const onScreen = !isBehind && 
                         Math.abs(ndc.x) <= NDC_VOLUMETRIC_THRESHOLD && 
                         Math.abs(ndc.y) <= NDC_VOLUMETRIC_THRESHOLD;

        // --- 1. ON-SCREEN LOGIC ---
        if (onScreen) {
            // Evaluate Hysteresis State
            if (distance < DISTANCE_MIN) {
                this.currentState = 'hidden';
            } else if (distance >= DISTANCE_MAX) {
                this.currentState = 'circle';
            } else if (this.currentState === 'arrow') {
                // If it enters the screen exactly inside the deadband (18-20m),
                // we need a valid on-screen default. We default to 'hidden'.
                this.currentState = 'hidden';
            }

            // Apply Visuals based on the resolved state
            if (this.currentState === 'hidden') {
                this.arrowMesh.visible = false;
                this.circleMesh.visible = false;
            } else if (this.currentState === 'circle') {
                this.arrowMesh.visible = false;
                this.circleMesh.visible = true;
                
                this.circleMesh.position.set(
                    Math.max(-1, Math.min(1, ndc.x)) * (frustumWidth / 2), 
                    Math.max(-1, Math.min(1, ndc.y)) * (frustumHeight / 2), 
                    -this.hudDistance
                );
            }
            
            // CRITICAL: Exit the function so the arrow logic NEVER runs if on-screen
            return; 
        }

        // --- 2. OFF-SCREEN LOGIC (ARROW) ---
        this.currentState = 'arrow';
        this.circleMesh.visible = false;
        this.arrowMesh.visible = true;

        if (isBehind) {
            ndc.x *= -1;
            ndc.y *= -1;
        }

        // Calculate angle using physical screen dimensions (Aspect Ratio Fix)
        const physicalX = ndc.x * (frustumWidth / 2);
        const physicalY = ndc.y * (frustumHeight / 2);
        const angle = Math.atan2(physicalY, physicalX);
        
        const margin = 0.9; 
        const maxAbsX = (frustumWidth / 2) * margin;
        const maxAbsY = (frustumHeight / 2) * margin;

        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        // Compute ray-box intersection for screen edge clamping
        const tX = maxAbsX / Math.max(Math.abs(cosA), 0.0001);
        const tY = maxAbsY / Math.max(Math.abs(sinA), 0.0001);
        const t = Math.min(tX, tY);

        this.arrowMesh.position.set(cosA * t, sinA * t, -this.hudDistance);
        this.arrowMesh.rotation.set(0, 0, angle - Math.PI / 2); 
    }
}