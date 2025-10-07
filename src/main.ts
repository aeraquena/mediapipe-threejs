import * as THREE from "three";
import { PoseLandmarker, DrawingUtils } from "@mediapipe/tasks-vision";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import distance2D from "./utils/distance";
import * as threeHelper from "./utils/threeHelper";
import * as mediaPipeHelper from "./utils/mediaPipeHelper";
//import * as tensorflow from "./tensorflow";

// TensorFlow.js and tfjs-vis are loaded as globals in the demo environment.
// Declare them here so TypeScript knows their names (we keep them `any`
// because we don't want to add a heavy dependency on @types/tfjs).
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

// Training datum may contain different named fields depending on where it was
// collected; keep fields optional so existing logic remains unchanged.
type TrainingDatum = {
  handX?: number;
  handY?: number;
  mouseX?: number;
  mouseY?: number;
};

let trainingData: TrainingDatum[] = [];
let mlMode = MLMode.IDLE;
// TODO: Modes: Idle, Training, and Predicting
let trainingDuration = 10000;

let myModel: any;
let myNormalizations: any;

// The trained model and tensor metadata are returned from `run()` and
// stored by callers when needed — no top-level `model`/`tfData` required.

// Real mouse movements
let clientX: number;
let clientY: number;

let predictedMouseY: number;

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
      if (mlMode === MLMode.TRAINING && result.landmarks[0]) {
        trainingData.push({
          handX: result.landmarks[0][19].x, // X position of LEFT index finger on hand. TODO: Can add more
          mouseY: clientY, // TODO: Rename this
          //mouseY: clientY,
        });
      } else if (mlMode === MLMode.PREDICTING) {
        predictedMouseY = predictOne(
          myModel,
          result.landmarks[0] ? result.landmarks[0][19].x : 0, // is this normalized?
          myNormalizations
        );
        console.log(
          "x: ",
          result.landmarks[0] ? result.landmarks[0][19].x : 0,
          "y:",
          predictedMouseY
        );
        // lets let it DANCE
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

// Train body button
danceButton = document.getElementById(
  "danceButton"
) as HTMLButtonElement | null;
danceButton?.addEventListener("click", dance);

function trainBody() {
  mlMode = MLMode.TRAINING;
  trainingData = [];
  if (trainBodyButton) {
    trainBodyButton.innerText = "TRAINING AI...";
  }
  // start a countdown that matches trainingDuration (in ms)
  startCountdown(Math.ceil(trainingDuration / 1000));

  setTimeout(async () => {
    mlMode = MLMode.IDLE;
    if (trainBodyButton) {
      trainBodyButton.innerText = "TRAIN AI";
    }
    console.log(trainingData);
    let result: any = await run(trainingData);
    console.log(result);
    // when this is finished... can we switch to predicting mode?

    // WE NEED TO AWAIT THIS... its not gonna be there
    // alternatively... pass it in...we have it... {model: x, tensorData: x}

    myModel = result.model;
    myNormalizations = result.tensorData;

    //predictedMouseY = predictOne(result.model, 0.5, result.tensorData);
    //console.log("predicted y for hand x .5: ", predictedMouseY); // YAS QUEEN
  }, trainingDuration);
}

function dance() {
  console.log("dance!");
  mlMode = MLMode.PREDICTING;
  setInterval(movePointerY, 5);
}

// Mouse
document.addEventListener("mousemove", function (event) {
  // Get mouse position relative to the viewport
  clientX = event.clientX;
  clientY = event.clientY;

  const pointer = document.getElementById("pointer");
  if (pointer) {
    if (mlMode !== MLMode.PREDICTING) {
      // TODO: AND, model predictions are NOT running
      // if mlMode === Predicting, do the predicted one
      pointer.style.top = clientY.toString() + "px";
    } /* else {
      pointer.style.top = predictedMouseY.toString() + "px";
      // it seems to be constrainted to 1 point
      // set a glooobal variable for where y should be
    }*/
    pointer.style.left = clientX.toString() + "px";
  }
});

function movePointerY() {
  const pointer = document.getElementById("pointer");
  if (pointer && mlMode === MLMode.PREDICTING) {
    pointer.style.top = predictedMouseY.toString() + "px";
  }
}

/* Tensorflow */

export async function run(
  data: TrainingDatum[]
): Promise<{ model: any; tensorData: NormalizationData } | void> {
  // Load and plot the original input data that we are going to train on.
  //const data = await getData();
  const values = data.map((d: TrainingDatum) => ({
    x: d.handX,
    y: d.mouseY,
  }));

  tfvis.render.scatterplot(
    { name: "Hand X vs Mouse Y" },
    { values },
    {
      xLabel: "Hand X",
      yLabel: "Mouse Y",
      height: 300,
    }
  );

  // Modify this... run() should take in the body/mouse data

  // More code will be added below
  // Create the model
  const model = createModel();
  tfvis.show.modelSummary({ name: "Model Summary" }, model);

  // Convert the data to a form we can use for training.
  const tensorData = convertToTensor(data);
  const { inputs, labels } = tensorData;

  console.log("tensor data");
  console.log(tensorData);

  // Train the model
  await trainModel(model, inputs, labels);
  console.log("Done Training");

  // Make some predictions using the model and compare them to the
  // original data
  testModel(model, data, tensorData);

  // Return the trained model and normalization data to callers.
  return { model, tensorData };
}

// Define model architecture
function createModel() {
  // Create a sequential model
  const model = tf.sequential();

  // Add a single input layer
  model.add(tf.layers.dense({ inputShape: [1], units: 1, useBias: true }));

  // Add an output layer
  model.add(tf.layers.dense({ units: 1, useBias: true }));

  return model;
}

/**
 * Convert the input data to tensors that we can use for machine
 * learning. We will also do the important best practices of _shuffling_
 * the data and _normalizing_ the data
 * MPG on the y-axis.
 */
function convertToTensor(data: TrainingDatum[]): NormalizationData {
  // Wrapping these calculations in a tidy will dispose any
  // intermediate tensors.

  return tf.tidy(() => {
    // Step 1. Shuffle the data
    tf.util.shuffle(data);

    // Step 2. Convert data to Tensor
    const inputs = data.map((d: TrainingDatum) => d.handX ?? 0);
    const labels = data.map((d: TrainingDatum) => d.mouseY ?? 0);

    const inputTensor = tf.tensor2d(inputs, [inputs.length, 1]);
    const labelTensor = tf.tensor2d(labels, [labels.length, 1]);

    //Step 3. Normalize the data to the range 0 - 1 using min-max scaling
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
  inputData: TrainingDatum[],
  normalizationData: NormalizationData
) {
  const { inputMax, inputMin, labelMin, labelMax } = normalizationData;

  // Generate predictions for a uniform range of numbers between 0 and 1;
  // We un-normalize the data by doing the inverse of the min-max scaling
  // that we did earlier.
  const [xs, preds] = tf.tidy(() => {
    const xsNorm = tf.linspace(0, 1, 100); // this is a tensor, 100 random values between 0 and 1
    //console.log("xsNorm");
    //console.log(xsNorm);
    const predictions = model.predict(xsNorm.reshape([100, 1]));
    // The tf.reshape() function is used to reshape a given tensor with the specified shape.
    // We need an input tensor. How do we make a tensor from number
    //console.log("predictions");
    //console.log(predictions);

    const unNormXs = xsNorm.mul(inputMax.sub(inputMin)).add(inputMin);

    const unNormPreds = predictions.mul(labelMax.sub(labelMin)).add(labelMin);

    // Un-normalize the data
    return [unNormXs.dataSync(), unNormPreds.dataSync()];
  });

  const xsArr = Array.from(xs as number[]);
  const predsArr = Array.from(preds as number[]);
  const predictedPoints = xsArr.map((val: number, i: number) => {
    return { x: val, y: predsArr[i] };
  });
  //console.log("predicted points: ");
  //console.log(predictedPoints);

  const originalPoints = inputData.map((d: TrainingDatum) => ({
    x: d.handX,
    y: d.mouseY,
  }));

  tfvis.render.scatterplot(
    { name: "Model Predictions vs Original Data" },
    {
      values: [originalPoints, predictedPoints],
      series: ["original", "predicted"],
    },
    {
      xLabel: "Hand X",
      yLabel: "Mouse Y",
      height: 300,
    }
  );
}

// This was vibe coded
// Normalize a single handX, run predict, un-normalize and return number
function predictOne(model, handX, normalizationData) {
  const { inputMax, inputMin, labelMin, labelMax } = normalizationData;

  return tf.tidy(() => {
    // create a normalized tensor for the single input
    const x = tf
      .scalar(handX)
      .sub(inputMin)
      .div(inputMax.sub(inputMin))
      .reshape([1, 1]);
    // predict (returns a Tensor)
    const pred = model.predict(x);
    // un-normalize prediction
    const unNorm = pred.mul(labelMax.sub(labelMin)).add(labelMin);
    // read single value
    return unNorm.dataSync()[0];
  });
}
