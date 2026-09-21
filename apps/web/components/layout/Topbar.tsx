export function Topbar() {
  return (
    <header className="topbar">
      <input className="search" placeholder="🔍  Buscar pedidos, tracking..." />
      <div className="topbar-right">
        <span>🔔</span>
        <div style={{ textAlign: 'right' }}>
          <strong style={{ display: 'block', color: '#e8eefb' }}>Admin User</strong>
          <small>admin@tms.com</small>
        </div>
        <span className="avatar">AU</span>
      </div>
    </header>
  );
}
