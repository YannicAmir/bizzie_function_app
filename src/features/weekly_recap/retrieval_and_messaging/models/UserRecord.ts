export interface UserRecord {
  uid: string;
  fcmTokens: string[];  // values from UserProfile.fcmTokens map (device IDs discarded)
  tickers: string[];    // document IDs from users/{uid}/watchlist subcollection
}
