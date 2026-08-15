/**
 * Haversine formula for calculating distance between two geographic coordinates.
 * Returns distance in meters.
 * 
 * ⚠️ SECURITY: Validates all inputs to prevent NaN/Infinity results
 */
export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  // Input validation - prevent NaN, Infinity, and out-of-range coordinates
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lon1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lon2)
  ) {
    // Return 0 for invalid inputs (safer than throwing in background task)
    return 0;
  }

  // Validate latitude range [-90, 90]
  if (lat1 < -90 || lat1 > 90 || lat2 < -90 || lat2 > 90) {
    return 0;
  }

  // Validate longitude range [-180, 180]
  if (lon1 < -180 || lon1 > 180 || lon2 < -180 || lon2 > 180) {
    return 0;
  }

  const R = 6371000; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  
  // Handle International Date Line: take shortest path
  let Δλ = ((lon2 - lon1) * Math.PI) / 180;
  if (Δλ > Math.PI) {
    Δλ = Δλ - 2 * Math.PI;
  } else if (Δλ < -Math.PI) {
    Δλ = Δλ + 2 * Math.PI;
  }

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const result = R * c;
  
  // Final validation: result should be finite
  return Number.isFinite(result) ? result : 0;
};

/**
 * Get estimated time to target based on average velocity and distance.
 * Velocity should be in m/s, distance in meters.
 * Returns estimated time in seconds.
 * 
 * ⚠️ SECURITY: Returns Infinity safely when velocity is zero/negative
 */
export const getEstimatedTimeToTarget = (
  distance: number,
  avgVelocity: number
): number => {
  // Prevent division by zero and invalid inputs
  if (!Number.isFinite(distance) || !Number.isFinite(avgVelocity)) {
    return Infinity;
  }

  if (distance < 0 || avgVelocity <= 0) {
    return Infinity;
  }

  return distance / avgVelocity;
};

/**
 * Calculate average velocity from previous location samples.
 * Returns velocity in m/s.
 * 
 * ⚠️ SECURITY: Handles backward timestamps, zero intervals, and invalid samples
 */
export const calculateAverageVelocity = (
  locationSamples: Array<{
    lat: number;
    lon: number;
    timestamp: number;
  }>
): number => {
  if (!locationSamples || locationSamples.length < 2) {
    return 0;
  }

  let totalDistance = 0;
  let totalTime = 0;

  for (let i = 1; i < locationSamples.length; i++) {
    // Validate both samples
    const prevSample = locationSamples[i - 1];
    const currentSample = locationSamples[i];

    if (
      !prevSample ||
      !currentSample ||
      !Number.isFinite(prevSample.lat) ||
      !Number.isFinite(prevSample.lon) ||
      !Number.isFinite(currentSample.lat) ||
      !Number.isFinite(currentSample.lon) ||
      !Number.isFinite(prevSample.timestamp) ||
      !Number.isFinite(currentSample.timestamp)
    ) {
      continue; // Skip invalid samples
    }

    const distance = calculateDistance(
      prevSample.lat,
      prevSample.lon,
      currentSample.lat,
      currentSample.lon
    );

    // Time difference: skip if backward (timestamp went backwards)
    const timeDiff = (currentSample.timestamp - prevSample.timestamp) / 1000; // Convert to seconds
    
    if (timeDiff <= 0) {
      continue; // Skip if time went backward or no time elapsed
    }

    totalDistance += distance;
    totalTime += timeDiff;
  }

  // Return 0 if no valid samples, prevent 0/0 = NaN
  return totalTime > 0 && totalDistance >= 0
    ? totalDistance / totalTime
    : 0;
};
