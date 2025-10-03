import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// Before we can use PoseLandmarker class we must wait for it to finish
// loading. Machine Learning models can be large and take a moment to
// get everything needed to run.
export const createPoseLandmarker = async (
  poseLandmarker: PoseLandmarker | undefined,
  runningMode: "IMAGE" | "VIDEO"
) => {
  const demosSection = document.getElementById("demos") as HTMLElement;

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
  return poseLandmarker;
};
