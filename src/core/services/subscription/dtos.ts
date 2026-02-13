export interface SyncUser {
    id: string;
    isSubscribed: boolean;
    subscriptionExpiryDate?: string;
}

export interface RevenueCatSubscriberDTO {
    subscriber: {
        entitlements: Record<string, {
            expires_date: string | null;
            product_identifier: string;
            purchase_date: string;
        }>;
        subscriptions: Record<string, {
            expires_date: string | null;
            period_type: string;
        }>;
    };
}
