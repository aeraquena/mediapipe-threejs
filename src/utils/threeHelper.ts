import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export const addCamera = (): THREE.PerspectiveCamera => {
  return new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    1,
    500
  );
};

export const addOrbitControls = (
  camera: THREE.PerspectiveCamera,
  canvas: HTMLElement
) => {
  return new OrbitControls(camera, canvas);
};

export const addDirectionalLight = (): THREE.DirectionalLight => {
  const white = 0xffffff;
  const directionalLight = new THREE.DirectionalLight(white, 3);
  directionalLight.position.set(100, 0, 100);
  directionalLight.target.position.set(5, 5, 0);
  return directionalLight;
};

export const addCube = (): THREE.Mesh => {
  const geometry = new THREE.BoxGeometry(4, 4, 4);
  const material = new THREE.MeshToonMaterial({ color: 0x00ff00 });
  const cube = new THREE.Mesh(geometry, material);
  return cube;
};
