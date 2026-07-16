import { Timestamp } from 'firebase-admin/firestore';

export interface IngestionCursor {
    lastPublishedDate: string;
    leaseExpiresAt: Timestamp;
    updatedAt: Timestamp;
}
