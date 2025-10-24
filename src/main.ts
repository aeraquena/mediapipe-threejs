import * as THREE from "three";
import { PoseLandmarker, DrawingUtils } from "@mediapipe/tasks-vision";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import * as threeHelper from "./utils/threeHelper";
import * as mediaPipeHelper from "./utils/mediaPipeHelper";
import * as tfHelper from "./utils/tfHelper";
import * as uiHelper from "./utils/uiHelper";
import RAPIER from "@dimforge/rapier3d-compat";

/***************
 * UI Elements *
 ***************/

let enableWebcamButton: HTMLButtonElement | null = null;
let trainBodyButton: HTMLButtonElement | null = null;
let danceButton: HTMLButtonElement | null = null;

const video = document.getElementById("webcam") as HTMLVideoElement;
const canvasElement = document.getElementById(
  "output_canvas"
) as HTMLCanvasElement;
const canvasCtx = canvasElement.getContext("2d") as CanvasRenderingContext2D;
const drawingUtils = new DrawingUtils(canvasCtx as CanvasRenderingContext2D);

const countdownDuration = 3;

trainBodyButton = document.getElementById(
  "trainBodyButton"
) as HTMLButtonElement | null;
trainBodyButton?.addEventListener("click", () => {
  uiHelper.startCountdown(countdownDuration);
  setTimeout(() => {
    trainBody();
  }, countdownDuration * 1000);
});

danceButton = document.getElementById(
  "danceButton"
) as HTMLButtonElement | null;
danceButton?.addEventListener("click", dance);

/**************************
 * MediaPipe declarations *
 **************************/

let poseLandmarker: PoseLandmarker | undefined = undefined;
let runningMode: "IMAGE" | "VIDEO" = "IMAGE";

let recordingPhase: "idle" | "person1" | "person2" = "idle";

let webcamRunning = false;
const videoHeight = "720px";
const videoWidth = "960px";

// Create and wait for pose landmarker to finish loading
poseLandmarker = await mediaPipeHelper.createPoseLandmarker(
  poseLandmarker,
  runningMode
);

const MLMode = {
  TRAINING: "Training",
  PREDICTING: "Predicting",
  IDLE: "Idle",
};

/***************************
 * Tensorflow declarations *
 ***************************/

// Array of 66D poses per person
let person1Poses: number[][] = [];
let person2Poses: number[][] = [];
let mlMode = MLMode.IDLE;
let trainingDuration = 10;

let myModel: any;
let myNormalizations: any;
let playbackStartTime = 0;

let predictedPose: number[] = []; // 66D predicted pose

/***********************************************************************
// MediaPipe: Continuously grab image from webcam stream and detect it.
************************************************************************/

// Check if webcam access is supported.
const hasGetUserMedia = (): boolean => !!navigator.mediaDevices?.getUserMedia;

// If webcam supported, add event listener to button for when user
// wants to activate it.
if (hasGetUserMedia()) {
  enableWebcamButton = document.getElementById(
    "webcamButton"
  ) as HTMLButtonElement | null;
  if (enableWebcamButton) {
    enableWebcamButton.addEventListener("click", enableCam as EventListener);
  }
} else {
  console.warn("getUserMedia() is not supported by your browser");
}

// Enable the live webcam view and start detection.
function enableCam(_event?: Event): void {
  if (!poseLandmarker) {
    console.log("Wait! poseLandmarker not loaded yet.");
    return;
  }

  if (webcamRunning === true) {
    webcamRunning = false;
    if (enableWebcamButton) enableWebcamButton.innerText = "ENABLE WEBCAM";
  } else {
    webcamRunning = true;
    if (enableWebcamButton) enableWebcamButton.innerText = "DISABLE WEBCAM";
  }

  // getUsermedia parameters.
  const constraints: MediaStreamConstraints = {
    video: true,
  };

  // Activate the webcam stream.
  navigator.mediaDevices
    .getUserMedia(constraints)
    .then((stream: MediaStream) => {
      video.srcObject = stream;
      video.addEventListener("loadeddata", predictWebcam as EventListener);
    });
}

let lastVideoTime = -1;

let lastHandPositionFrame: any = null;

let velocityToTime: any = [];

