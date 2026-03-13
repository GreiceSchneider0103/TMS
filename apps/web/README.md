# TMS Web (Homologação Operacional)

Frontend MVP em Next.js + React + TypeScript focado em validar operação real.

## Estrutura

- `app/` rotas e páginas
- `components/` layout e componentes compartilhados
- `modules/` módulos de negócio (orders, shipments, freight, tracking, settings)
- `services/` cliente HTTP e tipos
- `hooks/` hooks reutilizáveis

## Rodar

```bash
cd apps/web
npm install
npm run dev
```

Defina `NEXT_PUBLIC_API_BASE_URL` se a API não estiver em `http://localhost:3001`.
