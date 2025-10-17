import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

declare const tf: any;

// Normalization / tensor metadata returned by convertToTensor
export type NormalizationData = {
  inputs: any;
  labels: any;
  inputMax: any;
  inputMin: any;
  labelMax: any;
  labelMin: any;
};

// Helper: Flatten 33 landmarks into 66D array [x0,y0,x1,y1,...,x32,y32]
export function flattenPose(landmarks: NormalizedLandmark[]): number[] {
  const pose: number[] = [];
  for (let i = 0; i < 33; i++) {
    pose.push(landmarks[i]?.x ?? 0);
    pose.push(landmarks[i]?.y ?? 0);
  }
  return pose;
}

// Define model architecture
// Updated model: 66D input → 66D output
export function createModel() {
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
  model.add(
    tf.layers.dense({ units: 66, activation: "linear", useBias: true })
  );

  return model;
}

export function renderScatterplot(
  tfvis: any,
  values: { x: number; y: number }[]
) {
  tfvis.render.scatterplot(
    { name: "Training Data Sample" },
    { values },
    {
      xLabel: "Person 1 Pose",
      yLabel: "Person 2 Pose",
      height: 300,
    }
  );
}

// Predict full 66D pose from input pose
// Normalize a single pose, run predict, un-normalize and return array of output pose
export function predictPose(
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
