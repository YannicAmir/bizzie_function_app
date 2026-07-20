export function selectCohort(
    watchlist: Map<string, string>,
    maxCallsPerRun: number,
    minuteOfDay: number,
): Array<[string, string]> {
    const entries = [...watchlist.entries()];
    if (maxCallsPerRun <= 0) {
        return entries;
    }
    const numCohorts = Math.ceil(watchlist.size / maxCallsPerRun);
    if (numCohorts <= 1) {
        return entries;
    }
    const sorted = entries.sort((a, b) => a[0].localeCompare(b[0]));
    const slot = minuteOfDay % numCohorts;
    return sorted.filter((_, index) => index % numCohorts === slot);
}
