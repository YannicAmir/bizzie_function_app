import * as admin from 'firebase-admin';

export const getFirebaseAdmin = () => {
  if (admin.apps.length === 0) {
    admin.initializeApp();
  }
  return admin;
};
