import * as THREE from "three";
import { PoseLandmarker, DrawingUtils } from "@mediapipe/tasks-vision";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import distance2D from "./utils/distance";
import * as threeHelper from "./utils/threeHelper";
import * as mediaPipeHelper from "./utils/mediaPipeHelper";
import * as tensorflow from "./tensorflow";

/*************
 * MediaPipe *
 *************/

let poseLandmarker: PoseLandmarker | undefined = undefined;
let runningMode: "IMAGE" | "VIDEO" = "IMAGE";
let enableWebcamButton: HTMLButtonElement | null = null;
let trainBodyButton: HTMLButtonElement | null = null;
let webcamRunning = false;
const videoHeight = "360px";
const videoWidth = "480px";

let handDistance: number | null = 0;

// Create and wait for pose landmarker to finish loading
poseLandmarker = await mediaPipeHelper.createPoseLandmarker(
  poseLandmarker,
  runningMode
);

// AI code

const MLMode = {
  TRAINING: "Training",
  PREDICTING: "Predicting",
  IDLE: "Idle",
};

let trainingData: any = [];
let mlMode = MLMode.IDLE;
// TODO: Modes: Idle, Training, and Predicting
let trainingDuration = 10000;

let clientX: number;
let clientY: number;

/***********************************************************
// Continuously grab image from webcam stream and detect it.
************************************************************/

const video = document.getElementById("webcam") as HTMLVideoElement;
const canvasElement = document.getElementById(
  "output_canvas"
) as HTMLCanvasElement;
const canvasCtx = canvasElement.getContext("2d") as CanvasRenderingContext2D;
const drawingUtils = new DrawingUtils(canvasCtx as CanvasRenderingContext2D);

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
    console.log("Wait! poseLandmaker not loaded yet.");
    return;
  }

  if (webcamRunning === true) {
    webcamRunning = false;
    if (enableWebcamButton) enableWebcamButton.innerText = "ENABLE PREDICTIONS";
  } else {
    webcamRunning = true;
    if (enableWebcamButton)
      enableWebcamButton.innerText = "DISABLE PREDICTIONS";
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
      // On result, draw graphics
      //console.log(result);

      // if training is happening!
      if (mlMode === MLMode.TRAINING) {
        trainingData.push({
          handY: result.landmarks[0][19].x, // X position of LEFT index finger on hand. TODO: Can add more
          mouseX: clientX,
          //mouseY: clientY,
        });
      }

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

      // Compute and log normalized 2D distance between landmark indices 19 and 20
      if (result.landmarks && result.landmarks.length) {
        // Draw a distance bar for the primary pose (pose 0)
        const primary = result.landmarks[0];
        const lm19 = primary && primary[19];
        const lm20 = primary && primary[20];
        const primaryDist = distance2D(lm19, lm20);
        handDistance = primaryDist;
      }
      canvasCtx.restore();
    });
  }

  // Call this function again to keep predicting when the browser is ready.
  if (webcamRunning === true) {
    window.requestAnimationFrame(predictWebcam as FrameRequestCallback);
  }
}

/************
 * Three.JS *
 ************/

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const camera = threeHelper.addCamera();
camera.position.set(0, 0, 100);
camera.lookAt(0, 0, 0);

threeHelper.addOrbitControls(camera, renderer.domElement);

const scene: THREE.Scene = new THREE.Scene();

// Directional light
const directionalLight = threeHelper.addDirectionalLight();
scene.add(directionalLight);
scene.add(directionalLight.target);

// Cube
const cube = threeHelper.addCube();
scene.add(cube);

// Animate the scene
function animate() {
  cube.rotation.x += 0.01;
  cube.scale.x = handDistance ? handDistance * 10 : 0;
  // Commented out for now
  //renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

/* AI code */

function startCountdown(seconds: number): void {
  let remaining = seconds;
  let countdownEl = document.getElementById(
    "countdown"
  ) as HTMLDivElement | null;
  if (countdownEl) {
    countdownEl.textContent = remaining.toString();
  }

  const intervalId = window.setInterval(() => {
    remaining -= 1;
    countdownEl!.textContent = remaining.toString();
    if (remaining <= 0) {
      clearInterval(intervalId);
      setTimeout(() => {
        countdownEl!.remove();
      }, 1000);
    }
  }, 1000);
}

// Train body button
trainBodyButton = document.getElementById(
  "trainBodyButton"
) as HTMLButtonElement | null;
trainBodyButton?.addEventListener("click", trainBody);

function trainBody() {
  mlMode = MLMode.TRAINING;
  trainingData = [];
  if (trainBodyButton) {
    trainBodyButton.innerText = "TRAINING AI...";
  }
  // start a countdown that matches trainingDuration (in ms)
  startCountdown(Math.ceil(trainingDuration / 1000));

  setTimeout(() => {
    mlMode = MLMode.IDLE;
    if (trainBodyButton) {
      trainBodyButton.innerText = "TRAIN AI";
    }
    console.log(trainingData);
    tensorflow.run(trainingData);
  }, trainingDuration);
}

// Mouse
document.addEventListener("mousemove", function (event) {
  // Get mouse position relative to the viewport
  clientX = event.clientX;
  clientY = event.clientY;

  const pointer = document.getElementById("pointer");
  if (pointer) {
    // TODO: AND, model predictions are NOT running
    pointer.style.top = clientY.toString() + "px";
    pointer.style.left = clientX.toString() + "px";
  }

  // Get mouse position relative to the document
  //const pageX = event.pageX;
  //const pageY = event.pageY;

  //console.log(`Viewport: X=${clientX}, Y=${clientY}`);
  //console.log(`Document: X=${pageX}, Y=${pageY}`);
});
