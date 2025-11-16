import { VectorClock } from '@emrtask/shared/types/common.types';

/**
 * Constants for vector clock operations
 * @version 1.0.0
 */
const VECTOR_CLOCK = {
  INITIAL_COUNTER: 0,
  COMPARISON: {
    BEFORE: -1,
    CONCURRENT: 0,
    AFTER: 1
  },
  MAX_AGE_MS: 3600000, // 1 hour
  NODE_ID_REGEX: /^[a-zA-Z0-9-_]{1,64}$/ // Validates nodeId format
} as const;

/**
 * Creates a new vector clock with microsecond precision timestamp
 * @param nodeId - Unique identifier for the node
 * @returns A new vector clock instance
 * @throws Error if nodeId is invalid
 */
export function createVectorClock(nodeId: string): VectorClock {
  if (!VECTOR_CLOCK.NODE_ID_REGEX.test(nodeId)) {
    throw new Error('Invalid nodeId format');
  }

  return {
    nodeId,
    counter: VECTOR_CLOCK.INITIAL_COUNTER,
    timestamp: process.hrtime.bigint(), // Microsecond precision
    causalDependencies: new Map<string, number>(),
    mergeOperation: 'LAST_WRITE_WINS'
  };
}

/**
 * Performs atomic increment of vector clock counter
 * @param vectorClock - Vector clock to increment
 * @returns New vector clock with incremented counter
 * @throws Error if vector clock is invalid
 */
export function incrementVectorClock(vectorClock: VectorClock): VectorClock {
  validateVectorClock(vectorClock);

  return {
    ...vectorClock,
    counter: vectorClock.counter + 1,
    timestamp: process.hrtime.bigint(),
    causalDependencies: new Map(vectorClock.causalDependencies)
  };
}

/**
 * Compares two vector clocks to determine their causal relationship
 * @param clockA - First vector clock
 * @param clockB - Second vector clock
 * @returns -1 if clockA < clockB, 0 if concurrent, 1 if clockA > clockB
 * @throws Error if either clock is invalid
 */
export function compareVectorClocks(clockA: VectorClock, clockB: VectorClock): number {
  validateVectorClock(clockA);
  validateVectorClock(clockB);

  // Check direct counter comparison
  if (clockA.counter < clockB.counter) return VECTOR_CLOCK.COMPARISON.BEFORE;
  if (clockA.counter > clockB.counter) return VECTOR_CLOCK.COMPARISON.AFTER;

  // Check causal dependencies
  const aGreater = hasCausalDependency(clockA, clockB);
  const bGreater = hasCausalDependency(clockB, clockA);

  if (aGreater && !bGreater) return VECTOR_CLOCK.COMPARISON.AFTER;
  if (!aGreater && bGreater) return VECTOR_CLOCK.COMPARISON.BEFORE;

  // Check timestamps for concurrent operations
  if (clockA.timestamp < clockB.timestamp) return VECTOR_CLOCK.COMPARISON.BEFORE;
  if (clockA.timestamp > clockB.timestamp) return VECTOR_CLOCK.COMPARISON.AFTER;

  return VECTOR_CLOCK.COMPARISON.CONCURRENT;
}

/**
 * Merges multiple vector clocks with conflict resolution
 * @param vectorClocks - Array of vector clocks to merge
 * @returns Merged vector clock
 * @throws Error if input array is invalid
 */
export function mergeVectorClocks(vectorClocks: VectorClock[]): VectorClock {
  if (!Array.isArray(vectorClocks) || vectorClocks.length === 0) {
    throw new Error('Invalid vector clocks array');
  }

  vectorClocks.forEach(validateVectorClock);

  // Find the highest counter and latest timestamp
  const maxCounter = Math.max(...vectorClocks.map(vc => vc.counter));
  const latestTimestamp = vectorClocks.reduce((max, vc) => 
    vc.timestamp > max ? vc.timestamp : max, vectorClocks[0].timestamp);

  // Merge causal dependencies
  const mergedDependencies = new Map<string, number>();
  vectorClocks.forEach(vc => {
    vc.causalDependencies.forEach((count, node) => {
      const existing = mergedDependencies.get(node) || 0;
      mergedDependencies.set(node, Math.max(count, existing));
    });
  });

  // Create merged vector clock
  return {
    nodeId: vectorClocks[0].nodeId,
    counter: maxCounter,
    timestamp: latestTimestamp,
    causalDependencies: mergedDependencies,
    mergeOperation: 'LAST_WRITE_WINS'
  };
}

/**
 * Validates vector clock structure and values
 * @param vectorClock - Vector clock to validate
 * @throws Error if vector clock is invalid
 */
function validateVectorClock(vectorClock: VectorClock): void {
  if (!vectorClock || typeof vectorClock !== 'object') {
    throw new Error('Invalid vector clock object');
  }

  if (!VECTOR_CLOCK.NODE_ID_REGEX.test(vectorClock.nodeId)) {
    throw new Error('Invalid nodeId in vector clock');
  }

  if (typeof vectorClock.counter !== 'number' || vectorClock.counter < 0) {
    throw new Error('Invalid counter in vector clock');
  }

  if (typeof vectorClock.timestamp !== 'bigint') {
    throw new Error('Invalid timestamp in vector clock');
  }

  if (!(vectorClock.causalDependencies instanceof Map)) {
    throw new Error('Invalid causal dependencies in vector clock');
  }

  const age = Number(process.hrtime.bigint() - vectorClock.timestamp);
  if (age > VECTOR_CLOCK.MAX_AGE_MS * 1000000) { // Convert ms to ns
    throw new Error('Vector clock has expired');
  }
}

/**
 * Checks if one vector clock has causal dependency on another
 * @param clockA - First vector clock
 * @param clockB - Second vector clock
 * @returns True if clockA has causal dependency on clockB
 */
function hasCausalDependency(clockA: VectorClock, clockB: VectorClock): boolean {
  const bCount = clockA.causalDependencies.get(clockB.nodeId) || 0;
  return bCount >= clockB.counter;
}