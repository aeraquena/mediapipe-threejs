import * as THREE from "three";

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  1,
  500
);
camera.position.set(0, 0, 100);
camera.lookAt(0, 0, 0);

const scene = new THREE.Scene();

// Cube

const geometry = new THREE.BoxGeometry(4, 4, 4);
const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

//camera.position.z = 5;

// Line

//create a blue LineBasicMaterial
const lineMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff });
const points = [];
points.push(new THREE.Vector3(-10, 0, 0));
points.push(new THREE.Vector3(0, 10, 0));
points.push(new THREE.Vector3(10, 0, 0));

const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
const line = new THREE.Line(lineGeometry, lineMaterial);
scene.add(line);

// Sphere

const radius = 7;
const widthSegments = 12;
const heightSegments = 8;
const sphereGeometry = new THREE.SphereGeometry(
  radius,
  widthSegments,
  heightSegments
);
const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
scene.add(sphere);
sphere.position.x = 10;

// Dodecahedron
const dodecRadius = 5;
const dodecDetail = 0;
const dodecGeometry = new THREE.DodecahedronGeometry(dodecRadius, dodecDetail);
const dodecMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
const dodecahedron = new THREE.Mesh(dodecGeometry, dodecMaterial);
scene.add(dodecahedron);
dodecahedron.position.y = 10;

// Animate the scene

function animate() {
  cube.rotation.x += 0.01;
  cube.rotation.y += 0.01;
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);
