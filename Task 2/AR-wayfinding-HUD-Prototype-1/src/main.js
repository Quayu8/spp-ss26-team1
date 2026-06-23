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

// Initialization in main.js
// The developer is now forced to actively decide the operating distances
const hudConfig = {
    distanceMin: 18.0,
    distanceMax: 20.0,
    hudDistance: 2.5 // This one is optional and could be left out
};

const hud = new ARWayfindingHUD(scene, camera, hudConfig);

// Handle viewport resizing
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Render loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();

    // Update one HUD indicator per target.
    hud.update(dummyTargets);

    renderer.render(scene, camera);
}

animate();
