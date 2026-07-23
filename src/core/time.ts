const ET_TIME_ZONE = 'America/New_York';
const ISO_LOCALE = 'en-CA';
const MIDNIGHT_HOUR_RAW = '24';
const MIDNIGHT_HOUR_NORMALIZED = '00';

const EASTERN_DATE_FORMAT = new Intl.DateTimeFormat(ISO_LOCALE, {
    timeZone: ET_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit'
});

const EASTERN_TIMESTAMP_FORMAT = new Intl.DateTimeFormat(ISO_LOCALE, {
    timeZone: ET_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
});

export function easternDateString(date: Date): string {
    return EASTERN_DATE_FORMAT.format(date);
}

export function easternTimestampString(date: Date): string {
    const parts = EASTERN_TIMESTAMP_FORMAT.formatToParts(date);

    const get = (type: string): string => parts.find(p => p.type === type)?.value ?? '';
    const hour = get('hour') === MIDNIGHT_HOUR_RAW ? MIDNIGHT_HOUR_NORMALIZED : get('hour');
    return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')}:${get('second')}`;
}
