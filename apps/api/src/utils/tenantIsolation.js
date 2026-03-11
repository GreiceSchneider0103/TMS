export function filterByTenant(items, accountId) {
  return (items || []).filter((item) => String(item.account_id) === String(accountId));
}
