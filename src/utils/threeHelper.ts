import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as mediaPipeHelper from "./mediaPipeHelper";
import { MarchingCubes } from "three/examples/jsm/objects/MarchingCubes.js";
import { getJoint } from "./getBody";
import { scaleValue } from "./math";

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

function addBallWithPositionAndSize(
  xPos: number,
  yPos: number,
  strength: number,
  skeletonMetaballs: MarchingCubes
) {
  skeletonMetaballs.addBall(
    xPos,
    yPos,
    0,
    strength, // size // TODO: Add a global multiplier based on z-value
    6, // subtract = lightness
    new THREE.Color().setRGB(0.5, 0.5, 0.5)
  );
}

// Adds balls on the line between two joints to create a continuous tube-like object
function addBallsBetweenJoints(
  joint1: { x: number; y: number },
  joint2: { x: number; y: number },
  numBalls: number,
  strength: number,
  skeletonMetaballs: MarchingCubes
) {
  for (let i = 1; i <= numBalls; i++) {
    addBallWithPositionAndSize(
      1 - (joint2.x + (joint1.x - joint2.x) * (i / (numBalls + 1))),
      1 - (joint2.y + (joint1.y - joint2.y) * (i / (numBalls + 1))),
      strength,
      skeletonMetaballs
    );
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
  skeletonMetaballs.isolation = 750; // blobbiness or size. smaller number = bigger
  skeletonMetaballs.userData = {
    update(landmarks: any) {
      skeletonMetaballs.reset();
      // loop through all existing rigid bodies, get add a metaball to each
      for (let j = 0; j < landmarks.length; j++) {
        // Calculate z position of landmarks[0][0] and scale strength
        const zPos = landmarks[j][0].z;

        // TODO: Make this more accurate
        // scale -1...0 to 1...0
        const zPosScaled = scaleValue(zPos, -1, 0, 1, 0);

        const strength = 0.15; // * zPosScaled; // size

        skeletonBodies.forEach((b, i) => {
          // Skip all head landmarks and foot index
          if (i > 10 && i < 31) {
            addBallWithPositionAndSize(
              1 - landmarks[j][i].x,
              1 - landmarks[j][i].y,
              strength,
              skeletonMetaballs
            );
          }
        });

        // Add skeleton head
        addBallWithPositionAndSize(
          1 - landmarks[j][0].x,
          1 - landmarks[j][0].y,
          7 * strength,
          skeletonMetaballs
        );

        // Add the skeleton's torso
        // Calculate X, Y average between left and right shoulder (x), left shoulder and left hip (y)

        // Torso top
        addBallWithPositionAndSize(
          1 - (landmarks[j][12].x + landmarks[j][11].x) * 0.5,
          1 -
            (landmarks[j][24].y +
              (landmarks[j][12].y - landmarks[j][24].y) * 0.75),
          4.75 * strength,
          skeletonMetaballs
        );

        // Torso center
        addBallWithPositionAndSize(
          1 - (landmarks[j][12].x + landmarks[j][11].x) * 0.5,
          1 -
            (landmarks[j][24].y +
              (landmarks[j][12].y - landmarks[j][24].y) * 0.5),
          5.25 * strength,
          skeletonMetaballs
        );

        // Torso bottom
        addBallWithPositionAndSize(
          1 - (landmarks[j][12].x + landmarks[j][11].x) * 0.5,
          1 -
            (landmarks[j][24].y +
              (landmarks[j][12].y - landmarks[j][24].y) * 0.33),
          5.25 * strength,
          skeletonMetaballs
        );

        // Left bicep
        addBallsBetweenJoints(
          landmarks[j][12],
          landmarks[j][14],
          2,
          strength,
          skeletonMetaballs
        );

        // Right bicep
        addBallsBetweenJoints(
          landmarks[j][11],
          landmarks[j][13],
          2,
          strength,
          skeletonMetaballs
        );

        // Left forearm
        addBallsBetweenJoints(
          landmarks[j][14],
          landmarks[j][16],
          2,
          strength,
          skeletonMetaballs
        );

        // Right forearm
        addBallsBetweenJoints(
          landmarks[j][13],
          landmarks[j][15],
          2,
          strength,
          skeletonMetaballs
        );

        // Left leg top 1 24, 26
        addBallsBetweenJoints(
          landmarks[j][24],
          landmarks[j][26],
          4,
          strength,
          skeletonMetaballs
        );

        // Left leg bottom 1 26, 28
        addBallsBetweenJoints(
          landmarks[j][26],
          landmarks[j][28],
          4,
          strength,
          skeletonMetaballs
        );

        // Right leg top 1 23, 25
        addBallsBetweenJoints(
          landmarks[j][23],
          landmarks[j][25],
          4,
          strength,
          skeletonMetaballs
        );

        // Right leg bottom 1 25, 27
        addBallsBetweenJoints(
          landmarks[j][25],
          landmarks[j][27],
          4,
          strength,
          skeletonMetaballs
        );
      }

      skeletonMetaballs.update();
    },
  };
  return skeletonMetaballs;
}
