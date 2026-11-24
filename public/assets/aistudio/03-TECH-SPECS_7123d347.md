# 03-TECH-SPECS: Especificações Técnicas e Contratos de API (Zelvo)

## 1. Autenticação, Autorização e Segurança

### 1.1 Autenticação (App Móvel)
- Utiliza **Supabase Auth** (Email + Palavra-passe no MVP; suporte futuro a Magic Link/Biometria local via `expo-local-authentication`).
- O JWT emitido pelo Supabase é guardado em armazenamento encriptado (`expo-secure-store`).

### 1.2 Isolamento Multi-Tenant (Row-Level Security — RLS)
Todas as tabelas de negócio têm RLS ativado. Nenhuma query do app móvel pode aceder a registos de outra organização.
```sql
-- Função auxiliar para obter organization_id do utilizador autenticado
CREATE OR REPLACE FUNCTION get_user_org_id() RETURNS UUID AS $$
  SELECT organization_id FROM public.users WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Exemplo de Política RLS (aplicar a todas as tabelas com organization_id)
CREATE POLICY "Tenant isolation" ON public.clients
  FOR ALL USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());
```

### 1.3 Acesso Público Seguro (Portal Web)
- As rotas públicas (`/p/[slug]` e `/q/[token]`) **não** usam credenciais do utilizador no browser.
- As chamadas passam por *Next.js API Routes* que utilizam a `SUPABASE_SERVICE_ROLE_KEY` exclusivamente no servidor, validando estritamente o `slug` ou o `public_token` (gerado com 32 bytes aleatórios via `crypto.randomBytes(24).toString('base64url')`).
- Rate Limiting `[SUPOSIÇÃO]`: Aplicar limite de 10 pedidos/minuto por IP nas rotas públicas (`POST /api/public/leads`) para prevenir spam.

---

## 2. Contratos de API e Sincronização

### 2.1 Sincronização Offline-First (Supabase RPCs para WatermelonDB)
O App Móvel não faz chamadas REST individuais por ecrã. Utiliza o protocolo padrão de sincronização *delta* via duas funções PostgreSQL (RPC) autenticadas por JWT:

#### A. Pull Changes (`POST /rest/v1/rpc/sync_pull`)
- **Payload de Entrada:**
  ```json
  { "last_pulled_at": 1732400000000 }
  ```
- **Resposta Esperada (`200 OK`):**
  ```json
  {
    "changes": {
      "clients": { "created": [...], "updated": [...], "deleted": ["uuid-1"] },
      "jobs": { "created": [...], "updated": [...], "deleted": [] }
    },
    "timestamp": 1732403600000
  }
  ```
- **Regra:** Retorna apenas registos da `organization_id` do utilizador com `updated_at > to_timestamp(last_pulled_at / 1000)`. Registos com `deleted_at IS NOT NULL` são colocados no array `deleted`.

#### B. Push Changes (`POST /rest/v1/rpc/sync_push`)
- **Payload de Entrada:**
  ```json
  {
    "changes": {
      "jobs": { "created": [...], "updated": [...], "deleted": [] },
      "transactions": { "created": [...], "updated": [], "deleted": [] }
    },
    "last_pulled_at": 1732400000000
  }
  ```
- **Resposta Esperada (`200 OK`):** `{ "status": "ok" }`
- **Erros:** `401 Unauthorized` (JWT expirado), `409 Conflict` (se necessário forçar novo pull).

---

### 2.2 Endpoints Públicos (Next.js API Routes)

#### A. Submeter Lead Público
- **Endpoint:** `POST /api/public/leads`
- **Content-Type:** `multipart/form-data`
- **Campos:** `org_slug` (string), `name` (string), `phone` (string), `address` (string), `description` (string), `gdpr_consent` (boolean = true), `photos` (até 5 ficheiros, máx. 5MB cada antes de compressão no servidor).
- **Resposta (`201 Created`):**
  ```json
  { "lead_id": "uuid", "message": "Pedido recebido com sucesso." }
  ```
