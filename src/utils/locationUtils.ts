/**
 * Haversine formula for calculating distance between two geographic coordinates.
 * Returns distance in meters, or null for invalid coordinates.
 */
export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number | null => {
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lon1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lon2) ||
    lat1 < -90 ||
    lat1 > 90 ||
    lat2 < -90 ||
    lat2 > 90 ||
    lon1 < -180 ||
    lon1 > 180 ||
    lon2 < -180 ||
    lon2 > 180
  ) {
    return null;
  }

  const R = 6371000;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;

  let deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  if (deltaLambda > Math.PI) deltaLambda -= 2 * Math.PI;
  if (deltaLambda < -Math.PI) deltaLambda += 2 * Math.PI;

  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const result = R * c;

  return Number.isFinite(result) ? result : null;
};

export const getEstimatedTimeToTarget = (
  distance: number,
  avgVelocity: number
): number => {
  if (!Number.isFinite(distance) || !Number.isFinite(avgVelocity)) return Infinity;
  if (distance < 0 || avgVelocity <= 0) return Infinity;
  return distance / avgVelocity;
};

/**
 * Decide whether a GPS reading should trigger the alarm.
 * With a normal accuracy reading, use the configured threshold directly.
 * When the accuracy radius is at least as large as the threshold, allow a
 * bounded tolerance so a noisy fix does not cause the user to miss the alert.
 */
export const shouldTriggerFromGPS = (
  distanceToTarget: number | null | undefined,
  thresholdDistance: number,
  accuracyMeters?: number | null
): boolean => {
  if (
    distanceToTarget === null ||
    distanceToTarget === undefined ||
    !Number.isFinite(distanceToTarget) ||
    !Number.isFinite(thresholdDistance) ||
    thresholdDistance <= 0
  ) {
    return false;
  }

  const accuracy = Number.isFinite(accuracyMeters)
    ? Math.max(0, Number(accuracyMeters))
    : 0;

  if (distanceToTarget <= thresholdDistance) return true;

  // If the reported uncertainty is very large, allow a bounded extension.
  // This is deliberately capped by 75% of the reported accuracy rather than
  // treating the entire accuracy radius as proof of proximity.
  return accuracy >= thresholdDistance
    ? distanceToTarget <= thresholdDistance + accuracy * 0.75
    : false;
};

export const calculateAverageVelocity = (
  locationSamples: Array<{
    lat: number;
    lon: number;
    timestamp: number;
  }>
): number => {
  if (!locationSamples || locationSamples.length < 2) return 0;

  let totalDistance = 0;
  let totalTime = 0;

  for (let i = 1; i < locationSamples.length; i++) {
    const previous = locationSamples[i - 1];
    const current = locationSamples[i];

    if (
      !previous ||
      !current ||
      !Number.isFinite(previous.lat) ||
      !Number.isFinite(previous.lon) ||
      !Number.isFinite(current.lat) ||
      !Number.isFinite(current.lon) ||
      !Number.isFinite(previous.timestamp) ||
      !Number.isFinite(current.timestamp)
    ) {
      continue;
    }

    const distance = calculateDistance(
      previous.lat,
      previous.lon,
      current.lat,
      current.lon
    );
    if (distance === null) continue;

    const timeDiff = (current.timestamp - previous.timestamp) / 1000;
    if (timeDiff <= 0) continue;

    totalDistance += distance;
    totalTime += timeDiff;
  }

  return totalTime > 0 ? totalDistance / totalTime : 0;
};
