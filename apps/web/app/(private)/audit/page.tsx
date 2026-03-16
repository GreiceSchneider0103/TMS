import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { StatusBadge } from '@/components/ui/StatusBadge';

const rows = [
  ['16/03/2026 14:30', 'admin@tms.com', 'CREATE', 'Pedido #12345', 'Criou novo pedido'],
  ['16/03/2026 14:25', 'admin@tms.com', 'UPDATE', 'Tabela Frete', 'Publicou tabela Correios v3.2'],
  ['16/03/2026 13:45', 'operador@tms.com', 'DELETE', 'Embarque #SHP001', 'Cancelou embarque'],
  ['16/03/2026 12:15', 'admin@tms.com', 'UPDATE', 'Transportadora', 'Ativou Jadlog']
];

export default function AuditPage() {
  return (
    <div className="grid">
      <PageHeader title="Auditoria" subtitle="Registro completo de ações no sistema" actions={<button className="btn primary">Exportar</button>} />
      <Panel title="Eventos de auditoria">
        <div className="filter-row">
          <span style={{ color: '#9fb0d8' }}>Filtros:</span>
          <select className="select"><option>Todos os usuários</option></select>
          <select className="select"><option>Todas as ações</option></select>
          <input className="input" placeholder="dd/mm/aaaa" />
        </div>

        <div className="table-wrap">
          <table>
            <thead><tr><th>Data/Hora</th><th>Usuário</th><th>Ação</th><th>Recurso</th><th>Detalhes</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.join('-')}>
                  <td>{r[0]}</td>
                  <td>{r[1]}</td>
                  <td><StatusBadge status={r[2]} /></td>
                  <td>{r[3]}</td>
                  <td>{r[4]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
