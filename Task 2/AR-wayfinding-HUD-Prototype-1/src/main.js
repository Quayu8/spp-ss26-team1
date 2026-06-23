import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ARWayfindingHUD } from './ARWayfindingHUD.js';

// Initialization of core scene components
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x222222);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.6, 5); // Approximate eye level

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = false;

// Fix OrbitControls to behave like a first-person perspective
// by placing the target slightly in front of the camera lens.
controls.target.set(0, 1.6, 4.99);
controls.update();

// Keyboard state tracking for locomotion
const keysPressed = {
    w: false,
    a: false,
    s: false,
    d: false,
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false
};

// Event listeners to capture keyboard input
window.addEventListener('keydown', (e) => {
    if (e.key in keysPressed) {
        keysPressed[e.key] = true;
    }
});

window.addEventListener('keyup', (e) => {
    if (e.key in keysPressed) {
        keysPressed[e.key] = false;
    }
});

// Grid helper for spatial orientation
const gridHelper = new THREE.GridHelper(50, 50);
scene.add(gridHelper);

// Define simulated spatial anchors
const dummyTargets = [
    new THREE.Vector3(15, 1.6, 0),    // Right
    new THREE.Vector3(-10, 1.6, 10),  // Left-rear
    new THREE.Vector3(0, 1.6, -25),   // Far forward (triggers circle state)
    new THREE.Vector3(0, 15, 25)
];

// Instantiate visual markers for the physical anchors
dummyTargets.forEach((pos, index) => {
    const geometry = new THREE.SphereGeometry(0.5, 32, 32);
    const material = new THREE.MeshBasicMaterial({ color: 0x4CAF50, wireframe: true });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.copy(pos);
    scene.add(sphere);
});

// Initialization of the AR Wayfinding HUD
const hudConfig = {
    distanceMin: 18.0,
    distanceMax: 20.0,
    hudDistance: 2.5 
};

const hud = new ARWayfindingHUD(scene, camera, hudConfig);

// Handle viewport resizing
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Movement parameters
const moveSpeed = 0.1;
const moveVector = new THREE.Vector3();

// Render loop
function animate() {
    requestAnimationFrame(animate);

    // Reset movement vector for the current frame
    moveVector.set(0, 0, 0);

    // Calculate forward direction projected onto the horizontal XZ-plane
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    forward.normalize();

    // Calculate right direction projected onto the horizontal XZ-plane
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0;
    right.normalize();

    // Accumulate directional inputs
    if (keysPressed.w || keysPressed.ArrowUp) {
        moveVector.add(forward);
    }
    if (keysPressed.s || keysPressed.ArrowDown) {
        moveVector.addScaledVector(forward, -1);
    }
    if (keysPressed.d || keysPressed.ArrowRight) {
        moveVector.add(right);
    }
    if (keysPressed.a || keysPressed.ArrowLeft) {
        moveVector.addScaledVector(right, -1);
    }

    // Apply translation if any movement key is active
    if (moveVector.lengthSq() > 0) {
        moveVector.normalize().multiplyScalar(moveSpeed);
        
        // Move both camera and orbit target synchronously to maintain looking direction
        camera.position.add(moveVector);
        controls.target.add(moveVector);
    }

    // Update controls after shifting the target position
    controls.update();

    // Update HUD indicators per target
    hud.update(dummyTargets);

    renderer.render(scene, camera);
}

animate();