// Re-export the runtime globals used by the demo as explicit imports.
// These globals are normally injected by the MediaPipe demo scripts loaded
// via CDN. We re-export them from a local module so the main code can import
// them explicitly while retaining runtime semantics.

export const controls: any = (window as any).controls;
export const mpHolistic: any =
  (window as any).mpHolistic || (window as any).holistic || (window as any);
export const drawingUtils: any = (window as any).drawingUtils;

// Note: these are typed as `any` intentionally because the demo attaches a
// runtime global object via a script tag. If you later install the
// `@mediapipe/holistic`, `@mediapipe/control_utils`, and
// `@mediapipe/drawing_utils` npm packages, we can replace these with proper
// imports and stronger types.
