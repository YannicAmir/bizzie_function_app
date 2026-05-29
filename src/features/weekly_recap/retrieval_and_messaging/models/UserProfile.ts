export interface UserProfile {
  uid: string;
  fcmTokens: Record<string, string>; // { [deviceId]: fcmToken }
  isSubscribed: boolean;
  notificationsEnabled: boolean;
  name: string;
}