async function predictWebcam() {
  // Sets the canvas element and video height and width on every frame
  // Does the small size improve MediaPipe performance?
  canvasElement.style.height = videoHeight;
  video.style.height = videoHeight;
  canvasElement.style.width = videoWidth;
  video.style.width = videoWidth;

  // Now let's start detecting the stream.
  if (runningMode === "IMAGE") {
    runningMode = "VIDEO";
    await poseLandmarker!.setOptions({ runningMode: "VIDEO" });
  }
  let startTimeMs = performance.now();
  if (lastVideoTime !== video.currentTime) {
    const lastFrameDuration = video.currentTime - lastVideoTime;
    lastVideoTime = video.currentTime;
    //console.log(lastVideoTime);
    poseLandmarker!.detectForVideo(video, startTimeMs, (result) => {
      /*
        landmarks:
          0: 
            0: {x: 0, y: 0; z: 0}
            ...
            33
      */

      // calculate velocity of left hand
      //console.log("current frame:");
      //console.log(result.landmarks[0] ? result.landmarks[0][20] : null);
      //console.log("last frame: ", lastHandPositionFrame);

      // Training: record poses separately for each person
      if (mlMode === MLMode.TRAINING && result.landmarks[0]) {
        const pose = tfHelper.flattenPose(result.landmarks[0]);

        if (recordingPhase === "person1") {
          person1Poses.push(pose);
        } else if (recordingPhase === "person2") {
          person2Poses.push(pose);
        }

        // difference
        if (result.landmarks[0] && result.landmarks[0][20]) {
          if (lastHandPositionFrame) {
            const xVelocity =
              (result.landmarks[0][20].x - lastHandPositionFrame.x) /
              lastFrameDuration;
            velocityToTime.push({
              currentTime: video.currentTime,
              xVelocity: xVelocity,
            });
          }
          lastHandPositionFrame = result.landmarks[0][20];
        }
      }
      // Predicting: input pose, predict output
      else if (mlMode === MLMode.PREDICTING && result.landmarks[0]) {
        const inputPose = tfHelper.flattenPose(result.landmarks[0]);
        predictedPose = tfHelper.predictPose(
          myModel,
          inputPose,
          myNormalizations
        );
      }

      // Drawing utils
      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      for (const landmark of result.landmarks) {
        drawingUtils.drawLandmarks(landmark as NormalizedLandmark[], {
          radius: (data: any) =>
            DrawingUtils.lerp((data.from?.z ?? 0) as number, -0.15, 0.1, 5, 1),
        });
        drawingUtils.drawConnectors(
          landmark as NormalizedLandmark[],
          PoseLandmarker.POSE_CONNECTIONS as any
        );
      }

      // Draw a metaball at each landmark
      skeletonMetaballs.userData.update(result.landmarks);

      canvasCtx.restore();
    });
  }

  if (webcamRunning === true) {
    window.requestAnimationFrame(predictWebcam as FrameRequestCallback);
  }
}

/******************
 * AI Training UI *
 ******************/

// Train AI on body poses
function trainBody() {
  // Phase 1: Record Person 1
  if (person1Poses.length === 0) {
    recordingPhase = "person1";
    mlMode = MLMode.TRAINING;
    person1Poses = [];

    if (trainBodyButton) {
      trainBodyButton.innerText = "RECORDING PERSON 1...";
      trainBodyButton.disabled = true;
    }
    uiHelper.startCountdown(trainingDuration);

    setTimeout(() => {
      mlMode = MLMode.IDLE;

      if (trainBodyButton) {
        trainBodyButton.innerText = "RECORD PERSON 2";
        trainBodyButton.disabled = false;
      }

      console.log(`Person 1: Collected ${person1Poses.length} poses`);

      let avgVelocityToTime = [];
      for (let i = 0; i < velocityToTime.length - 4; i++) {
        // average i...i+4
        avgVelocityToTime.push({
          currentTime: velocityToTime[i].currentTime,
          xVelocity:
            velocityToTime
              .slice(i, i + 4)
              .reduce((sum: number, i: any) => sum + i.xVelocity, 0) / 4,
        });
      }
      console.log(avgVelocityToTime);
    }, trainingDuration * 1000);
  }
  // Phase 2: Record Person 2 and train model
  else if (person1Poses.length > 0 && person2Poses.length === 0) {
    recordingPhase = "person2";
    mlMode = MLMode.TRAINING;
    person2Poses = [];

    if (trainBodyButton) {
      trainBodyButton.innerText = "RECORDING PERSON 2...";
      trainBodyButton.disabled = true;
    }
    uiHelper.startCountdown(trainingDuration);

    setTimeout(async () => {
      // TODO: Can I make this a function, to not repeat myself twice?
      mlMode = MLMode.IDLE;
      recordingPhase = "idle";

      console.log(`Person 2: Collected ${person2Poses.length} poses`);

      if (person1Poses.length > 10 && person2Poses.length > 10) {
        // Align datasets to same length
        const minLen = Math.min(person1Poses.length, person2Poses.length);
        const trainingData: tfHelper.PoseDatum[] = [];

        for (let i = 0; i < minLen; i++) {
          trainingData.push({
            person1Pose: person1Poses[i],
            person2Pose: person2Poses[i],
          });
        }

        if (trainBodyButton) {
          trainBodyButton.innerText = "TRAINING MODEL...";
        }

        let result: any = await tfHelper.run(trainingData);
        myModel = result.model;
        myNormalizations = result.tensorData;

        if (trainBodyButton) {
          trainBodyButton.innerText = "RETRAIN MODEL";
          trainBodyButton.disabled = false;
        }
      } else {
        if (trainBodyButton) {
          trainBodyButton.innerText = "RETRAIN MODEL";
          trainBodyButton.disabled = false;
        }
        alert("Not enough training data collected. Please try again.");
      }
    }, trainingDuration * 1000);
  }
  // Reset: Start over
  else {
    person1Poses = [];
    person2Poses = [];
    myModel = null;
    myNormalizations = null;

    if (trainBodyButton) {
      trainBodyButton.innerText = "RECORD PERSON 1";
    }
    alert("Reset! Click button to record Person 1 again.");
  }
}

