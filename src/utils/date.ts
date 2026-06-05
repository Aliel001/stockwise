/**
 * Safely parses any Firestore Timestamp, ISO string, Date, or number into a standard JavaScript Date object.
 * Guaranteed to never throw "Invalid time value" errors by falling back to the current date.
 */
export function safeGetDate(timestamp: any): Date {
  if (!timestamp) {
    return new Date();
  }

  // 1. If it has a toDate method (Firestore Timestamp)
  if (typeof timestamp.toDate === 'function') {
    return timestamp.toDate();
  }

  // 2. If it is an object with seconds and nanoseconds
  if (timestamp && typeof timestamp.seconds === 'number') {
    return new Date(timestamp.seconds * 1000);
  }

  // 3. If it is already a Date object
  if (timestamp instanceof Date) {
    return isNaN(timestamp.getTime()) ? new Date() : timestamp;
  }

  // 4. Try parsing as a generic string or number
  const parsed = new Date(timestamp);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  // Fallback
  return new Date();
}

/**
 * Parses and formats any timestamp securely to its ISO string format (or splits it/slices it safely).
 */
export function safeGetISOString(timestamp: any): string {
  try {
    return safeGetDate(timestamp).toISOString();
  } catch (error) {
    return new Date().toISOString();
  }
}
