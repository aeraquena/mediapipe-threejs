// TODO: Clamp
export function scaleValue(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
) {
  // Calculate the position of the value within the input range (0 to 1)
  const normalizedValue = (value - inMin) / (inMax - inMin);

  // Scale this normalized value to the output range
  const scaledValue = normalizedValue * (outMax - outMin) + outMin;

  return scaledValue;
}

// calculate the angle formed by 3 points with x, y positions
export function calculateAngle(
  point1: { x: number; y: number },
  point2: { x: number; y: number }, // This is the vertex of the angle
  point3: { x: number; y: number }
): number {
  // Calculate vectors from point2 (vertex) to point1 and point3
  const vector1 = {
    x: point1.x - point2.x,
    y: point1.y - point2.y,
  };

  const vector2 = {
    x: point3.x - point2.x,
    y: point3.y - point2.y,
  };

  // Calculate dot product
  const dotProduct = vector1.x * vector2.x + vector1.y * vector2.y;

  // Calculate magnitudes
  const magnitude1 = Math.sqrt(vector1.x * vector1.x + vector1.y * vector1.y);
  const magnitude2 = Math.sqrt(vector2.x * vector2.x + vector2.y * vector2.y);

  // Calculate angle in radians
  const angleRadians = Math.acos(dotProduct / (magnitude1 * magnitude2));

  // Convert to degrees (optional)
  const angleDegrees = angleRadians * (180 / Math.PI);

  return angleDegrees; // or return angleRadians if you prefer radians
}