- **Erros:** `400 Bad Request` (campos inválidos ou `gdpr_consent !== true`), `404 Not Found` (`org_slug` inexistente), `429 Too Many Requests`.

#### B. Consultar Orçamento Público
- **Endpoint:** `GET /api/public/quotes/:token`
- **Resposta (`200 OK`):**
  ```json
  {
    "organization": { "name": "Verde & Jardim", "logo_url": "...", "primary_color": "#10B981", "phone": "..." },
    "quote": {
      "quote_number": "ORC-2026-001",
      "status": "SENT",
      "items": [...],
      "subtotal": 100.00,
      "vat_total": 23.00,
      "total": 123.00,
      "valid_until": "2026-12-15"
    }
  }
  ```
- **Erros:** `404 Not Found` (token inválido).

#### C. Aprovar Orçamento Público
- **Endpoint:** `POST /api/public/quotes/:token/approve`
- **Payload:** `{}` (vazio)
- **Ação no Servidor:**
  1. Valida se o orçamento está em `SENT` e dentro da data `valid_until`.
  2. Atualiza `quotes.status = 'APPROVED'`, `approved_at = now()`, `approved_ip = req.ip`.
  3. Se existir `lead_id` associado, atualiza `leads.status = 'WON'`.
- **Resposta (`200 OK`):** `{ "status": "APPROVED", "approved_at": "2026-11-23T23:30:00Z" }`
- **Erros:** `400 Bad Request` (orçamento expirado ou já aprovado/rejeitado).

#### D. Gerar PDF do Orçamento
- **Endpoint:** `GET /api/quotes/:token/pdf`
- **Resposta (`200 OK`):** `Content-Type: application/pdf` (stream gerado via `@react-pdf/renderer` com branding da organização).

---

## 3. Regras de Negócio Críticas e Tratamento de Exceções

1. **Upload de Fotos em Modo Offline:**
   - As fotos tiradas no terreno são comprimidas imediatamente no dispositivo (`expo-image-manipulator`: largura máx. 1280px, qualidade JPEG 0.7, alvo `<= 500 KB`) e guardadas no sistema de ficheiros local (`expo-file-system`).
   - O registo `job_media` é criado no WatermelonDB com `storage_path = 'local://...'`.
   - Um *worker* de background deteta ligação de rede, faz upload para o bucket privado `job-media/{org_id}/{job_id}/{uuid}.jpg` no Supabase Storage e atualiza o `storage_path` para o caminho remoto antes do próximo `sync_push`.

2. **Resolução de Conflitos na Sincronização:**
   - Estratégia **Last-Write-Wins (LWW)** a nível de registo baseada em `updated_at` para tabelas de perfil (`clients`, `service_assets`, `leads`).
   - Estratégia **Append-Only** para `transactions` e `job_media` (nunca sobrescrever movimentos financeiros ou fotos; correções criam novos registos ou usam `deleted_at`).

3. **Geração de Recorrências (`Jobs`):**
   - Ao criar um `Job` com `recurrence_rule` (ex.: `FREQ=WEEKLY;INTERVAL=2`), o sistema materializa os registos individuais para os próximos 90 dias ligados ao `parent_job_id`. Isto garante que a agenda funciona 100% offline sem cálculos complexos em tempo real.

4. **Anonimização RGPD:**
   - Ao anonimizar um cliente, o sistema substitui `name = 'Cliente Anonimizado'`, `phone = '000000000'`, `email = null`, `nif = null`, `is_anonymized = true`, preservando os registos em `transactions` para integridade contabilística.

---

## 4. Configurações de IA no Produto
- **No MVP (Fase 1):** `[SUPOSIÇÃO]` Não há chamadas a LLMs em tempo de execução no produto para manter o custo operacional em zero e garantir funcionamento 100% offline.
- **Preparação Futura (Fase 3):** O campo `next_visit_notes` e a descrição de `leads` estão estruturados em texto simples para receber transcrição de voz (Whisper/Gemini) em versões posteriores.
