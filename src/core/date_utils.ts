const EASTERN_TIMEZONE = 'America/New_York';
const MS_PER_SECOND = 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const _easternFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: EASTERN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
});

interface EasternParts {
    year: string;
    month: string;
    day: string;
    hour: string;
    minute: string;
    second: string;
    weekday: string;
}

function easternParts(epochMs: number): EasternParts {
    const formatted = _easternFormatter.formatToParts(new Date(epochMs));
    const partValue = (type: Intl.DateTimeFormatPartTypes): string => {
        const part = formatted.find((candidate) => candidate.type === type);
        if (part === undefined) {
            throw new Error(`Missing "${type}" in Eastern-time format of epoch ${epochMs}`);
        }
        return part.value;
    };
    const hour = partValue('hour');
    return {
        year: partValue('year'),
        month: partValue('month'),
        day: partValue('day'),
        // en-CA with hour12:false can render midnight as "24"; normalize to "00".
        hour: hour === '24' ? '00' : hour,
        minute: partValue('minute'),
        second: partValue('second'),
        weekday: partValue('weekday'),
    };
}

export function todayEasternDate(epochMs: number): string {
    const parts = easternParts(epochMs);
    return `${parts.year}-${parts.month}-${parts.day}`;
}

export function easternMinutesSinceMidnight(epochMs: number): number {
    const parts = easternParts(epochMs);
    return Number(parts.hour) * 60 + Number(parts.minute);
}

export function isMondayEastern(epochMs: number): boolean {
    return easternParts(epochMs).weekday === 'Mon';
}

export function subtractCalendarDays(dateStr: string, days: number): string {
    if (!Number.isInteger(days)) {
        throw new Error(`days must be an integer: ${days}`);
    }
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3 || !parts.every(Number.isInteger)) {
        throw new Error(`Invalid date string: ${dateStr}`);
    }
    const [year, month, day] = parts as [number, number, number];
    const base = new Date(Date.UTC(year, month - 1, day));

    if (base.getUTCFullYear() !== year || base.getUTCMonth() !== month - 1 || base.getUTCDate() !== day) {
        throw new Error(`Invalid date string: ${dateStr}`);
    }
    const shifted = new Date(base.getTime() - days * MS_PER_DAY);
    const shiftedYear = shifted.getUTCFullYear();
    const shiftedMonth = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const shiftedDay = String(shifted.getUTCDate()).padStart(2, '0');
    return `${shiftedYear}-${shiftedMonth}-${shiftedDay}`;
}

export function dateOf(wallTime: string): string {
    return wallTime.split(' ')[0] ?? wallTime;
}

export function formatEasternWallTime(epochMs: number): string {
    const parts = easternParts(epochMs);
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function easternWallTimeToEpochMs(wallTime: string): number {
    const utcGuess = Date.parse(`${wallTime.replace(' ', 'T')}Z`);
    const wallOfGuess = Date.parse(`${formatEasternWallTime(utcGuess).replace(' ', 'T')}Z`);
    return utcGuess - (wallOfGuess - utcGuess);
}

export function computeOverlapCutoff(watermark: string, overlapWindowSeconds: number): string {
    return formatEasternWallTime(easternWallTimeToEpochMs(watermark) - overlapWindowSeconds * MS_PER_SECOND);
}
