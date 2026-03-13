# TMS Web (Homologação Operacional)

Frontend MVP em Next.js + React + TypeScript focado em validar operação real.

## Estrutura

- `app/` rotas e páginas
- `components/` layout e componentes compartilhados
- `modules/` módulos de negócio (orders, shipments, freight, tracking, settings)
- `services/` cliente HTTP e tipos
- `hooks/` hooks reutilizáveis

## Pré-requisitos

- Node.js 20+
- npm 10+

## Rodar localmente

```bash
cd apps/web
npm install
npm run dev
```

Aplicação: `http://localhost:3000`

## Integração com API

Por padrão usa `http://localhost:3001`.

Se necessário, configure:

```bash
export NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
```

## Ambientes com restrição de registry

1. Garanta que o npm está apontando para um registry permitido:
   ```bash
   npm config set registry https://registry.npmjs.org/
   ```
2. Se a rede corporativa bloquear npmjs, configure o mirror interno da empresa (Artifactory/Nexus/Verdaccio) como registry.
3. Depois rode novamente:
   ```bash
   npm install
   npm run dev
   ```

Sem acesso a um registry permitido, não é possível instalar dependências do Next.js.
