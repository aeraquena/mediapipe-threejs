// Helper: 2D Euclidean distance for normalized coordinates (x,y in 0..1)
export default function distance2D(
  a: { x: number; y: number } | undefined | null,
  b: { x: number; y: number } | undefined | null
): number | null {
  if (!a || !b) return null;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}
