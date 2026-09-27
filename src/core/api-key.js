import { randomBytes, createHash } from 'node:crypto';

export const generateRawApiKey = () => {
  return `gw_${randomBytes(32).toString('base64url')}`;
};

export const extractKeyPrefix = (rawKey) => {
  return rawKey.slice(0, 12);
};

export const hashApiKey = (rawKey) => {
  return createHash('sha256').update(rawKey).digest('hex');
};