// User clicks "Dance with AI button" once the AI has finished training.
// Show a dancing skeleton that reacts to user's movement.
function dance() {
  if (!myModel) {
    alert("Please train the model first!");
    return;
  }
  mlMode = MLMode.PREDICTING;
}

/************
 * Three.JS *
 ************/

const renderer = new THREE.WebGLRenderer({
  preserveDrawingBuffer: true, // so canvas.toBlob() make sense
  alpha: true, // so png background is transparent
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.id = "threeJsCanvas";
document.body.appendChild(renderer.domElement);

const camera = threeHelper.addCamera();
camera.position.set(0, 0, 10);
camera.lookAt(0, 0, 0);

// Add orbit controls
threeHelper.addOrbitControls(camera, renderer.domElement);

const scene: THREE.Scene = new THREE.Scene();

// Rapier

// initialize RAPIER
await RAPIER.init();
let gravity = { x: 0, y: 0, z: 0 };
let world = new RAPIER.World(gravity);

const directionalLight = threeHelper.addDirectionalLight();
scene.add(directionalLight);
scene.add(directionalLight.target);

// Metaballs for joints
// For now, this will reflect the LIVE body. Can generalize later for recorded + ML bodies
const skeletonMetaballs = threeHelper.createSkeletonMetaballs(RAPIER, world);
scene.add(skeletonMetaballs);

// Create skeleton visualization for predicted pose
const skeletonGroup = new THREE.Group();
scene.add(skeletonGroup);

// Update skeleton
// Doesn't work if I move this into a separate file
// TODO: This needs to pass in which skeletonGroup
function updateSkeleton(pose: number[]) {
  if (pose.length !== 66) return;

  // Update joint positions
  for (let i = 0; i < 33; i++) {
    const joint = skeletonGroup.getObjectByName(`joint_${i}`);
    if (joint) {
      // Convert normalized coords (0-1) to 3D space (-50 to 50)
      const x = (pose[i * 2] - 0.5) * 100;
      const y = (0.5 - pose[i * 2 + 1]) * 100; // Flip Y
      joint.position.set(x, y, 0);
    }
  }

  // Update connection lines
  for (const [start, end] of mediaPipeHelper.POSE_CONNECTIONS) {
    const line = skeletonGroup.getObjectByName(
      `connection_${start}_${end}`
    ) as THREE.Line;
    if (line) {
      const startJoint = skeletonGroup.getObjectByName(`joint_${start}`);
      const endJoint = skeletonGroup.getObjectByName(`joint_${end}`);

      if (startJoint && endJoint) {
        const positions = line.geometry.attributes.position
          .array as Float32Array;
        positions[0] = startJoint.position.x;
        positions[1] = startJoint.position.y;
        positions[2] = startJoint.position.z;
        positions[3] = endJoint.position.x;
        positions[4] = endJoint.position.y;
        positions[5] = endJoint.position.z;
        line.geometry.attributes.position.needsUpdate = true;
      }
    }
  }
}

// Initialize skeleton
threeHelper.createSkeletonVisualization(skeletonGroup);

// Animate scene with Three.js
function animate() {
  // Update predicted skeleton
  if (recordingPhase === "person2" && person1Poses.length > 0) {
    if (playbackStartTime === 0) {
      playbackStartTime = performance.now();
    }
    const elapsedTime = performance.now() - playbackStartTime;
    const progress = elapsedTime / (trainingDuration * 1000);
    const frameIndex = Math.floor(progress * person1Poses.length);

    if (frameIndex < person1Poses.length) {
      updateSkeleton(person1Poses[frameIndex]);
      skeletonGroup.visible = true;
    } else {
      // Playback finished, but we wait for the recording to finish
      skeletonGroup.visible = false;
    }
  } else if (predictedPose.length === 66 && mlMode === MLMode.PREDICTING) {
    updateSkeleton(predictedPose);
    skeletonGroup.visible = true;
  } else {
    skeletonGroup.visible = false;
  }

  if (recordingPhase !== "person2" && playbackStartTime !== 0) {
    playbackStartTime = 0;
  }

  // Metaballs
  world.step();

  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
