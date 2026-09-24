export function EmptyState({ text = 'Nenhum registro encontrado.' }: { text?: string }) {
  return <div className="empty-state">{text}</div>;
}
