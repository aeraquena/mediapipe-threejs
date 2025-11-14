export default class NumberSmoother {
  private history: number[] = [];
  private windowSize: number;

  constructor(windowSize: number = 500) {
    this.windowSize = windowSize; // Higher = more smoothing
  }

  // Add new value and return smoothed result
  smooth(value: number): number {
    this.history.push(value);

    // Keep only the last N values
    if (this.history.length > this.windowSize) {
      this.history.shift();
    }

    // Return average of history
    const sum = this.history.reduce((acc, val) => acc + val, 0);
    return sum / this.history.length;
  }

  // Reset the history
  reset(): void {
    this.history = [];
  }

  // Change smoothing level on the fly
  setWindowSize(size: number): void {
    this.windowSize = size;
    // Trim history if new size is smaller
    if (this.history.length > size) {
      this.history = this.history.slice(-size);
    }
  }
}
