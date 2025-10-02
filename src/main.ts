import * as THREE from "three";
import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "@mediapipe/tasks-vision";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

/********************************************************************
 * MediaPipe                                                        *
 ********************************************************************/

const demosSection = document.getElementById("demos") as HTMLElement;

let poseLandmarker: PoseLandmarker | undefined = undefined;
let runningMode: "IMAGE" | "VIDEO" = "IMAGE";
let enableWebcamButton: HTMLButtonElement | null = null;
let webcamRunning = false;
const videoHeight = "360px";
const videoWidth = "480px";

// Before we can use PoseLandmarker class we must wait for it to finish
// loading. Machine Learning models can be large and take a moment to
// get everything needed to run.
const createPoseLandmarker = async () => {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
  );
  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task`,
      // https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
      delegate: "GPU",
    },
    runningMode: runningMode,
    numPoses: 2,
  });
  demosSection.classList.remove("invisible");
};
createPoseLandmarker();

/***********************************************************
// Continuously grab image from webcam stream and detect it.
************************************************************/

const video = document.getElementById("webcam") as HTMLVideoElement;
const canvasElement = document.getElementById(
  "output_canvas"
) as HTMLCanvasElement;
const canvasCtx = canvasElement.getContext("2d") as CanvasRenderingContext2D;
const drawingUtils = new DrawingUtils(canvasCtx as CanvasRenderingContext2D);

// Helper: 2D Euclidean distance for normalized coordinates (x,y in 0..1)
function distance2D(
  a: { x: number; y: number } | undefined | null,
  b: { x: number; y: number } | undefined | null
): number | null {
  if (!a || !b) return null;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

// Draw a horizontal distance bar at the bottom of the canvas.
// length is proportional to the normalized distance (0..1)
function drawDistanceBar(
  normalizedDistance: number | null,
  opts: Partial<{ x: number; y: number; height: number; maxWidth: number }> = {}
): void {
  const {
    x = 10,
    y = canvasElement.height - 30,
    height = 12,
    maxWidth = canvasElement.width - 20,
  } = opts;
  const barWidth = Math.max(0, Math.min(1, normalizedDistance || 0)) * maxWidth;

  // background
  canvasCtx.fillStyle = "rgba(0,0,0,0.25)";
  canvasCtx.fillRect(x, y, maxWidth, height);

  // foreground (distance)
  canvasCtx.fillStyle = "rgba(0,200,100,0.9)";
  canvasCtx.fillRect(x, y, barWidth, height);

  // border
  canvasCtx.strokeStyle = "rgba(0,0,0,0.8)";
  canvasCtx.lineWidth = 1;
  canvasCtx.strokeRect(x, y, maxWidth, height);

  // text
  canvasCtx.fillStyle = "white";
  canvasCtx.font = "12px Arial";
  canvasCtx.fillText(
    `dist: ${
      normalizedDistance !== null ? normalizedDistance.toFixed(3) : "n/a"
    }`,
    x + 4,
    y + height - 2
  );
}

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

let handDistance: number | null = 0;

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
      //console.log(result);
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
        // Log for each pose
        result.landmarks.forEach((poseLandmarks, i) => {
          const lm19 = poseLandmarks[19];
          const lm20 = poseLandmarks[20];
          const dist = distance2D(lm19, lm20);
          if (dist !== null) {
            console.log(
              `pose ${i} distance between landmarks 19 & 20: ${dist.toFixed(4)}`
            );
          } else {
            console.log(`pose ${i} missing landmark 19 or 20`);
          }
        });

        // Draw a distance bar for the primary pose (pose 0)
        const primary = result.landmarks[0];
        const lm19 = primary && primary[19];
        const lm20 = primary && primary[20];
        const primaryDist = distance2D(lm19, lm20);
        handDistance = primaryDist;
        //drawDistanceBar(primaryDist);
      }

      canvasCtx.restore();
    });
  }

  // Call this function again to keep predicting when the browser is ready.
  if (webcamRunning === true) {
    window.requestAnimationFrame(predictWebcam as FrameRequestCallback);
  }
}

/********************************************************************
 * Three.JS                                                         *
 ********************************************************************/

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

// Lighting

// directional light
const white = 0xffffff;
const directionalLight = new THREE.DirectionalLight(white, 3);
directionalLight.position.set(100, 0, 100);
directionalLight.target.position.set(5, 5, 0);
scene.add(directionalLight);
scene.add(directionalLight.target);

// Cube

const geometry = new THREE.BoxGeometry(4, 4, 4);
const material = new THREE.MeshToonMaterial({ color: 0x00ff00 });
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

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
//scene.add(sphere);
sphere.position.x = 10;

// Dodecahedron
const dodecRadius = 5;
const dodecDetail = 0;
const dodecGeometry = new THREE.DodecahedronGeometry(dodecRadius, dodecDetail);
const dodecMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
const dodecahedron = new THREE.Mesh(dodecGeometry, dodecMaterial);
//scene.add(dodecahedron);
dodecahedron.position.y = 10;

// Animate the scene

function animate() {
  cube.rotation.x += 0.01;
  cube.scale.x = handDistance ? handDistance * 10 : 0;
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);
