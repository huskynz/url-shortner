// Store rate limit data in memory
const rateLimits = new Map();

// Clean up old rate limit data periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of rateLimits.entries()) {
    if (now - data.lastCleanup > 3600000) { // Clean up entries older than 1 hour
      rateLimits.delete(key);
    }
  }
}, 3600000); // Run cleanup every hour

export function checkRateLimit(key, limit = 100, windowMs = 60000) {
  const now = Date.now();
  
  // Get or create rate limit entry
  let entry = rateLimits.get(key);
  if (!entry) {
    entry = {
      requests: [],
      lastCleanup: now
    };
    rateLimits.set(key, entry);
  }
  
  // Remove requests outside the current window
  const windowStart = now - windowMs;
  entry.requests = entry.requests.filter(timestamp => timestamp > windowStart);
  
  // Check if limit is exceeded
  if (entry.requests.length >= limit) {
    console.warn(`Rate limit exceeded for key: ${key.substring(0, 8)}... (${entry.requests.length} requests)`);
    return false;
  }
  
  // Add new request
  entry.requests.push(now);
  
  // Update cleanup timestamp
  entry.lastCleanup = now;
  
  return true;
}

export function getRateLimitInfo(key, limit = 100, windowMs = 60000) {
  const now = Date.now();
  const entry = rateLimits.get(key);
  
  if (!entry) {
    return {
      remaining: limit,
      total: limit,
      reset: now + windowMs
    };
  }
  
  const windowStart = now - windowMs;
  const requests = entry.requests.filter(timestamp => timestamp > windowStart);
  
  return {
    remaining: Math.max(0, limit - requests.length),
    total: limit,
    reset: requests.length > 0 ? requests[0] + windowMs : now + windowMs
  };
} 