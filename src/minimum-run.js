// Use the profile's primary elapsed time; never substitute wall time or secondary timing.
export const MINIMUM_RUN_MS=5000;
export const eligibleTime=ms=>Number.isFinite(ms)&&ms>=MINIMUM_RUN_MS;
export const eligibleRun=attempt=>eligibleTime(attempt?.elapsedMs);
