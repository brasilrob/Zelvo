# 05-TEST-PLAN: Plano e Casos de Teste (Zelvo MVP)

## 1. Estratégia de Testes

| Camada | Ferramenta `[SUPOSIÇÃO]` | Foco Principal |
| :--- | :--- | :--- |
| **Unitários** | **Vitest** | Cálculos de orçamentos (subtotal/IVA/total), geração de datas `RRULE` (90 dias), validação de schemas Zod e compressão de imagens. |
| **Integração (BD & API)** | **Vitest + Supabase Local** | Políticas RLS (isolamento multi-tenant), funções RPC `sync_pull`/`sync_push`, endpoints públicos `/api/public/*` e geração de PDF. |
| **Ponta a Ponta (E2E)** | **Playwright** (Web) / **Maestro** (Mobile) | Fluxo completo: Submissão de Lead Web → Sincronização Mobile → Criação de Orçamento → Aprovação Web → Execução Offline de Visita. |

---

## 2. Casos de Teste por Funcionalidade

| ID | Módulo | Cenário | Tipo | Resultado Esperado |
| :--- | :--- | :--- | :--- | :--- |
| **TC-01** | Segurança (RLS) | Utilizador da Org A tenta ler/editar `clients` ou `jobs` da Org B via JWT. | Segurança / Falha | Base de dados retorna 0 registos / erro de permissão RLS. |
| **TC-02** | Onboarding | Novo utilizador regista-se e seleciona vertical "Jardinagem". | Caminho Feliz | Cria `Organization`, associa `VerticalTemplate` de Jardinagem e popula catálogo e checklists padrão. |
| **TC-03** | Leads (Web) | Cliente submete formulário `/p/[slug]` com 3 fotos e `gdpr_consent = true`. | Caminho Feliz | Retorna `201 Created`, cria lead com estado `NEW` e guarda fotos no Storage. |
| **TC-04** | Leads (Web) | Cliente tenta submeter formulário sem aceitar RGPD ou com 6 fotos. | Caso de Borda / Falha | Retorna `400 Bad Request` com mensagem clara de validação. |
| **TC-05** | Funil de Leads | Profissional marca lead como `LOST` sem selecionar motivo. | Caso de Borda | UI impede a gravação e exige seleção de `lost_reason`. |
| **TC-06** | Funil de Leads | Profissional converte lead `QUOTE_SENT` para `WON`. | Caminho Feliz | Cria automaticamente `Client` e `ServiceAsset` com dados do lead. |
| **TC-07** | Orçamentos | Cálculo de orçamento com 2 serviços (IVA 23%) e 1 serviço isento (IVA 0%). | Unitário | `subtotal`, `vat_total` e `total` calculados com precisão de 2 casas decimais. |
| **TC-08** | Orçamentos (Web) | Cliente acede a `/q/[token]` e clica em "Aprovar Orçamento". | Caminho Feliz | Estado muda para `APPROVED`, regista `approved_at` e `approved_ip`, lead passa a `WON`. |
| **TC-09** | Orçamentos (Web) | Cliente tenta aprovar um orçamento com `valid_until` expirado ou já aprovado. | Caso de Borda / Falha | Retorna `400 Bad Request` e mantém estado inalterado. |
| **TC-10** | Agenda | Criar `Job` com recorrência quinzenal (`FREQ=WEEKLY;INTERVAL=2`). | Caminho Feliz | Gera corretamente as ocorrências para os próximos 90 dias ligadas ao `parent_job_id`. |
| **TC-11** | Execução Offline | Telemóvel em **Modo Avião**: fazer Check-in, completar checklist, tirar 2 fotos e fazer Check-out. | Caminho Feliz (Offline) | Tudo gravado no WatermelonDB sem erros; fotos comprimidas (`<= 500 KB`) em `local://`. |
| **TC-12** | Sincronização | Desativar **Modo Avião** após TC-11. | Integração | Worker faz upload das fotos para o Storage, atualiza `storage_path` e `sync_push` conclui com `200 OK`. |
| **TC-13** | Finanças | Registar pagamento (`INCOME`) num `Job` e uma despesa (`EXPENSE`) de combustível. | Caminho Feliz | `job.payment_status` passa a `PAID` e resumo mensal reflete saldo líquido correto. |
| **TC-14** | RGPD | Anonimizar um cliente que já possui transações financeiras registadas. | Caso de Borda | Dados pessoais do cliente são apagados (`is_anonymized = true`), mas `transactions` permanecem intactas. |
