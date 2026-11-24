import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import type {
  JobStatus,
  LeadSource,
  LeadStatus,
  PaymentMethod,
  PaymentStatus,
  QuoteStatus,
  ServiceUnit,
} from '../types/database';

export const APP_TABS = [
  { id: 'today', label: 'Hoje' },
  { id: 'leads', label: 'Leads' },
  { id: 'clients', label: 'Clientes' },
  { id: 'quotes', label: 'Orçamentos' },
  { id: 'finance', label: 'Finanças' },
] as const;

export type AppTabId = (typeof APP_TABS)[number]['id'];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: 'Novo',
  VISIT_SCHEDULED: 'Visita Agendada',
  QUOTE_SENT: 'Orçamento Enviado',
  WON: 'Fechado (Ganho)',
  LOST: 'Perdido',
};

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  WEB_FORM: 'Formulário Web',
  MANUAL: 'Registo Manual',
  WHATSAPP: 'WhatsApp',
};

export const LOST_REASONS = [
  'Preço acima do orçamento',
  'Prazo / Disponibilidade',
  'Fora da zona de atuação',
  'Sem resposta do cliente',
  'Optou por outra empresa',
  'Outro motivo',
] as const;

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  SCHEDULED: 'Agendado',
  IN_PROGRESS: 'Em Curso',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: 'Pendente',
  PAID: 'Pago',
  PARTIAL: 'Parcial',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Numerário',
  MBWAY: 'MB WAY',
  MULTIBANCO: 'Multibanco',
  TRANSFER: 'Transferência',
  CARD: 'Cartão',
  OTHER: 'Outro',
};

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  DRAFT: 'Rascunho',
  SENT: 'Enviado',
  APPROVED: 'Aprovado',
  REJECTED: 'Recusado',
  EXPIRED: 'Expirado',
};

export const SERVICE_UNIT_LABELS: Record<ServiceUnit, string> = {
  FIXED: 'Fixo',
  HOUR: 'Hora',
  SQM: 'm²',
  UNIT: 'Unidade',
};

export const EXPENSE_CATEGORIES = [
  { id: 'FUEL', label: 'Combustível' },
  { id: 'MATERIALS', label: 'Materiais' },
  { id: 'LABOR', label: 'Mão-de-obra' },
  { id: 'MAINTENANCE', label: 'Manutenção' },
  { id: 'EQUIPMENT', label: 'Equipamento' },
  { id: 'OTHER', label: 'Outros' },
] as const;

export const INVENTORY_CATEGORIES = [
  { id: 'MATERIALS', label: 'Materiais' },
  { id: 'FUEL', label: 'Combustível' },
  { id: 'MAINTENANCE', label: 'Manutenção' },
  { id: 'EQUIPMENT', label: 'Equipamento' },
  { id: 'OTHER', label: 'Outros' },
] as const;

export const INCOME_CATEGORIES = [
  { id: 'SERVICE_PAYMENT', label: 'Pagamento de Serviço' },
  { id: 'ADVANCE_PAYMENT', label: 'Adiantamento / Sinal' },
  { id: 'OTHER_INCOME', label: 'Outro Recebimento' },
] as const;

export const RECURRENCE_OPTIONS = [
  { value: '', label: 'Visita única (sem recorrência)', shortLabel: '' },
  { value: 'FREQ=WEEKLY;INTERVAL=1', label: 'Semanal (próximos 90 dias)', shortLabel: 'Semanal' },
  { value: 'FREQ=WEEKLY;INTERVAL=2', label: 'Quinzenal (próximos 90 dias)', shortLabel: 'Quinzenal' },
  { value: 'FREQ=MONTHLY;INTERVAL=1', label: 'Mensal (próximos 90 dias)', shortLabel: 'Mensal' },
] as const;

export const BILLING_FREQUENCY_LABELS: Record<
  'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY',
  string
> = {
  WEEKLY: 'Semanal',
  BIWEEKLY: 'Quinzenal',
  MONTHLY: 'Mensal',
  QUARTERLY: 'Trimestral',
};

