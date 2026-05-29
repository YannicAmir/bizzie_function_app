import type { WeeklyRecapState } from '../usecase';

export function makeCalculateWeekWindowNode() {
  return async (_state: WeeklyRecapState): Promise<Partial<WeeklyRecapState>> => {
    const now = new Date();
    const endDate = now.toISOString().slice(0, 10);

    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const startDate = sevenDaysAgo.toISOString().slice(0, 10);

    return { startDate, endDate };
  };
}
