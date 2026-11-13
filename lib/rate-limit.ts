type Bucket = { hits: number[]; };

const buckets = new Map<string, Bucket>();

export function resetRateLimits(): void {
  buckets.clear();
}

/** Sliding window. In-memory, so it limits each server instance. */
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfter: number } {
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= limit) {
    const retryAfter = Math.max(1, Math.ceil((windowMs - (now - bucket.hits[0])) / 1000));
    buckets.set(key, bucket);
    return { ok: false, retryAfter };
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { ok: true, retryAfter: 0 };
}
