export function LoadingState({ text = 'Carregando...' }: { text?: string }) {
  return <div className="empty-state">{text}</div>;
}
