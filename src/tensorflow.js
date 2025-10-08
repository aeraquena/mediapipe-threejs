export async function run(data) {
  // Load and plot the original input data that we are going to train on.
  //const data = await getData();
  const values = data.map((d) => ({
    x: d.handY,
    y: d.mouseX,
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

  const yPred = predictOne(model, 0.5, tensorData);
  console.log("predicted y for hand x .5: ", yPred);
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
function convertToTensor(data) {
  // Wrapping these calculations in a tidy will dispose any
  // intermediate tensors.

  return tf.tidy(() => {
    // Step 1. Shuffle the data
    tf.util.shuffle(data);

    // Step 2. Convert data to Tensor
    const inputs = data.map((d) => d.handY);
    const labels = data.map((d) => d.mouseX);

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

async function trainModel(model, inputs, labels) {
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

function testModel(model, inputData, normalizationData) {
  const { inputMax, inputMin, labelMin, labelMax } = normalizationData;

  // Generate predictions for a uniform range of numbers between 0 and 1;
  // We un-normalize the data by doing the inverse of the min-max scaling
  // that we did earlier.
  const [xs, preds] = tf.tidy(() => {
    const xsNorm = tf.linspace(0, 1, 100); // this is a tensor, 100 random values between 0 and 1
    console.log("xsNorm");
    console.log(xsNorm);
    const predictions = model.predict(xsNorm.reshape([100, 1]));
    // The tf.reshape() function is used to reshape a given tensor with the specified shape.
    // We need an input tensor. How do we make a tensor from number
    console.log("predictions");
    console.log(predictions);

    const unNormXs = xsNorm.mul(inputMax.sub(inputMin)).add(inputMin);

    const unNormPreds = predictions.mul(labelMax.sub(labelMin)).add(labelMin);

    // Un-normalize the data
    return [unNormXs.dataSync(), unNormPreds.dataSync()];
  });

  const predictedPoints = Array.from(xs).map((val, i) => {
    return { x: val, y: preds[i] };
  });
  console.log("predicted points: ");
  console.log(predictedPoints);

  const originalPoints = inputData.map((d) => ({
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
