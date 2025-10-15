import * as THREE from "three";
import { PoseLandmarker, DrawingUtils } from "@mediapipe/tasks-vision";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import * as threeHelper from "./utils/threeHelper";
import * as mediaPipeHelper from "./utils/mediaPipeHelper";

declare const tf: any;
declare const tfvis: any;

// Normalization / tensor metadata returned by convertToTensor
type NormalizationData = {
  inputs: any;
  labels: any;
  inputMax: any;
  inputMin: any;
  labelMax: any;
  labelMin: any;
};

/*************
 * MediaPipe *
 *************/

let poseLandmarker: PoseLandmarker | undefined = undefined;
let runningMode: "IMAGE" | "VIDEO" = "IMAGE";
let enableWebcamButton: HTMLButtonElement | null = null;
let trainBodyButton: HTMLButtonElement | null = null;
let danceButton: HTMLButtonElement | null = null;
let countdownEl: HTMLDivElement | null = null;
let recordingPhase: "idle" | "person1" | "person2" = "idle"; // TODO: Integrate with MLMode

let webcamRunning = false;
const videoHeight = "360px";
const videoWidth = "480px";

// Create and wait for pose landmarker to finish loading
poseLandmarker = await mediaPipeHelper.createPoseLandmarker(
  poseLandmarker,
  runningMode
);

// AI code
// TODO: Integrate with recordingPhase? "person1", "person2"?
const MLMode = {
  TRAINING: "Training",
  PREDICTING: "Predicting",
  IDLE: "Idle",
};

// Store full pose data (33 landmarks × 2 coords = 66 values)
type PoseDatum = {
  person1Pose: number[]; // 66D: flatten x,y for all 33 landmarks
  person2Pose: number[]; // 66D: flatten x,y for all 33 landmarks
};

// Array of 66D poses per person
let person1Poses: number[][] = [];
let person2Poses: number[][] = [];
let mlMode = MLMode.IDLE;
let trainingDuration = 10000;

let myModel: any;
let myNormalizations: any;
let playbackStartTime = 0;

let predictedPose: number[] = []; // 66D predicted pose

/***********************************************************************
// MediaPipe: Continuously grab image from webcam stream and detect it.
************************************************************************/

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

// Helper: Flatten 33 landmarks into 66D array [x0,y0,x1,y1,...,x32,y32]
function flattenPose(landmarks: NormalizedLandmark[]): number[] {
  const pose: number[] = [];
  for (let i = 0; i < 33; i++) {
    pose.push(landmarks[i]?.x ?? 0);
    pose.push(landmarks[i]?.y ?? 0);
  }
  return pose;
}

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
      // Training: record poses separately for each person
      if (mlMode === MLMode.TRAINING && result.landmarks[0]) {
        const pose = flattenPose(result.landmarks[0]);

        if (recordingPhase === "person1") {
          person1Poses.push(pose);
        } else if (recordingPhase === "person2") {
          person2Poses.push(pose);
        }
      }
      // Predicting: input pose, predict output
      else if (mlMode === MLMode.PREDICTING && result.landmarks[0]) {
        const inputPose = flattenPose(result.landmarks[0]);
        predictedPose = predictPose(myModel, inputPose, myNormalizations);
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

      canvasCtx.restore();
    });
  }

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
camera.position.set(0, 0, 300);
camera.lookAt(0, 0, 0);

//threeHelper.addOrbitControls(camera, renderer.domElement);

const scene: THREE.Scene = new THREE.Scene();

const directionalLight = threeHelper.addDirectionalLight();
scene.add(directionalLight);
scene.add(directionalLight.target);

// Temporary cube for positioning
const geometry = new THREE.BoxGeometry(10, 200, 5);
const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
const cube = new THREE.Mesh(geometry, material);
//scene.add(cube);

// Create skeleton visualization for predicted pose
const skeletonGroup = new THREE.Group();
scene.add(skeletonGroup);

// MediaPipe pose connections (pairs of landmark indices)
// These are circles where lines are drawn between them. TODO: Modify
const POSE_CONNECTIONS = [
  [11, 12],
  [11, 13],
  [13, 15],
  [15, 17],
  [15, 19],
  [15, 21],
  [17, 19],
  [12, 14],
  [14, 16],
  [16, 18],
  [16, 20],
  [16, 22],
  [18, 20],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [27, 29],
  [27, 31],
  [29, 31],
  [24, 26],
  [26, 28],
  [28, 30],
  [28, 32],
  [30, 32],
];

