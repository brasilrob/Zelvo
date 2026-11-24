# 07-UI-DESIGN-SYSTEM: Identidade Visual, Design System e Ecrãs (Zelvo)

Este documento especifica a identidade visual, os tokens de design, os componentes reutilizáveis e o layout estrutural dos ecrãs do **Zelvo**, pronto para implementação em React Native (NativeWind/StyleSheet) e Next.js (Tailwind CSS).

---

## 1. Identidade Visual e Logótipo

- **Nome da Marca:** `zelvo` (logótipo em minúsculas geométricas, subtítulo: *serviços no terreno*).
- **Símbolo:** Ícone circular que funde uma **folha** (natureza/exterior), um **visto/check** (execução concluída) e um **arco de rota** (deslocações no terreno).
- **Aplicação:**
  - *Fundo Escuro (Splash Screen, Cabeçalho de Marca, Autocolantes):* Símbolo em gradiente/duotone `#10B981` + `#14B8A6`, texto `zelvo` em branco `#FFFFFF` com detalhe folha no "o" em `#10B981`, sobre `#1E293B`.
  - *Fundo Claro (App em Campo, PDFs, Portal Web):* Símbolo em `#10B981` + `#14B8A6`, texto `zelvo` em `#0F172A`, sobre `#FFFFFF` ou `#F8FAFC`.
- **Light White-Label (Portal do Cliente e PDFs):** Quando o profissional carrega o seu próprio logótipo e cor primária nas definições (`organizations.primary_color`), o cabeçalho do PDF e das páginas `/p/[slug]` e `/q/[token]` assume a marca do profissional, mantendo um rodapé discreto *"Com tecnologia zelvo"*.

---

## 2. Tokens de Design (Tailwind / NativeWind)

### 2.1 Paleta de Cores (Alto Contraste Solar)

