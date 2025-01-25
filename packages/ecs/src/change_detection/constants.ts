/**
 * The (arbitrarily chosen) minimum number of world tick increments between check_tick scans.
 *
 * Change ticks can only be scanned when systems aren't running. Thus, if the threshold is N,
 * the maximum is 2 * N - 1 (i.e. the world ticks N - 1 times, then N times).
 *
 * If no change is older than u32.MAX - (2 * N - 1) following a scan, none of their ages can
 * overflow and cause false positives.
 */
export const CHECK_TICK_THRESHOLD = 518_400_000; // 1000 ticks per frame * 144 frames per second * 3600 seconds per hour

/**
 * The maximum change tick difference that won't overflow before the next check_tick scan.
 * Changes stop being detected once they become this old.
 */
export const MAX_CHANGE_AGE = Number.MAX_SAFE_INTEGER - (2 * CHECK_TICK_THRESHOLD - 1);
