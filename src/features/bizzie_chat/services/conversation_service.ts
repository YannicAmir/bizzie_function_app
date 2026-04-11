import { CollectionReference, DocumentReference, FieldValue, Timestamp, WriteBatch } from 'firebase-admin/firestore';
import { getFirebaseAdmin } from '../../../core/firebase';
import { Logger } from '../../../core/logger';

const _logger = new Logger('BizzieChat ConversationService');

const CONVERSATIONS_COLLECTION = 'conversations';
const MESSAGES_SUBCOLLECTION = 'messages';
const MAX_HISTORY_MESSAGES = 6;
const CONTENT_TRUNCATION_CHARS = 300;

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
    updatedAt: Timestamp;
    messageCount: number;
}

export interface AppendTurnParams {
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
}

export class ConversationService {
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

    /** Fire-and-forget — do not await. */
    async appendTurn(params: AppendTurnParams): Promise<void> {
        try {
            const db = getFirebaseAdmin().firestore();
            const userTimestamp = Timestamp.now();
            const assistantTimestamp = Timestamp.fromMillis(userTimestamp.toMillis() + 1);

            const convRef = db
                .collection('users')
                .doc(params.uid)
                .collection(CONVERSATIONS_COLLECTION)
                .doc(params.sessionId);

            const batch = db.batch();
            this.batchConvMeta(batch, convRef, params, userTimestamp);
            this.batchMessages(batch, convRef.collection(MESSAGES_SUBCOLLECTION), params, userTimestamp, assistantTimestamp);
            await batch.commit();
        } catch (error) {
            _logger.error('Failed to append conversation turn', error);
        }
    }

    private batchConvMeta(
        batch: WriteBatch,
        convRef: DocumentReference,
        params: AppendTurnParams,
        userTimestamp: Timestamp,
    ): void {
        if (params.isFirstTurn) {
            const meta: ConversationMetaDoc = {
                title: (params.title ?? params.userMessage).slice(0, 60),
                ticker: params.ticker,
                companyName: params.companyName,
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
    }

    private batchMessages(
        batch: WriteBatch,
        messagesRef: CollectionReference,
        params: AppendTurnParams,
        userTimestamp: Timestamp,
        assistantTimestamp: Timestamp,
    ): void {
        batch.set(messagesRef.doc(), {
            role: 'user',
            content: params.userMessage,
            createdAt: userTimestamp,
        } as MessageDoc);

        batch.set(messagesRef.doc(), {
            role: 'assistant',
            content: params.assistantMessage,
            createdAt: assistantTimestamp,
            ...(params.followUps?.length ? { followUps: params.followUps } : {}),
            ...(params.source != null ? { source: params.source } : {}),
            ...(params.routePath != null ? { routePath: params.routePath } : {}),
        } as MessageDoc);
    }
}
