# 04-AI-CONTEXT-RULES: Regras de Contexto e Padrões de Código (Zelvo)

Este documento define as regras obrigatórias para assistentes de programação com IA (Cursor, Copilot, Claude Code, Google AI Studio, etc.) ao gerar, editar ou refatorar código no repositório **Zelvo**.

---

## 1. Convenções de Nomenclatura e Estilo

- **Linguagem do Código vs. UI:**
  - Todo o código (variáveis, funções, tabelas, colunas, tipos, commits e comentários técnicos) deve ser escrito em **Inglês**.
  - Toda a interface do utilizador (labels, mensagens de erro, PDFs e textos do Portal Web) deve ser escrita em **Português (Portugal)**, centralizada em ficheiros de constantes/i18n (`pt-PT.ts`) `[SUPOSIÇÃO]`.
- **Ficheiros e Pastas:**
  - Componentes React/React Native: `PascalCase.tsx` (ex.: `JobCheckinButton.tsx`).
  - Hooks, utilitários e serviços: `camelCase.ts` (ex.: `useOfflineSync.ts`, `imageCompressor.ts`).
  - Rotas Expo Router e Next.js App Router: `kebab-case` (ex.: `app/p/[slug]/page.tsx`).
  - Tabelas e colunas PostgreSQL / WatermelonDB: `snake_case` (ex.: `service_assets`, `organization_id`).
- **TypeScript Estrito:**
  - `"strict": true` obrigatório em todos os `tsconfig.json`.
  - Proibido usar `any`. Usar `unknown` com validação **Zod** em todas as fronteiras de dados (API, formulários, `JSONB`).
- **Formatação e Linting:**
  - ESLint + Prettier configurados na raiz do monorepo. Usar `pnpm lint` e `pnpm typecheck` antes de finalizar qualquer tarefa.

---

## 2. Regras Arquiteturais Obrigatórias

1. **Offline-First no App Móvel:**
   - Os ecrãs do app móvel (`apps/mobile`) **NUNCA** devem fazer chamadas diretas à API REST do Supabase (`supabase.from(...)`) para ler ou gravar dados de negócio (`clients`, `leads`, `jobs`, `transactions`, `service_assets`, `quotes`).
   - Toda a leitura e escrita no mobile passa exclusivamente pelo **WatermelonDB** local. A comunicação com o Supabase ocorre apenas no `SyncEngine` (`sync_pull` / `sync_push`), na Autenticação e no upload de ficheiros de Storage.
2. **Isolamento Multi-Tenant:**
   - Toda a tabela de negócio deve incluir `organization_id` e ter **Row-Level Security (RLS)** ativado nas migrações SQL.
   - Nas *Next.js API Routes* públicas (`/api/public/*`), usar `SUPABASE_SERVICE_ROLE_KEY` apenas no servidor e filtrar **sempre** pelo `slug` ou `public_token` validado via Zod.
3. **UX de Campo (Mobile):**
   - Todos os botões de ação primária devem ter altura mínima de `48px/dp` (`min-h-12`).
   - Paleta Zelvo: Verde-folha (`#10B981`), Teal (`#14B8A6`), Slate escuro (`#1E293B`).
   - Imagens capturadas na câmara devem passar sempre pelo `imageCompressor` (`<= 500 KB`, máx. `1280px`) antes de serem guardadas localmente.
4. **Soft Delete:**
   - Nunca usar `DELETE FROM` em tabelas sincronizadas. Definir sempre `deleted_at = now()` para que o `sync_pull` propague a remoção ao WatermelonDB.

---

## 3. Ordem Recomendada de Implementação (Passo a Passo)

A IA deve implementar o MVP seguindo esta sequência exata, validando cada fase antes de avançar:

1. **Setup do Monorepo:** Inicializar `pnpm` + `Turborepo` com `apps/mobile`, `apps/web`, `packages/shared` e `packages/pdf`.
2. **Base de Dados & Segurança (`supabase/`):**
   - Criar migração inicial com as 11 tabelas (`02-ARCHITECTURE.md`).
   - Criar função `get_user_org_id()` e políticas RLS para todas as tabelas.
   - Criar `seed.sql` com o `VerticalTemplate` de **Jardinagem**.
   - Criar as funções RPC `sync_pull` e `sync_push`.
3. **Pacote Partilhado (`packages/shared`):**
   - Definir schemas Zod para todas as entidades, incluindo o validador dinâmico de `custom_attributes` (`JSONB`) e o gerador de ocorrências `RRULE` (90 dias).
4. **Core Offline Mobile (`apps/mobile`):**
   - Configurar Supabase Auth (`expo-secure-store`) e ecrã de Login/Onboarding (criação de `Organization` + aplicação do template de Jardinagem).
   - Configurar Schema e Models do WatermelonDB + `SyncEngine`.
5. **Módulos Mobile (por ordem de dependência):**
   - CRM (`clients` + `service_assets` com campos dinâmicos).
   - Catálogo (`service_catalog`) e Orçamentos (`quotes` + deep-link WhatsApp).
   - Funil de Leads (`leads` + conversão para `client`).
   - Agenda (`jobs` recorrentes + navegação Maps/Waze + Check-in/Check-out + fotos comprimidas).
   - Finanças (`transactions` + resumo mensal).
6. **Portal Web e PDF (`apps/web` + `packages/pdf`):**
   - Formulário público `/p/[slug]` + `POST /api/public/leads`.
   - Visualização e aprovação `/q/[token]` + `POST /api/public/quotes/[token]/approve`.
   - Geração de PDF `GET /api/quotes/[token]/pdf`.

---

## 4. O que a IA DEVE EVITAR Fazer

- **NÃO** criar tabelas específicas para Jardinagem (ex.: `gardens`). Usar sempre `service_assets` com `custom_attributes` (`JSONB`).
- **NÃO** expor `SUPABASE_SERVICE_ROLE_KEY` em variáveis com prefixo `NEXT_PUBLIC_` ou `EXPO_PUBLIC_`.
- **NÃO** instalar bibliotecas pesadas desnecessárias no mobile (ex.: Moment.js — usar `date-fns`).
- **NÃO** implementar gateways de pagamento (Ifthenpay/Stripe) nem faturação certificada (Moloni) no MVP; manter apenas os campos preparatórios (`external_payment_id`, `external_invoice_id`) na tabela `transactions`.
- **NÃO** gerar código sem tratamento de estados de erro e *loading* (especialmente no modo offline e uploads de fotos).
