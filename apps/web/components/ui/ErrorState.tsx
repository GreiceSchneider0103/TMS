export function ErrorState({ text = 'Não foi possível carregar os dados.' }: { text?: string }) {
  return <div className="empty-state text-error">{text}</div>;
}
