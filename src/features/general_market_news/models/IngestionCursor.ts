import { Timestamp } from 'firebase-admin/firestore';

export interface IngestionCursor {
    lastPublishedDate: string;
    lastRunAt: Timestamp;
    leaseExpiresAt: Timestamp;
    updatedAt: Timestamp;
}
