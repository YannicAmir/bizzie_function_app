import { Timestamp } from 'firebase-admin/firestore';
import { YtdChangeSnapshot } from './YtdChangeSnapshot';

export interface StoredYtdChange extends YtdChangeSnapshot {
    updatedAt: Timestamp;
}