| Categoria | Token | Hex | Utilização |
| :--- | :--- | :--- | :--- |
| **Marca** | `brand-primary` | `#10B981` | Botões primários (CTA), tab ativa, ícone check/folha. |
| **Marca** | `brand-primary-dark` | `#059669` | Estado *pressed*/*hover* de botões primários (contraste AA/AAA com texto branco). |
| **Marca** | `brand-secondary` | `#14B8A6` | Destaques secundários, acentos gráficos, badges de recorrência. |
| **Superfícies** | `surface-dark` | `#1E293B` | Cabeçalhos estruturais, splash screen, modo escuro opcional. |
| **Superfícies** | `surface-bg` | `#F8FAFC` | Fundo geral dos ecrãs (reduz encandeamento face ao branco puro). |
| **Superfícies** | `surface-card` | `#FFFFFF` | Cartões com borda nítida `1px solid #E2E8F0` (melhor que sombra ao sol). |
| **Texto** | `text-primary` | `#0F172A` | Títulos, nomes de clientes, valores monetários (contraste > 15:1). |
| **Texto** | `text-secondary` | `#475569` | Moradas, subtítulos, metadados (contraste > 7:1). |
| **Semântica** | `status-success` | `#15803D` / bg `#DCFCE7` | Pago, Concluído, Orçamento Aprovado, Lead Ganho. |
| **Semântica** | `status-warning` | `#B45309` / bg `#FEF3C7` | Pendente, Modo Offline, Em Curso (`IN_PROGRESS`). |
| **Semântica** | `status-danger` | `#B91C1C` / bg `#FEE2E2` | Despesa, Atrasado, Lead Perdido, Ações destrutivas/RGPD. |
| **Semântica** | `status-info` | `#0369A1` / bg `#E0F2FE` | Novo Lead, Agendado (`SCHEDULED`), Orçamento Enviado. |

### 2.2 Tipografia
- **Família:** `Inter` (Web) / Fonte de Sistema nativa (`SF Pro` iOS / `Roboto` Android) no Mobile para máxima performance e nitidez.
- **Números Tabulares:** Usar `font-variant-numeric: tabular-nums` em todos os valores em Euros (`€`), cronómetros e datas.

| Nível | Tamanho / Peso | Linha | Uso |
| :--- | :--- | :--- | :--- |
| `Display / KPI` | `28px` / Bold (700) | `34px` | Saldo líquido mensal, cronómetro ativo de visita. |
| `H1 (Ecrã)` | `22px` / Bold (700) | `28px` | Título do ecrã no cabeçalho. |
| `H2 (Secção)` | `18px` / SemiBold (600) | `24px` | Nome do cliente no cartão, títulos de secção. |
| `Body` | `16px` / Regular (400) | `24px` | Descrições, moradas, checklists (mínimo `16px` para leitura fácil no terreno). |
| `Caption / Badge` | `13px` / Medium (500) | `18px` | Estados, horários, etiquetas de campos. |

### 2.3 Espaçamento, Bordas e Ergonomia
- **Grelha Base:** Múltiplos de `4px` (`padding` horizontal padrão dos ecrãs: `16px`).
- **Raios de Borda:** Cartões `12px` (`rounded-xl`), Botões `10px` (`rounded-lg`), Badges `9999px` (`rounded-full`).
- **Alturas Mínimas:** Botões primários `48px` (`min-h-12`), Inputs `48px`, Itens de Checklist `52px`, *Bottom Navigation Bar* `64px` + *Safe Area*.

---

## 3. Componentes Nucleares da Biblioteca UI

1. **`PrimaryButton`:** Altura mínima `48px`, largura total em formulários/modais, fundo `#10B981` (ou `#059669` ativo), texto branco `16px` SemiBold, suporte a estado `loading` (spinner) e ícone à esquerda.
2. **`StatusBadge`:** Pílula compacta com ponto indicador + texto em maiúsculas/capitalizado usando cores semânticas (ex.: `● Em Curso`, `● Pago`, `● Orçamento Enviado`).
3. **`JobCard` (Cartão de Visita):**
   - Borda esquerda colorida de `4px` indicando estado (`#0369A1` Agendado, `#D97706` Em Curso, `#10B981` Concluído).
   - Topo: Hora + Badge de Estado + Badge de Recorrência (se aplicável).
   - Centro: Nome do Cliente (Bold) + Nome do Ativo/Morada.
   - Destaque condicional: Caixa amarela suave se existirem `next_visit_notes` ou `access_notes`.
   - Rodapé: Dois botões grandes lado a lado — `[Navegar]` (secundário) e `[Iniciar / Abrir]` (primário).
4. **`DynamicAttributeField`:** Renderiza automaticamente o input certo com base no `asset_schema` (`JSONB`) do `VerticalTemplate` (ex.: `number` com sufixo `m²`, `select` para Tipo de Relva, `boolean` switch para Sistema de Rega).
5. **`SyncStatusBanner`:** Barra condicional no topo (visível apenas quando offline, a sincronizar ou com erro), nunca bloqueante.

---

## 4. Wireframes Estruturais dos Ecrãs Principais

### 4.1 Ecrã "Hoje" (Agenda Diária — Ecrã Inicial)
```text
+------------------------------------------+
| [Logo zelvo]  Terça, 24 Nov     [● Sync] |  <- Header Slate (#1E293B)
+------------------------------------------+
| [ Hoje (3) ]   [ Semana ]        [+ Novo]|  <- Seletor rápido
+------------------------------------------+
| | 09:00 - 10:30             [● Agendado] |
| | Ana Silva • Jardim Principal (150 m²)  |
| | Rua das Flores, 12, Braga              |
| | ! Nota: Portão 1234# • Cão no quintal  |
| | [ ↗ Navegar ]      [ ▶ Iniciar Visita ]|
+------------------------------------------+
| | 11:00 - 12:00   [↻ Quinzenal] [● Pago] |
| | Carlos Mendes • Vivenda Sul            |
| | [ ↗ Navegar ]      [ ✓ Concluído ]     |
+------------------------------------------+
| [Hoje] [Leads(2)] [Clientes] [Orç.] [€]  |  <- Bottom Tabs (64px)
+------------------------------------------+
```

### 4.2 Ecrã "Execução de Visita" (Modo Terreno)
```text
+------------------------------------------+
| < Voltar     Ana Silva       [● Em Curso]|
+------------------------------------------+
|           ⏱ 00:34:12  (A decorrer)       |  <- Cronómetro tabular-nums
+------------------------------------------+
| CHECKLIST (Jardinagem)                   |
| [✓] Cortar relva                         |  <- Altura 52px cada linha
| [✓] Aparar bordas                        |
| [ ] Soprar caminhos e recolher resíduos  |
+------------------------------------------+
| FOTOS (Antes / Depois)                   |
| [+ Antes] [Img1]   [+ Depois] [Img2]     |  <- Compressão <= 500KB
+------------------------------------------+
| NOTA PARA A PRÓXIMA VISITA               |
| [ Trazer fungicida para roseiras...    ] |
+------------------------------------------+
| [       ✓ CONCLUIR SERVIÇO (55,00 €)   ] |  <- CTA fixo fundo (52px)
+------------------------------------------+
```

### 4.3 Ecrã "Leads" (Funil Comercial)
```text
+------------------------------------------+
| Leads                          [+ Manual]|
+------------------------------------------+
| [Novo (2)] [Visita (1)] [Orç. (2)] [✓]   |  <- Filtros horizontais (pills)
+------------------------------------------+
| João Costa                     [Web Form]|
| 912 345 678 • Gualtar, Braga             |
| "Limpeza de terreno e poda de sebes..."  |
| [Img1] [Img2] [Img3]                     |
| [ ✕ Perdido ]        [ + Criar Orçamento]|
+------------------------------------------+
```

### 4.4 Ecrã "Finanças" (Resumo Mensal)
```text
+------------------------------------------+
| Finanças           < Novembro 2026 >     |
+------------------------------------------+
| +------------------+ +-----------------+ |
| | ENTRADAS         | | SAÍDAS          | |
| | 1.840,00 €       | | 310,00 €        | |
| +------------------+ +-----------------+ |
| +------------------+ +-----------------+ |
| | SALDO LÍQUIDO    | | PENDENTE        | |
| | +1.530,00 €      | | 220,00 € (3)    | |
| +------------------+ +-----------------+ |
| [+ Registar Despesa] [+ Registar Entrada]|
+------------------------------------------+
| MOVIMENTOS RECENTES                      |
| + 55,00 € • Ana Silva (MB WAY)     Hoje  |
| - 45,00 € • Combustível            Ontem |
+------------------------------------------+
```

### 4.5 Portal Web do Cliente (`/q/[token]` — Aprovação de Orçamento)
```text
+------------------------------------------+
|        [Logótipo do Profissional]        |  <- Cor primária da Org
|        ORÇAMENTO #ORC-2026-014           |
|        Válido até 15/12/2026             |
+------------------------------------------+
| Manutenção Mensal de Jardim     80,00 €  |
| Adubação Orgânica (150 m²)      20,00 €  |
| ---------------------------------------- |
| Subtotal                       100,00 €  |
| IVA (23%)                       23,00 €  |
| TOTAL                          123,00 €  |
+------------------------------------------+
| [     ✓ APROVAR ORÇAMENTO AGORA        ] |  <- CTA 1 clique
| [          ↓ Descarregar PDF           ] |
+------------------------------------------+
|           Com tecnologia zelvo           |
+------------------------------------------+
```
