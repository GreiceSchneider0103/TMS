export function getAccountId(req) {
  const accountId = req.headers['x-account-id'];
  if (!accountId) throw new Error('Missing x-account-id header');
  return String(accountId);
}

export function getUserId(req) {
  return String(req.headers['x-user-id'] || '00000000-0000-0000-0000-000000000000');
}