export function getRecurrenceShortLabel(rule: string | null): string | null {
  if (!rule) return null;
  const match = RECURRENCE_OPTIONS.find((opt) => opt.value === rule);
  if (match && match.shortLabel) return match.shortLabel;
  if (rule.includes('INTERVAL=2')) return 'Quinzenal';
  if (rule.includes('WEEKLY')) return 'Semanal';
  if (rule.includes('MONTHLY')) return 'Mensal';
  return 'Recorrente';
}

export function getCategoryLabel(category: string): string {
  const normalized = category.trim().toUpperCase();
  const all = [...EXPENSE_CATEGORIES, ...INVENTORY_CATEGORIES, ...INCOME_CATEGORIES];
  const exact = all.find((c) => c.id === normalized);
  if (exact) return exact.label;
  if (normalized === 'INSUMOS') return 'Materiais';
  return category;
}

const eurFormatter = new Intl.NumberFormat('pt-PT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatEUR(value: number): string {
  return eurFormatter.format(value);
}

export function formatDatePT(isoOrDate: string | Date, pattern = "d 'de' MMM, yyyy"): string {
  const d = typeof isoOrDate === 'string' ? parseISO(isoOrDate) : isoOrDate;
  return format(d, pattern, { locale: pt });
}

export function formatShortDatePT(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? parseISO(isoOrDate) : isoOrDate;
  return format(d, 'dd/MM/yyyy', { locale: pt });
}

export function formatTimePT(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? parseISO(isoOrDate) : isoOrDate;
  return format(d, 'HH:mm', { locale: pt });
}

export function formatWeekdayHeaderPT(date: Date): string {
  const raw = format(date, "EEEE, d 'de' MMM", { locale: pt });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function formatMonthYearPT(date: Date): string {
  const raw = format(date, 'MMMM yyyy', { locale: pt });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function formatDateTimePT(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? parseISO(isoOrDate) : isoOrDate;
  return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: pt });
}

export function formatElapsedTimer(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return [hrs, mins, secs].map((v) => String(v).padStart(2, '0')).join(':');
}

export const DUNNING_STAGE_LABELS = {
  NONE: 'Por enviar',
  D0_SENT: 'D-0 · Link enviado',
  D3_REMINDER: 'D+3 · Lembrete cordial',
  D7_CRITICAL: 'D+7 · Alerta crítico',
} as const;

export const SAAS_PLANS = [
  {
    id: 'PILOT' as const,
    name: 'Piloto Gratuito',
    priceLabel: '0 €/mês',
    maxUsers: 1,
    maxClients: 15,
    description: 'Ideal para testar no terreno com gestão básica de agenda e orçamentos.',
  },
  {
    id: 'SOLO' as const,
    name: 'Solo',
    priceLabel: '19 €/mês',
    maxUsers: 1,
    maxClients: 150,
    description: 'Clientes ilimitados, cobranças MB WAY/Multibanco, faturação AT e projeções.',
  },
  {
    id: 'TEAM' as const,
    name: 'Equipa',
    priceLabel: '39 €/mês',
    maxUsers: 5,
    maxClients: 500,
    description: 'Até 5 técnicos, rotas otimizadas, stock & máquinas e campanhas de marketing.',
  },
] as const;

export const SEASONAL_CAMPAIGN_TEMPLATES = [
  {
    id: 'spring_prep',
    title: 'Preparação de Primavera',
    message:
      'Olá {nome}! A primavera está a chegar e é a altura ideal para adubação, revisão da rega e primeiro corte do jardim. Temos vagas esta semana em Braga — quer reservar uma visita?',
  },
  {
    id: 'autumn_pruning',
    title: 'Poda de Outono & Folhas',
    message:
      'Olá {nome}! Com o outono, recomendamos a poda de formação de sebes e limpeza de folhas secas para proteger o relvado antes das chuvas. Podemos agendar para a próxima semana?',
  },
  {
    id: 'land_clearing',
    title: 'Limpeza de Terreno (Prevenção)',
    message:
      'Olá {nome}! Já iniciámos as marcações de limpeza e desmatação de terrenos em conformidade com as normas municipais. Quer receber um orçamento atualizado sem compromisso?',
  },
] as const;

