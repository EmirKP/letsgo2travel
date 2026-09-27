/** A timed-out dependency must not continue to the next paid or mutating step. */
export function boundedWait<T>(work: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => reject(new Error("dependency-timeout"));
    // Attach rejection handling even when the caller's signal already expired.
    // The work may already be running and reject after this wrapper returns.
    Promise.resolve(work).then(
      value => { signal.removeEventListener("abort", aborted); resolve(value); },
      error => { signal.removeEventListener("abort", aborted); reject(error); },
    );
    if (signal.aborted) aborted();
    else signal.addEventListener("abort", aborted, { once: true });
  });
}
