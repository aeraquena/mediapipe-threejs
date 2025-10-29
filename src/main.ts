import * as THREE from "three";
import { PoseLandmarker, DrawingUtils } from "@mediapipe/tasks-vision";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import * as threeHelper from "./utils/threeHelper";
import * as mediaPipeHelper from "./utils/mediaPipeHelper";
import * as tfHelper from "./utils/tfHelper";
import * as uiHelper from "./utils/uiHelper";
import RAPIER from "@dimforge/rapier3d-compat";
import { update } from "three/examples/jsm/libs/tween.module.js";

/***************
 * UI Elements *
 ***************/

let enableWebcamButton: HTMLButtonElement | null = null;
let videoToggleButton: HTMLButtonElement | null = null;
let trainBodyButton: HTMLButtonElement | null = null;

const video = document.getElementById("webcam") as HTMLVideoElement;
const canvasElement = document.getElementById(
  "output_canvas"
) as HTMLCanvasElement;
const canvasCtx = canvasElement.getContext("2d") as CanvasRenderingContext2D;
const drawingUtils = new DrawingUtils(canvasCtx as CanvasRenderingContext2D);

const countdownDuration = 3;

videoToggleButton = document.getElementById(
  "videoToggleButton"
) as HTMLButtonElement | null;

videoToggleButton?.addEventListener("click", toggleVideo);

trainBodyButton = document.getElementById(
  "trainBodyButton"
) as HTMLButtonElement | null;

trainBodyButton?.addEventListener("click", countdownToRecord);

/**************************
 * MediaPipe declarations *
 **************************/

let poseLandmarker: PoseLandmarker | undefined = undefined;
let runningMode: "IMAGE" | "VIDEO" = "IMAGE";

let recordingPhase: "idle" | "person1" | "person2" | "both" = "idle";

let webcamRunning = false;
const videoHeight = "360px";
const videoWidth = "480px";

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

// Model of Person 2, controlled by Person 1
let myModel: any;
let myNormalizations: any;
let playbackStartTime = 0;

// Model of Person 1, controlled by Person 2
let myModel2: any;
let myNormalizations2: any;

let predictedPose: number[] = []; // 66D predicted pose
let predictedPose2: number[] = []; // 66D predicted pose

// The current pose for all humans, playback, and AI
// TODO: We only need x, y, not z or visibility
let currentPoses: NormalizedLandmark[][] = [];

let numberOfPlayers: number;

/****************
 * UI functions *
 ****************/

function countdownToRecord() {
  uiHelper.startCountdown(countdownDuration);
  setTimeout(() => {
    recordBodies();
  }, countdownDuration * 1000);
}

