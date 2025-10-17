let countdownEl: HTMLDivElement | null = null;

// Displays and starts countdown
export function startCountdown(seconds: number): void {
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
