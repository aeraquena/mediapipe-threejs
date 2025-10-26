import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { JOINTS, POSE_CONNECTIONS } from "./mediaPipeHelper";
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

function addBallWithPositionAndSize(
  xPos: number,
  yPos: number,
  strength: number,
  skeletonMetaballs: MarchingCubes
) {
  skeletonMetaballs.addBall(
    1 - xPos, // Subtracts pos from 1 to flip orientation
    1 - yPos, // Subtracts pos from 1 to flip orientation
    0,
    strength,
    6, // subtract = lightness
    new THREE.Color().setRGB(Math.random(), Math.random(), Math.random()) // TODO: This color doesn't work
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
      joint2.x + (joint1.x - joint2.x) * (i / (numBalls + 1)),
      joint2.y + (joint1.y - joint2.y) * (i / (numBalls + 1)),
      strength,
      skeletonMetaballs
    );
  }
}

// Create and return skeleton metaballs
export function createSkeletonMetaballs(RAPIER: any, world: any) {
  // Initialize bodies for joints
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
  //const matcapMat = new THREE.MeshMatcapMaterial();
  //matcapMat.color = new THREE.Color().setHex(0x4deeea);
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
        //const zPos = landmarks[j][JOINTS.NOSE].z;

        // TODO: Make this more accurate
        // scale -1...0 to 1...0
        //const zPosScaled = scaleValue(zPos, -1, 0, 1, 0);

        const strength = 0.15; // * zPosScaled; // size

        skeletonBodies.forEach((b, i) => {
          // Skip all head landmarks and foot index
          if (i > 10 && i < 31) {
            addBallWithPositionAndSize(
              landmarks[j][i].x,
              landmarks[j][i].y,
              strength,
              skeletonMetaballs
            );
          }
        });

        // Add skeleton head
        addBallWithPositionAndSize(
          landmarks[j][JOINTS.NOSE].x,
          landmarks[j][JOINTS.NOSE].y,
          7 * strength,
          skeletonMetaballs
        );

        // Add the skeleton's torso
        // Calculate X, Y average between left and right shoulder (x), left shoulder and left hip (y)

        // Torso top
        addBallWithPositionAndSize(
          (landmarks[j][JOINTS.RIGHT_SHOULDER].x +
            landmarks[j][JOINTS.LEFT_SHOULDER].x) *
            0.5,
          landmarks[j][JOINTS.RIGHT_HIP].y +
            (landmarks[j][JOINTS.RIGHT_SHOULDER].y -
              landmarks[j][JOINTS.RIGHT_HIP].y) *
              0.75,
          4.75 * strength,
          skeletonMetaballs
        );

        // Torso center
        addBallWithPositionAndSize(
          (landmarks[j][JOINTS.RIGHT_SHOULDER].x +
            landmarks[j][JOINTS.LEFT_SHOULDER].x) *
            0.5,
          landmarks[j][JOINTS.RIGHT_HIP].y +
            (landmarks[j][JOINTS.RIGHT_SHOULDER].y -
              landmarks[j][JOINTS.RIGHT_HIP].y) *
              0.5,
          5.25 * strength,
          skeletonMetaballs
        );

        // Torso bottom
        addBallWithPositionAndSize(
          (landmarks[j][JOINTS.RIGHT_SHOULDER].x +
            landmarks[j][JOINTS.LEFT_SHOULDER].x) *
            0.5,
          landmarks[j][JOINTS.RIGHT_HIP].y +
            (landmarks[j][JOINTS.RIGHT_SHOULDER].y -
              landmarks[j][JOINTS.RIGHT_HIP].y) *
              0.33,
          5.25 * strength,
          skeletonMetaballs
        );

        // Right bicep
        addBallsBetweenJoints(
          landmarks[j][JOINTS.RIGHT_SHOULDER],
          landmarks[j][JOINTS.RIGHT_ELBOW],
          2,
          strength,
          skeletonMetaballs
        );

        // Left bicep
        addBallsBetweenJoints(
          landmarks[j][JOINTS.LEFT_SHOULDER],
          landmarks[j][JOINTS.LEFT_ELBOW],
          2,
          strength,
          skeletonMetaballs
        );

        // Right forearm
        addBallsBetweenJoints(
          landmarks[j][JOINTS.RIGHT_ELBOW],
          landmarks[j][JOINTS.RIGHT_WRIST],
          2,
          strength,
          skeletonMetaballs
        );

        // Left forearm
        addBallsBetweenJoints(
          landmarks[j][JOINTS.LEFT_ELBOW],
          landmarks[j][JOINTS.LEFT_WRIST],
          2,
          strength,
          skeletonMetaballs
        );

        // Right leg top 1 24, 26
        addBallsBetweenJoints(
          landmarks[j][JOINTS.RIGHT_HIP],
          landmarks[j][JOINTS.RIGHT_KNEE],
          4,
          strength,
          skeletonMetaballs
        );

        // Right leg bottom 1 26, 28
        addBallsBetweenJoints(
          landmarks[j][JOINTS.RIGHT_KNEE],
          landmarks[j][JOINTS.RIGHT_ANKLE],
          4,
          strength,
          skeletonMetaballs
        );

        // Left leg top 1 23, 25
        addBallsBetweenJoints(
          landmarks[j][JOINTS.LEFT_HIP],
          landmarks[j][JOINTS.LEFT_KNEE],
          4,
          strength,
          skeletonMetaballs
        );

        // Left leg bottom 1 25, 27
        addBallsBetweenJoints(
          landmarks[j][JOINTS.LEFT_KNEE],
          landmarks[j][JOINTS.LEFT_ANKLE],
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
