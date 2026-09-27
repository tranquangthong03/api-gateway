export const getEpochMinute = (nowMs = Date.now()) => {
  return Math.floor(nowMs / 60000);
};

export const getRetryAfterSeconds = (nowMs = Date.now()) => {
  const currentEpochSeconds = Math.floor(nowMs / 1000);
  return Math.max(1, 60 - (currentEpochSeconds % 60));
};

export const getDefaultTimeRange = (fromStr, toStr, nowMs = Date.now()) => {
  const to = toStr ? new Date(toStr).toISOString() : new Date(nowMs).toISOString();
  const from = fromStr
    ? new Date(fromStr).toISOString()
    : new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();

  return { from, to };
};
