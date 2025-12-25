import { getFirebaseAdmin } from './firebase';

export const getRemoteConfig = () => {
  return getFirebaseAdmin().remoteConfig();
};

export const publishTemplate = async (template: any) => {
  const rc = getRemoteConfig();
  // Validate or safely merge before publishing in real apps
  return rc.publishTemplate(template);
};

export const getTemplate = async () => {
  const rc = getRemoteConfig();
  return rc.getTemplate();
};
