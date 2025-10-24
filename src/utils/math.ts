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
