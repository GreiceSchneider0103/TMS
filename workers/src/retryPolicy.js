export function computeBackoffMs(attempt) {
  const base = Math.min(60000, (2 ** attempt) * 1000);
  const jitter = Math.floor(Math.random() * 500);
  return base + jitter;
}

export function isDeadLetter(attempt) {
  return attempt >= 8;
}
