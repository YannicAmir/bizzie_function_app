import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdmin } from '../../../core/firebase';
import { Logger } from '../../../core/logger';

const _logger = new Logger('BizzieChat ConversationService');

const CONVERSATIONS_COLLECTION = 'conversations';
const MESSAGES_SUBCOLLECTION = 'messages';
const MAX_HISTORY_MESSAGES = 6; // 3 user + 3 assistant turns
const CONTENT_TRUNCATION_CHARS = 300; // max chars per message injected into LLM context

export interface ConversationTurn {
    role: 'user' | 'assistant';
    content: string;
}

export interface HistoryResult {
    turns: ConversationTurn[];
    hadError: boolean;
}

interface MessageDoc {
    role: 'user' | 'assistant';
    content: string;
    createdAt: Timestamp;
    followUps?: string[];
    source?: string | null;
    routePath?: string | null;
}

interface ConversationMetaDoc {
    title: string;
    ticker: string;
    companyName: string;
    createdAt: Timestamp;
    updatedAt: FirebaseFirestore.Timestamp;
    messageCount: number;
}

export class ConversationService {
    /**
     * Load the last MAX_HISTORY_MESSAGES from the session's messages subcollection.
     * Content is truncated to CONTENT_TRUNCATION_CHARS to limit LLM token usage.
     * Returns hadError=true on any Firestore failure so the caller can distinguish
     * a genuine empty session from a read fault — preventing false isFirstTurn detection.
     */
    async loadHistory(uid: string, sessionId: string): Promise<HistoryResult> {
        try {
            const db = getFirebaseAdmin().firestore();
            const messagesRef = db
                .collection('users')
                .doc(uid)
                .collection(CONVERSATIONS_COLLECTION)
                .doc(sessionId)
                .collection(MESSAGES_SUBCOLLECTION);

            const snapshot = await messagesRef
                .orderBy('createdAt', 'asc')
                .limitToLast(MAX_HISTORY_MESSAGES)
                .get();

            if (snapshot.empty) {
                return { turns: [], hadError: false };
            }

            const turns = snapshot.docs.map((doc) => {
                const data = doc.data() as MessageDoc;
                return {
                    role: data.role,
                    content: data.content.slice(0, CONTENT_TRUNCATION_CHARS),
                };
            });

            return { turns, hadError: false };
        } catch (error) {
            _logger.error('Failed to load conversation history', error);
            return { turns: [], hadError: true };
        }
    }

    /**
     * Persist a completed turn to Firestore.
     * On the first turn (isFirstTurn=true), creates the parent conversation metadata doc.
     * On subsequent turns, increments messageCount and updates updatedAt.
     *
     * Uses batch.set with merge (not update) — safe even if the parent doc was never
     * created due to a prior write failure, preventing silent data loss.
     *
     * User and assistant messages are offset by 1ms to guarantee stable createdAt ordering.
     *
     * Fire-and-forget — never awaited by the caller.
     */
    async appendTurn(params: {
        uid: string;
        sessionId: string;
        ticker: string;
        companyName: string;
        userMessage: string;
        assistantMessage: string;
        followUps?: string[];
        source?: string | null;
        routePath?: string | null;
        isFirstTurn: boolean;
        title?: string;
    }): Promise<void> {
        const {
            uid,
            sessionId,
            ticker,
            companyName,
            userMessage,
            assistantMessage,
            followUps,
            source,
            routePath,
            isFirstTurn,
            title,
        } = params;

        try {
            const db = getFirebaseAdmin().firestore();
            const userTimestamp = Timestamp.now();
            // Offset by 1ms to guarantee stable ordering — Firestore does not
            // guarantee order for documents with identical timestamps.
            const assistantTimestamp = Timestamp.fromMillis(userTimestamp.toMillis() + 1);

            const convRef = db
                .collection('users')
                .doc(uid)
                .collection(CONVERSATIONS_COLLECTION)
                .doc(sessionId);

            const messagesRef = convRef.collection(MESSAGES_SUBCOLLECTION);
            const batch = db.batch();

            // Use set+merge for both first and subsequent turns.
            // merge:true means Firestore creates the doc if missing and patches if present —
            // safe even when a prior batch failed silently (prevents orphaned message docs).
            if (isFirstTurn) {
                const meta: ConversationMetaDoc = {
                    title: (title ?? userMessage).slice(0, 60),
                    ticker,
                    companyName,
                    createdAt: userTimestamp,
                    updatedAt: userTimestamp,
                    messageCount: 2,
                };
                batch.set(convRef, meta);
            } else {
                batch.set(
                    convRef,
                    { updatedAt: userTimestamp, messageCount: FieldValue.increment(2) },
                    { merge: true },
                );
            }

            // User message doc
            const userDoc: MessageDoc = {
                role: 'user',
                content: userMessage,
                createdAt: userTimestamp,
            };
            batch.set(messagesRef.doc(), userDoc);

            // Assistant message doc — 1ms after user to guarantee ordering
            const assistantDoc: MessageDoc = {
                role: 'assistant',
                content: assistantMessage,
                createdAt: assistantTimestamp,
                ...(followUps?.length ? { followUps } : {}),
                ...(source != null ? { source } : {}),
                ...(routePath != null ? { routePath } : {}),
            };
            batch.set(messagesRef.doc(), assistantDoc);

            await batch.commit();
        } catch (error) {
            _logger.error('Failed to append conversation turn', error);
        }
    }
}
