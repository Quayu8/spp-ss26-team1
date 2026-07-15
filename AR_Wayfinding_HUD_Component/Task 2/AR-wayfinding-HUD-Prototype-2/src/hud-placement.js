import * as THREE from 'three';

export function formatDistanceLabel(distance) {
    return `${distance.toFixed(1)} m`;
}

export function getEvaluationCamera(renderer, fallbackCamera) {
    if (renderer?.xr?.isPresenting) {
        const xrCamera = renderer.xr.getCamera?.();
        if (xrCamera?.cameras?.length > 0) {
            return xrCamera.cameras[0];
        }

        if (xrCamera) {
            return xrCamera;
        }
    }

    return fallbackCamera;
}

export function getHudFrustumExtents(camera, hudDistance, isXrSession = false) {
    if (isXrSession) {
        const elements = camera.projectionMatrix.elements;
        const tanHalfFovY = 1.0 / elements[5];
        const tanHalfFovX = 1.0 / elements[0];

        return {
            width: 2.0 * hudDistance * tanHalfFovX,
            height: 2.0 * hudDistance * tanHalfFovY,
        };
    }

    const fovRad = THREE.MathUtils.degToRad(camera.fov);
    const height = 2.0 * hudDistance * Math.tan(fovRad / 2.0);

    return {
        width: height * camera.aspect,
        height,
    };
}

export function computeTargetPlacement({
    targetWorldPos,
    camera,
    hudDistance,
    distanceMin,
    distanceMax,
    previousState = 'hidden',
    isXrSession = false,
    viewportInner = 0.95,
    viewportOuter = 1.0,
    edgeMargin = 0.9,
}) {
    camera.updateMatrixWorld();

    const { width: frustumWidth, height: frustumHeight } = getHudFrustumExtents(
        camera,
        hudDistance,
        isXrSession
    );

    const ndc = targetWorldPos.clone().project(camera);
    const localPos = targetWorldPos.clone().applyMatrix4(camera.matrixWorldInverse);
    const isBehind = localPos.z > 0;
    const distance = camera.position.distanceTo(targetWorldPos);
    const distanceLabel = formatDistanceLabel(distance);

    const onScreenLimit = previousState === 'arrow' ? viewportInner : viewportOuter;
    const onScreen =
        !isBehind &&
        Math.abs(ndc.x) <= onScreenLimit &&
        Math.abs(ndc.y) <= onScreenLimit;

    if (onScreen) {
        if (distance < distanceMin) {
            return {
                state: 'hidden',
                onScreen,
                isBehind,
                distance,
                distanceLabel,
                ndc,
                frustumWidth,
                frustumHeight,
            };
        }

        const circleX = THREE.MathUtils.clamp(ndc.x, -1, 1) * (frustumWidth / 2);
        const circleY = THREE.MathUtils.clamp(ndc.y, -1, 1) * (frustumHeight / 2);

        return {
            state: 'circle',
            onScreen,
            isBehind,
            distance,
            distanceLabel,
            ndc,
            frustumWidth,
            frustumHeight,
            circlePosition: new THREE.Vector3(circleX, circleY, -hudDistance),
            labelPosition: new THREE.Vector3(
                circleX,
                circleY - hudDistance * 0.08,
                -hudDistance
            ),
        };
    }

    let arrowNdcX = ndc.x;
    let arrowNdcY = ndc.y;
    if (isBehind) {
        arrowNdcX *= -1;
        arrowNdcY *= -1;
    }

    const physicalX = arrowNdcX * (frustumWidth / 2);
    const physicalY = arrowNdcY * (frustumHeight / 2);
    const angle = Math.atan2(physicalY, physicalX);

    const maxAbsX = (frustumWidth / 2) * edgeMargin;
    const maxAbsY = (frustumHeight / 2) * edgeMargin;

    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    const tX = maxAbsX / Math.max(Math.abs(cosA), 0.0001);
    const tY = maxAbsY / Math.max(Math.abs(sinA), 0.0001);
    const t = Math.min(tX, tY);

    const arrowX = cosA * t;
    const arrowY = sinA * t;

    return {
        state: 'arrow',
        onScreen,
        isBehind,
        distance,
        distanceLabel,
        ndc,
        frustumWidth,
        frustumHeight,
        arrowPosition: new THREE.Vector3(arrowX, arrowY, -hudDistance),
        arrowRotationZ: angle - Math.PI / 2,
        labelPosition: new THREE.Vector3(
            arrowX - cosA * hudDistance * 0.1,
            arrowY - sinA * hudDistance * 0.1,
            -hudDistance
        ),
    };
}
