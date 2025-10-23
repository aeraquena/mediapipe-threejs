import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as mediaPipeHelper from "./mediaPipeHelper";
import { MarchingCubes } from "three/examples/jsm/objects/MarchingCubes.js";
import { getJoint } from "./getBody";

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

// Initialize skeleton - creates joints and lines with names
export function createSkeletonVisualization(skeletonGroup: THREE.Group) {
  // Clear previous skeleton
  while (skeletonGroup.children.length > 0) {
    skeletonGroup.remove(skeletonGroup.children[0]);
  }

  // Create spheres for joints
  const jointGeometry = new THREE.SphereGeometry(0.5, 8, 8);
  const jointMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 }); // green

  for (let i = 0; i < 33; i++) {
    const joint = new THREE.Mesh(jointGeometry, jointMaterial);
    joint.name = `joint_${i}`;
    skeletonGroup.add(joint);
  }

  // Create lines for connections
  for (const [start, end] of mediaPipeHelper.POSE_CONNECTIONS) {
    const lineGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(6); // 2 points * 3 coords
    lineGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );

    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0xff0000, // red
      linewidth: 2,
    });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    line.name = `connection_${start}_${end}`;
    skeletonGroup.add(line);
  }
}

// Create and return skeleton metaballs
export function createSkeletonMetaballs(RAPIER: any, world: any) {
  // Initialize bodies for joints
  // TODO: Make this come from MediaPipe. I need to do skeletonBodies[i].update(x, y)
  const numSkeletonBodies = 33;
  const skeletonBodies: {
    color: THREE.Color;
    mesh:
      | THREE.Mesh<
          THREE.IcosahedronGeometry,
          THREE.MeshBasicMaterial,
          THREE.Object3DEventMap
        >
      | undefined;
    rigid: any;
    update: () => THREE.Vector3;
    name: string;
  }[] = [];
  // TODO: For each pose...
  for (let i = 0; i < numSkeletonBodies; i++) {
    const body = getJoint({ debug: true, RAPIER, world, xPos: 0, yPos: 0 });
    skeletonBodies.push(body);
  }

  const normalMat = new THREE.MeshNormalMaterial();
  const skeletonMetaballs = new MarchingCubes(
    96, // resolution of metaball,
    normalMat,
    true, // enableUVs
    true, // enableColors
    90000 // max poly count
  );
  skeletonMetaballs.scale.setScalar(5); // entire metaball system
  skeletonMetaballs.isolation = 800; // blobbiness or size. smaller number = bigger
  skeletonMetaballs.userData = {
    update(landmarks: any) {
      skeletonMetaballs.reset();
      const strength = 0.6; // size-y
      const subtract = 10; // lightness
      // loop through all existing rigid bodies, get add a metaball to each
      skeletonBodies.forEach((b, i) => {
        skeletonMetaballs.addBall(
          1 - landmarks[0][i].x, // TODO: This only does person 1 rn
          1 - landmarks[0][i].y,
          0,
          strength,
          subtract,
          b.color
        );
      });

      // Add the skeleton's torso. Calculate X, Y average between 12, 11, (x) ...  12, 24 (y)
      // TODO: Maybe make this a function, pass in position and size

      // Torso top
      skeletonMetaballs.addBall(
        1 - (landmarks[0][12].x + landmarks[0][11].x) * 0.5,
        1 -
          (landmarks[0][24].y +
            (landmarks[0][12].y - landmarks[0][24].y) * 0.25),
        0,
        2.5,
        10,
        new THREE.Color().setRGB(0.5, 0.5, 0.5)
      );

      // Torso bottom
      skeletonMetaballs.addBall(
        1 - (landmarks[0][12].x + landmarks[0][11].x) * 0.5,
        1 -
          (landmarks[0][24].y +
            (landmarks[0][12].y - landmarks[0][24].y) * 0.75),
        0,
        4,
        10,
        new THREE.Color().setRGB(0.5, 0.5, 0.5)
      );

      skeletonMetaballs.update();
    },
  };
  return skeletonMetaballs;
}
