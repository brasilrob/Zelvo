# Zelvo — Serviços no Terreno

Plataforma SaaS de *Field Service Management* (FSM) **Mobile-First** e **Offline-First** para profissionais de serviços no terreno (piloto inicial: Jardinagem e Paisagismo; arquitetura multi-nicho e multi-tenant).

## Documentação do Projeto
Toda a especificação técnica está disponível na pasta `/docs`:
- [`docs/01-PRD.md`](./docs/01-PRD.md) — Requisitos de Produto e Critérios de Aceitação.
- [`docs/02-ARCHITECTURE.md`](./docs/02-ARCHITECTURE.md) — Arquitetura, Stack e Modelo de Dados SQL.
- [`docs/03-TECH-SPECS.md`](./docs/03-TECH-SPECS.md) — Segurança (RLS), Contratos de API e Sync Offline.
- [`docs/04-AI-CONTEXT-RULES.md`](./docs/04-AI-CONTEXT-RULES.md) — Regras de Código e Ordem de Implementação.
- [`docs/05-TEST-PLAN.md`](./docs/05-TEST-PLAN.md) — Estratégia e Casos de Teste.

---

## Pré-requisitos de Ambiente
- **Node.js:** `v20.x` ou superior
- **pnpm:** `v9.x` ou superior (`npm install -g pnpm`)
- **Supabase CLI:** para correr PostgreSQL, Auth e Storage localmente (`brew install supabase/tap/supabase` ou equivalente)
- **Docker Desktop:** obrigatório para o Supabase Local
- **Expo Go** (no telemóvel) ou emuladores iOS (Xcode) / Android (Android Studio)

---

## Variáveis de Ambiente (`.env.example`)

Crie um ficheiro `.env` em `apps/mobile/.env` e `apps/web/.env.local` com base nos modelos abaixo:

```env
# --- apps/mobile/.env ---
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key-aqui
EXPO_PUBLIC_WEB_PORTAL_URL=http://localhost:3000

# --- apps/web/.env.local ---
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key-aqui
# NUNCA expor esta chave no cliente ou no mobile:
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key-aqui
```

---

## Instalação e Execução Local

### 1. Instalar dependências do Monorepo
```bash
pnpm install
```

### 2. Iniciar o Backend Local (Supabase) e aplicar Migrações + Seed
```bash
supabase start
supabase db reset
```
*(O comando `supabase start` imprime no terminal as chaves `anon key` e `service_role key` para colocar nos ficheiros `.env`.)*

### 3. Executar o Portal Web (`apps/web`)
```bash
pnpm --filter web dev
```
Disponível em `http://localhost:3000`.

### 4. Executar o App Móvel (`apps/mobile`)
```bash
pnpm --filter mobile start
```
Leia o QR Code com o Expo Go ou prima `i` (iOS) / `a` (Android). *(Nota: para testar o WatermelonDB nativo com SQLite, use um Development Build via `npx expo prebuild` ou EAS Build).*

---

## Testes e Qualidade de Código

```bash
# Verificação de tipos TypeScript em todo o monorepo
pnpm typecheck

# Linting
pnpm lint

# Testes unitários e de integração (Vitest)
pnpm test

# Testes E2E do Portal Web (Playwright)
pnpm --filter web test:e2e
```

---

## Deploy (Produção)
- **Base de Dados & Auth:** `supabase db push` ligado ao projeto de produção no Supabase Cloud.
- **Portal Web (`apps/web`):** Deploy automático via **Vercel** (configurar Root Directory como `apps/web` e adicionar as variáveis de ambiente).
- **App Móvel (`apps/mobile`):** Builds nativos (iOS/Android) geridos via **Expo EAS** (`eas build --platform all`).