function createSkeletonVisualization() {
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
  for (const [start, end] of POSE_CONNECTIONS) {
    const lineGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(6); // 2 points * 3 coords
    lineGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );

    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x00ffff,
      linewidth: 2,
    });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    line.name = `connection_${start}_${end}`;
    skeletonGroup.add(line);
  }
}

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
  for (const [start, end] of POSE_CONNECTIONS) {
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
createSkeletonVisualization();

// Animate scene with Three.js
function animate() {
  // Update predicted skeleton
  if (recordingPhase === "person2" && person1Poses.length > 0) {
    if (playbackStartTime === 0) {
      playbackStartTime = performance.now();
    }
    const elapsedTime = performance.now() - playbackStartTime;
    const progress = elapsedTime / trainingDuration;
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

  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

/* AI Training UI */

// Displays and starts countdown
function startCountdown(seconds: number): void {
  let remaining = seconds;
  // Use the existing countdown element from HTML
  countdownEl = document.getElementById("countdown") as HTMLDivElement | null;

  if (countdownEl) {
    countdownEl.textContent = remaining.toString();
    countdownEl.style.display = "block";
  }

  const intervalId = window.setInterval(() => {
    remaining -= 1;
    if (countdownEl) {
      countdownEl.textContent = remaining.toString();
    }
    if (remaining <= 0) {
      clearInterval(intervalId);
      setTimeout(() => {
        if (countdownEl) {
          countdownEl.style.display = "none";
        }
      }, 1000);
    }
  }, 1000);
}

/* Button event listeners */
// TODO: Move this up top?

trainBodyButton = document.getElementById(
  "trainBodyButton"
) as HTMLButtonElement | null;
trainBodyButton?.addEventListener("click", trainBody);

danceButton = document.getElementById(
  "danceButton"
) as HTMLButtonElement | null;
danceButton?.addEventListener("click", dance);

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
    startCountdown(Math.ceil(trainingDuration / 1000));

    setTimeout(() => {
      mlMode = MLMode.IDLE;

      if (trainBodyButton) {
        trainBodyButton.innerText = "RECORD PERSON 2";
        trainBodyButton.disabled = false;
      }

      console.log(`Person 1: Collected ${person1Poses.length} poses`);
      alert(
        `Person 1 recorded! ${person1Poses.length} poses. Click button again for Person 2.`
      );
    }, trainingDuration);
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
    startCountdown(Math.ceil(trainingDuration / 1000));

    setTimeout(async () => {
      // TODO: Can I make this a function, to not repeat myself twice?
      mlMode = MLMode.IDLE;
      recordingPhase = "idle";

      console.log(`Person 2: Collected ${person2Poses.length} poses`);

      if (person1Poses.length > 10 && person2Poses.length > 10) {
        // Align datasets to same length
        const minLen = Math.min(person1Poses.length, person2Poses.length);
        const trainingData: PoseDatum[] = [];

        for (let i = 0; i < minLen; i++) {
          trainingData.push({
            person1Pose: person1Poses[i],
            person2Pose: person2Poses[i],
          });
        }

        if (trainBodyButton) {
          trainBodyButton.innerText = "TRAINING MODEL...";
        }

        let result: any = await run(trainingData);
        myModel = result.model;
        myNormalizations = result.tensorData;

        if (trainBodyButton) {
          trainBodyButton.innerText = "RETRAIN MODEL";
          trainBodyButton.disabled = false;
        }

        alert(
          `Model trained with ${trainingData.length} pose pairs! Ready to dance.`
        );
      } else {
        if (trainBodyButton) {
          trainBodyButton.innerText = "RETRAIN MODEL";
          trainBodyButton.disabled = false;
        }
        alert("Not enough training data collected. Please try again.");
      }
    }, trainingDuration);
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

/* TensorFlow Training */

export async function run(
  data: PoseDatum[]
): Promise<{ model: any; tensorData: NormalizationData } | void> {
  // Load and plot the original input data that we are going to train on.
  //console.log("pose data:");
  //console.log(data);
  const values = data.flatMap((d: PoseDatum) =>
    d.person1Pose.map((p1, i) => ({
      x: p1,
      y: d.person2Pose[i],
    }))
  );
  // TF Example
  /* const values = data.map(d => ({
    x: d.horsepower,
    y: d.mpg,
  })); */

  tfvis.render.scatterplot(
    { name: "Training Data Sample" },
    { values },
    {
      xLabel: "Person 1 Pose",
      yLabel: "Person 2 Pose",
      height: 300,
    }
  );

  // Create the model
  const model = createModel();
  tfvis.show.modelSummary({ name: "Model Summary" }, model);

  // Convert the data to a form we can use for training.
  const tensorData = convertToTensor(data);
  const { inputs, labels } = tensorData;

  // Train the model
  await trainModel(model, inputs, labels);

  // Make some predictions using the model and compare them to the
  // original data
  testModel(model, data, tensorData);

  // Return the trained model and normalization data to callers.
  return { model, tensorData };
}

// Define model architecture
// Updated model: 66D input → 66D output
function createModel() {
  // Create a small MLP with a mix of linear and ReLU layers.
  // Input: single scalar (hand X). Output: single scalar (predicted mouse Y).
  const model = tf.sequential();

  // Input: 66D pose (33 landmarks × 2)
  // First hidden layer: expand to a richer representation and apply non-linearity
  model.add(
    tf.layers.dense({
      inputShape: [66],
      units: 128,
      activation: "relu",
      useBias: true,
    })
  );

  // Add more model layers to increase accuracy

  // Second hidden layer: narrower representation
  model.add(tf.layers.dense({ units: 64, activation: "relu", useBias: true }));

  // Third hidden layer: smaller feature set
  model.add(tf.layers.dense({ units: 32, activation: "relu", useBias: true }));

  // Final output layer: linear activation for regression
  // Output: 66D predicted pose
  // TODO: Is it a problem that units go from 32 to 66?
  model.add(
    tf.layers.dense({ units: 66, activation: "linear", useBias: true })
  );

  return model;
}

/**
 * Convert the input data to tensors that we can use for machine
 * learning. We will also do the important best practices of _shuffling_
 * the data and _normalizing_ the data
 * MPG on the y-axis.
 */
function convertToTensor(data: PoseDatum[]): NormalizationData {
  // Wrapping these calculations in a tidy will dispose any
  // intermediate tensors.
  return tf.tidy(() => {
    // Step 1. Shuffle the data
    tf.util.shuffle(data);

    // Step 2. Convert data to Tensor
    const inputs = data.map((d: PoseDatum) => d.person1Pose);
    const labels = data.map((d: PoseDatum) => d.person2Pose);

    const inputTensor = tf.tensor2d(inputs, [inputs.length, 66]);
    const labelTensor = tf.tensor2d(labels, [labels.length, 66]);

    // Step 3. Normalize the data to the range 0 - 1 using min-max scaling
    const inputMax = inputTensor.max();
    const inputMin = inputTensor.min();
    const labelMax = labelTensor.max();
    const labelMin = labelTensor.min();

    const normalizedInputs = inputTensor
      .sub(inputMin)
      .div(inputMax.sub(inputMin));
    const normalizedLabels = labelTensor
      .sub(labelMin)
      .div(labelMax.sub(labelMin));

    return {
      inputs: normalizedInputs,
      labels: normalizedLabels,
      // Return the min/max bounds so we can use them later.
      inputMax,
      inputMin,
      labelMax,
      labelMin,
    };
  });
}

async function trainModel(model: any, inputs: any, labels: any) {
  // Prepare the model for training.
  model.compile({
    optimizer: tf.train.adam(),
    // adam optimizer as it is quite effective in practice and requires no configuration.
    loss: tf.losses.meanSquaredError,
    // this is a function that will tell the model how well it is doing on learning
    // each of the batches (data subsets) that it is shown. Here we use
    // meanSquaredError to compare the predictions made by the model with the true values.
    metrics: ["mse"],
  });

  const batchSize = 32;
  const epochs = 50;

  return await model.fit(inputs, labels, {
    batchSize,
    // size of the data subsets that the model will see on each iteration of training.
    // Common batch sizes tend to be in the range 32-512
    epochs,
    // number of times the model is going to look at the entire dataset that you provide it
    shuffle: true,
    callbacks: tfvis.show.fitCallbacks(
      { name: "Training Performance" },
      ["loss", "mse"],
      { height: 200, callbacks: ["onEpochEnd"] }
    ),
  });
}

function testModel(
  model: any,
  inputData: PoseDatum[],
  normalizationData: NormalizationData
) {
  const { inputMax, inputMin, labelMin, labelMax } = normalizationData;

  // Generate predictions for a uniform range of numbers between 0 and 1;
  // We un-normalize the data by doing the inverse of the min-max scaling
  // that we did earlier.
  const [xs, preds] = tf.tidy(() => {
    // TODO: We don't use xs anymore

    // Test on first 10 training samples
    const testInputs = inputData.slice(0, 10).map((d) => d.person1Pose);
    const inputTensor = tf.tensor2d(testInputs, [testInputs.length, 66]);

    const normalized = inputTensor.sub(inputMin).div(inputMax.sub(inputMin));
    const predictions = model.predict(normalized);
    // The tf.reshape() function is used to reshape a given tensor with the specified shape.

    const unNormPreds = predictions.mul(labelMax.sub(labelMin)).add(labelMin);

    // Un-normalize the data
    return [inputTensor.dataSync(), unNormPreds.dataSync()];
  });

  console.log(
    "Test predictions generated:",
    Array.from(preds as number[]).slice(0, 10)
  );
}

// Predict full 66D pose from input pose
// Normalize a single pose, run predict, un-normalize and return array of output pose
function predictPose(
  model: any,
  inputPose: number[], // 66D
  normalizationData: NormalizationData
): number[] {
  const { inputMax, inputMin, labelMin, labelMax } = normalizationData;

  return tf.tidy(() => {
    // create a normalized tensor for the single input
    const inputTensor = tf.tensor2d([inputPose], [1, 66]);
    const normalized = inputTensor.sub(inputMin).div(inputMax.sub(inputMin));
    // predict (returns a Tensor)
    const pred = model.predict(normalized) as any;
    // un-normalize prediction
    const unNorm = pred.mul(labelMax.sub(labelMin)).add(labelMin) as any;
    // read single pose (array) value
    return Array.from(unNorm.dataSync()) as number[];
  });
}
