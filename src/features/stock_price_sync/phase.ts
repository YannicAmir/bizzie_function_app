import {
    CLOSE_FINALIZE_CLOSE_MINUTE,
    CLOSE_FINALIZE_OPEN_MINUTE,
    MARKET_GATE_CLOSE_MINUTE,
    MARKET_GATE_OPEN_MINUTE,
    PRE_OPEN_SEED_OPEN_MINUTE,
} from './constants';

export type Phase = 'idle' | 'seed' | 'intraday' | 'finalize';

export function resolvePhase(minuteOfDay: number): Phase {
    if (minuteOfDay >= PRE_OPEN_SEED_OPEN_MINUTE && minuteOfDay < MARKET_GATE_OPEN_MINUTE) {
        return 'seed';
    }
    if (minuteOfDay >= MARKET_GATE_OPEN_MINUTE && minuteOfDay <= MARKET_GATE_CLOSE_MINUTE) {
        return 'intraday';
    }
    if (minuteOfDay >= CLOSE_FINALIZE_OPEN_MINUTE && minuteOfDay <= CLOSE_FINALIZE_CLOSE_MINUTE) {
        return 'finalize';
    }
    return 'idle';
}
