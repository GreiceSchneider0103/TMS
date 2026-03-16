export function EmptyState({ text = 'Nenhum dado encontrado para os filtros atuais.' }: { text?: string }) {
  return <div className="empty-state">{text}</div>;
}
