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
controls.enableDamping = true;

// Grid helper for spatial orientation
const gridHelper = new THREE.GridHelper(50, 50);
scene.add(gridHelper);

// Define simulated spatial anchors
const dummyTargets = [
    new THREE.Vector3(15, 1.6, 0),    // Right
    new THREE.Vector3(-10, 1.6, 10),  // Left-rear
    new THREE.Vector3(0, 1.6, -25)    // Far forward (triggers circle state)
];

// Instantiate visual markers for the physical anchors
dummyTargets.forEach((pos, index) => {
    const geometry = new THREE.SphereGeometry(0.5, 32, 32);
    const material = new THREE.MeshBasicMaterial({ color: 0x4CAF50, wireframe: true });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.copy(pos);
    scene.add(sphere);
});

// Initialize the HUD component
const hud = new ARWayfindingHUD(scene, camera);

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

    // In a production environment, this would iterate over active targets.
    // For prototype validation, we track a single target index [0].
    hud.update(dummyTargets[0]); 

    renderer.render(scene, camera);
}

animate();