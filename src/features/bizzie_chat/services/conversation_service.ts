import { getFirebaseAdmin } from '../../../core/firebase';
import { Logger } from '../../../core/logger';

const _logger = new Logger('BizzieChat ConversationService');

const COLLECTION = 'conversations';
// Maximum number of recent turns to load (2 turns = 4 messages: 2 user + 2 assistant)
const MAX_TURNS = 4;

export interface ConversationTurn {
    role: 'user' | 'assistant';
    content: string;
    timestamp?: number;
}

export class ConversationService {
    /**
     * Load the last MAX_TURNS conversation turns scoped to uid+ticker.
     * Returns an empty array on any error (non-critical path).
     */
    async loadHistory(uid: string, ticker: string): Promise<ConversationTurn[]> {
        try {
            const docId = `${uid}_${ticker}`;
            const doc = await getFirebaseAdmin()
                .firestore()
                .collection(COLLECTION)
                .doc(docId)
                .get();

            if (!doc.exists) {
                return [];
            }

            const turns: ConversationTurn[] = doc.data()?.turns ?? [];
            // Return only the last MAX_TURNS entries
            return turns.slice(-MAX_TURNS);
        } catch (error) {
            _logger.error('Failed to load conversation history', error);
            return [];
        }
    }

    /**
     * Append a new turn to the conversation history.
     * Fire-and-forget — never awaited by the caller.
     */
    async appendTurn(
        uid: string,
        ticker: string,
        userMessage: string,
        assistantMessage: string,
    ): Promise<void> {
        try {
            const docId = `${uid}_${ticker}`;
            const ref = getFirebaseAdmin()
                .firestore()
                .collection(COLLECTION)
                .doc(docId);

            const now = Math.floor(Date.now() / 1000);
            const newTurns: ConversationTurn[] = [
                { role: 'user', content: userMessage, timestamp: now },
                { role: 'assistant', content: assistantMessage, timestamp: now },
            ];

            await ref.set(
                { turns: getFirebaseAdmin().firestore.FieldValue.arrayUnion(...newTurns) },
                { merge: true },
            );
        } catch (error) {
            _logger.error('Failed to append conversation turn', error);
        }
    }
}