function updateTrainBodyButton() {
  if (trainBodyButton) {
    if (numberOfPlayers === 2) {
      trainBodyButton.innerText = "RECORD 2 PEOPLE";
    } else {
      trainBodyButton.innerText = "RECORD 1 PERSON";
    }
  }
}

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
    lastVideoTime = video.currentTime;
    poseLandmarker!.detectForVideo(video, startTimeMs, (result) => {
      // Training: record poses separately for each person
      if (mlMode === MLMode.TRAINING) {
        if (
          numberOfPlayers === 2 &&
          //recordingPhase === "both" &&
          result.landmarks[0] &&
          result.landmarks[1]
        ) {
          // 2 person mode
          const pose1 = tfHelper.flattenPose(result.landmarks[0]);
          const pose2 = tfHelper.flattenPose(result.landmarks[1]);

          person1Poses.push(pose1);
          person2Poses.push(pose2);
        } else if (result.landmarks[0]) {
          // 1 person mode
          const pose = tfHelper.flattenPose(result.landmarks[0]);

          if (recordingPhase === "person1") {
            person1Poses.push(pose);
          } else if (recordingPhase === "person2") {
            person2Poses.push(pose);
          }
        }
      }
      // Predicting: input pose, predict output
      else if (mlMode === MLMode.PREDICTING && result.landmarks[0]) {
        // Model 1: Person 1 controls Person 2
        const inputPose = tfHelper.flattenPose(result.landmarks[0]);
        predictedPose = tfHelper.predictPose(
          myModel,
          inputPose,
          myNormalizations
        );

        // Model 2: Person 2 controls Person 1
        if (myModel2) {
          let inputPose;
          if (numberOfPlayers === 2 && result.landmarks[1]) {
            // Change to 1 when 2 people are present
            inputPose = tfHelper.flattenPose(result.landmarks[1]);
          } else if (result.landmarks[0]) {
            // If only 1 person present, control both models with person 1
            inputPose = tfHelper.flattenPose(result.landmarks[0]);
          }
          if (inputPose) {
            predictedPose2 = tfHelper.predictPose(
              myModel2,
              inputPose,
              myNormalizations2
            );
          }
        }
      }

      if (mlMode !== MLMode.TRAINING) {
        // Update number of players
        numberOfPlayers = result.landmarks.length;
        updateTrainBodyButton();
      }

      // Clear current poses
      currentPoses = [];

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

        currentPoses.push(landmark);
      }

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

function toggleVideo() {
  if (video.style.display === "none" || video.style.display === "") {
    video.style.display = "block"; // Show the element
    if (videoToggleButton) {
      videoToggleButton.innerText = "VIDEO OFF";
    }
  } else {
    video.style.display = "none"; // Hide the element
    if (videoToggleButton) {
      videoToggleButton.innerText = "VIDEO ON";
    }
  }
}

async function trainModel() {
  if (person1Poses.length > 10 && person2Poses.length > 10) {
    // Align datasets to same length
    const minLen = Math.min(person1Poses.length, person2Poses.length);
    const trainingData: tfHelper.PoseDatum[] = [];
    const trainingData2: tfHelper.PoseDatum[] = [];

    for (let i = 0; i < minLen; i++) {
      trainingData.push({
        person1Pose: person1Poses[i],
        person2Pose: person2Poses[i],
      });

      trainingData2.push({
        person1Pose: person2Poses[i],
        person2Pose: person1Poses[i],
      });
    }

    if (trainBodyButton) {
      trainBodyButton.innerText = "TRAINING MODEL...";
    }

    let result: any = await tfHelper.run(trainingData);
    myModel = result.model;
    myNormalizations = result.tensorData;

    let result2: any = await tfHelper.run(trainingData2);
    myModel2 = result2.model;
    myNormalizations2 = result2.tensorData;

    dance();
  } else {
    alert("Not enough training data collected. Please try again.");
  }
  if (trainBodyButton) {
    trainBodyButton.innerText = "RETRAIN MODEL";
    trainBodyButton.disabled = false;
  }
}

// Toggles recordingPhase and MLMode
function recordBodies() {
  // Phase 1: Record Person 1
  if (person1Poses.length === 0) {
    // Record 2 people
    if (numberOfPlayers === 2) {
      mlMode = MLMode.TRAINING;
      recordingPhase = "both";
      person1Poses = [];
      person2Poses = [];

      if (trainBodyButton) {
        trainBodyButton.innerText = "RECORDING BOTH...";
        trainBodyButton.disabled = true;
      }

      uiHelper.startCountdown(trainingDuration);

      setTimeout(async () => {
        // TODO: Can I make this a function, to not repeat myself twice?
        // But it does something different...
        mlMode = MLMode.IDLE;
        recordingPhase = "idle";

        console.log(`Person 1: Collected ${person1Poses.length} poses`);
        console.log(`Person 2: Collected ${person2Poses.length} poses`);

        trainModel();
      }, trainingDuration * 1000);
    } else {
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

        // TODO: Just run train body again

        if (trainBodyButton) {
          //trainBodyButton.innerText = "RECORD PERSON 2";
          trainBodyButton.disabled = false;
        }

        // Record Person 2 automatically
        countdownToRecord();

        console.log(`Person 1: Collected ${person1Poses.length} poses`);
      }, trainingDuration * 1000);
    }
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
      mlMode = MLMode.IDLE;
      recordingPhase = "idle";

      console.log(`Person 2: Collected ${person2Poses.length} poses`);

      trainModel();
    }, trainingDuration * 1000);
  }
  // Reset: Start over
  else {
    person1Poses = [];
    person2Poses = [];
    myModel = null;
    myNormalizations = null;
    myModel2 = null;
    myNormalizations2 = null;

    alert("Reset! Click button to record Person 1 again.");
  }
}

// Once the AI has finished training,
// Show a dancing skeleton that reacts to user's movement.
function dance() {
  if (!myModel && !myModel2) {
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
const skeletonMetaballs = threeHelper.createSkeletonMetaballs(RAPIER, world);
scene.add(skeletonMetaballs);

// Animate scene with Three.js
function animate() {
  // Update predicted skeleton
  // When person 2 is dancing in recording phase 2, show replay of person 1
  if (recordingPhase === "person2" && person1Poses.length > 0) {
    if (playbackStartTime === 0) {
      playbackStartTime = performance.now();
    }
    const elapsedTime = performance.now() - playbackStartTime;
    const progress = elapsedTime / (trainingDuration * 1000);
    const frameIndex = Math.floor(progress * person1Poses.length);

    if (frameIndex < person1Poses.length) {
      // Add person1Poses to currentPoses
      currentPoses.push(tfHelper.unflattenPose(person1Poses[frameIndex]));
    }
  } else if (mlMode === MLMode.PREDICTING) {
    if (predictedPose.length === 66) {
      currentPoses.push(tfHelper.unflattenPose(predictedPose));
    }
    if (predictedPose2.length === 66) {
      currentPoses.push(tfHelper.unflattenPose(predictedPose2));
    }
  }

  if (recordingPhase !== "person2" && playbackStartTime !== 0) {
    playbackStartTime = 0;
  }

  // Metaballs
  // Uncomment to print length of current poses
  //console.log("current poses: ", currentPoses.length);
  skeletonMetaballs.userData.update(currentPoses);
  world.step();

  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
