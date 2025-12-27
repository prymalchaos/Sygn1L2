export function debounce(fn, waitMs = 500) {
  let t = null;
  let lastArgs = null;

  return (...args) => {
    lastArgs = args;
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      fn(...(lastArgs || []));
      lastArgs = null;
    }, waitMs);
  };
}