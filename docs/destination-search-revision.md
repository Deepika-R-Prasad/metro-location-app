# WakeMeThere — Destination Search Revision

## Decision

Use the existing `expo-location` native geocoder for destination search. Do not add Google Maps/Places APIs, a backend, map tiles, or a public Nominatim autocomplete client.

Flow:

`place name -> native geocoder -> selected latitude/longitude -> local alarm tracking`

Once a destination is selected, the tracking/alarm path remains independent of maps and does not require network connectivity.

## UX

- Search starts after 3+ characters.
- Requests are debounced (~800 ms).
- Stale results are ignored when the query changes.
- A small result dropdown is shown.
- Results are deduplicated and capped at 5.
- User must explicitly select a result before setting the alarm.
- Latitude/longitude are retained internally; the user no longer needs to enter them manually.
- `Use Current Location` remains available.
- Search history is not persisted.

## Important limitation

This is not Google Maps/Places autocomplete. Native geocoding can return a small number of best matches and its coverage/quality can vary by device/provider. The app must not claim Google-like autocomplete behavior.

## Privacy / network boundary

The app does not call a developer-controlled search backend and does not use a Google Maps API key. Search may depend on the device's native geocoder/provider. After selection, the app only needs the saved coordinates and device GPS for the alarm.

## Safety requirements

- No public Nominatim autocomplete fallback.
- No search-history persistence.
- Validate finite coordinates before selection.
- Clear search results when text changes.
- Wipe temporary session data if tracking startup fails after persistence.
- Existing background GPS, accuracy, failsafe, alarm, and cleanup behavior must remain unchanged.

## Validation

Run only existing checks needed for this change:

```bash
npm test
npx tsc --noEmit
npx expo config --type public
```

If Android build tooling is already available, also run `npx expo run:android` and verify the search flow on a real device.
