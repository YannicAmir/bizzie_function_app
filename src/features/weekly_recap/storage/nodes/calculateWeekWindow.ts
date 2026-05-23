import type { WeeklyRecapState } from '../usecase';

export function makeCalculateWeekWindowNode() {
  return async (_state: WeeklyRecapState): Promise<Partial<WeeklyRecapState>> => {
    const now = new Date();
    const endDate = now.toISOString();

    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const startDate = sevenDaysAgo.toISOString();

    return { startDate, endDate };
  };
}
