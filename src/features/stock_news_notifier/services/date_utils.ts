import { MS_PER_SECOND, TIMEZONE } from '../constants';

const _easternFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
});

export function formatEasternWallTime(epochMs: number): string {
    const parts = _easternFormatter.formatToParts(new Date(epochMs));
    const get = (type: Intl.DateTimeFormatPartTypes): string =>
        parts.find((p) => p.type === type)?.value ?? '00';
    const hour = get('hour') === '24' ? '00' : get('hour');
    return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')}:${get('second')}`;
}

export function easternWallTimeToEpochMs(wallTime: string): number {
    const utcGuess = Date.parse(`${wallTime.replace(' ', 'T')}Z`);
    const wallOfGuess = Date.parse(`${formatEasternWallTime(utcGuess).replace(' ', 'T')}Z`);
    return utcGuess - (wallOfGuess - utcGuess);
}

export function computeOverlapCutoff(watermark: string, overlapWindowSeconds: number): string {
    return formatEasternWallTime(easternWallTimeToEpochMs(watermark) - overlapWindowSeconds * MS_PER_SECOND);
}
