import * as admin from 'firebase-admin';

let initialized = false;

export const getFirebaseAdmin = () => {
  if (!initialized) {
    admin.initializeApp();
    initialized = true;
  }
  return admin;
};
