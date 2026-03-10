import * as admin from 'firebase-admin';

export const getFirebaseAdmin = () => {
  try {
    admin.app();
  } catch {
    admin.initializeApp();
  }
  return admin;
};
