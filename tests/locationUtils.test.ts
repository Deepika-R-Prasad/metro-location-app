import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateDistance,
  calculateAverageVelocity,
  getEstimatedTimeToTarget,
  shouldTriggerFromGPS,
} from '../src/utils/locationUtils';

test('calculateDistance returns a sensible value for nearby coordinates', () => {
  const distance = calculateDistance(12.9716, 77.5946, 12.9720, 77.5946);
  assert.ok(distance !== null);
  assert.ok(distance !== undefined);
  assert.ok(distance! > 0);
  assert.ok(distance! < 1000);
});

test('calculateDistance rejects invalid coordinates', () => {
  assert.equal(calculateDistance(Number.NaN, 0, 0, 0), null);
  assert.equal(calculateDistance(91, 0, 0, 0), null);
  assert.equal(calculateDistance(0, 181, 0, 0), null);
});

test('calculateDistance handles date-line crossing', () => {
  const distanceEast = calculateDistance(0, 179, 0, -179);
  const distanceWest = calculateDistance(0, -179, 0, 179);
  assert.ok(distanceEast !== null);
  assert.ok(distanceWest !== null);
  assert.ok(distanceEast! > 0);
  assert.ok(distanceWest! > 0);
  assert.ok(Math.abs(distanceEast! - distanceWest!) < 1);
});

test('calculateAverageVelocity ignores invalid or stale samples', () => {
  const velocity = calculateAverageVelocity([
    { lat: 0, lon: 0, timestamp: 1000 },
    { lat: 0, lon: 0.001, timestamp: 2000 },
    { lat: 0, lon: 0.001, timestamp: 1000 },
    { lat: Number.NaN, lon: 0, timestamp: 3000 },
  ]);

  assert.ok(Number.isFinite(velocity));
  assert.ok(velocity >= 0);
});

test('getEstimatedTimeToTarget handles zero and invalid cases safely', () => {
  assert.equal(getEstimatedTimeToTarget(0, 0), Infinity);
  assert.equal(getEstimatedTimeToTarget(-10, 5), Infinity);
  assert.equal(getEstimatedTimeToTarget(150, Number.NaN), Infinity);
});

test('shouldTriggerFromGPS uses accuracy conservatively', () => {
  assert.equal(shouldTriggerFromGPS(10, 50, 20), true);
  assert.equal(shouldTriggerFromGPS(60, 50, 20), false);
  assert.equal(shouldTriggerFromGPS(100, 25, 100), true);
  assert.equal(shouldTriggerFromGPS(null as unknown as number, 50, 20), false);
});
