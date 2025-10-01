import * as THREE from "three";
import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "@mediapipe/tasks-vision";

/********************************************************************
 * MediaPipe                                                        *
 ********************************************************************/

const demosSection = document.getElementById("demos");

let poseLandmarker = undefined;
let runningMode = "IMAGE";
let enableWebcamButton;
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
      // https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task
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

const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const drawingUtils = new DrawingUtils(canvasCtx);

// Helper: 2D Euclidean distance for normalized coordinates (x,y in 0..1)
function distance2D(a, b) {
  if (!a || !b) return null;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

// Draw a horizontal distance bar at the bottom of the canvas.
// length is proportional to the normalized distance (0..1)
function drawDistanceBar(normalizedDistance, opts = {}) {
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
const hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia;

// If webcam supported, add event listener to button for when user
// wants to activate it.
if (hasGetUserMedia()) {
  enableWebcamButton = document.getElementById("webcamButton");
  enableWebcamButton.addEventListener("click", enableCam);
} else {
  console.warn("getUserMedia() is not supported by your browser");
}

// Enable the live webcam view and start detection.
function enableCam(event) {
  if (!poseLandmarker) {
    console.log("Wait! poseLandmaker not loaded yet.");
    return;
  }

  if (webcamRunning === true) {
    webcamRunning = false;
    enableWebcamButton.innerText = "ENABLE PREDICTIONS";
  } else {
    webcamRunning = true;
    enableWebcamButton.innerText = "DISABLE PREDICTIONS";
  }

  // getUsermedia parameters.
  const constraints = {
    video: true,
  };

  // Activate the webcam stream.
  navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
    video.srcObject = stream;
    video.addEventListener("loadeddata", predictWebcam);
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
    await poseLandmarker.setOptions({ runningMode: "VIDEO" });
  }
  let startTimeMs = performance.now();
  if (lastVideoTime !== video.currentTime) {
    lastVideoTime = video.currentTime;
    poseLandmarker.detectForVideo(video, startTimeMs, (result) => {
      //console.log(result);
      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      for (const landmark of result.landmarks) {
        drawingUtils.drawLandmarks(landmark, {
          radius: (data) =>
            DrawingUtils.lerp(data.from && data.from.z, -0.15, 0.1, 5, 1),
        });
        drawingUtils.drawConnectors(landmark, PoseLandmarker.POSE_CONNECTIONS);
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
        drawDistanceBar(primaryDist);
      }

      canvasCtx.restore();
    });
  }

  // Call this function again to keep predicting when the browser is ready.
  if (webcamRunning === true) {
    window.requestAnimationFrame(predictWebcam);
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
//scene.add(line);

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
  cube.rotation.y += 0.01;
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);
