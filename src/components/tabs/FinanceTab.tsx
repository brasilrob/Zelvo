import React, { useMemo, useRef, useState } from 'react';
import {
  addMonths,
  differenceInCalendarDays,
  format,
  isSameMonth,
  parseISO,
  subMonths,
} from 'date-fns';
import { pt } from 'date-fns/locale';
import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Briefcase,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  MessageCircle,
  PauseCircle,
  Percent,
  PlayCircle,
  Printer,
  Receipt,
  Repeat,
  ShieldCheck,
  Trash2,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  DUNNING_STAGE_LABELS,
  EXPENSE_CATEGORIES,
  formatEUR,
  formatMonthYearPT,
  formatShortDatePT,
  getCategoryLabel,
  INCOME_CATEGORIES,
  PAYMENT_METHOD_LABELS,
} from '../../i18n/pt-PT';
import { useZelvo } from '../../store/ZelvoContext';
import type { DunningStage, PaymentMethod, Transaction } from '../../types/database';
import { buildWhatsAppUrl, compressImageFile } from '../../utils/calculations';
import {
  exportAccountantCSV,
  exportFinanceCSV,
  exportFinancePDF,
} from '../../utils/financeExport';
import {
  buildFinancialForecast,
  type ForecastChartPoint,
  type HistoricalMonthPoint,
} from '../../utils/linearRegression';
import { calculateAllClientsProfitability } from '../../utils/profitability';
import { ATInvoiceModal } from '../common/ATInvoiceModal';
import {
  EmptyState,
  Modal,
  PhotoLightbox,
  PrimaryButton,
  StatusBadge,
} from '../common/UIPrimitives';

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ForecastChartPoint }>;
}

const SixMonthChartTooltip: React.FC<ChartTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0]?.payload;
  if (!datum) return null;

  if (datum.isForecast) {
    return (
      <div className="bg-[#0F172A] text-white rounded-xl border border-[#10B981]/60 px-3.5 py-2.5 shadow-xl text-[13px] space-y-1 tabular-nums">
        <p className="font-bold text-[14px] text-[#34D399] border-b border-slate-700 pb-1 mb-1">
          {datum.fullLabel}
        </p>
        <div className="flex items-center justify-between gap-5">
          <span className="text-emerald-300">Receita Estimada</span>
          <span className="font-semibold">{formatEUR(datum.receitaPrevista)}</span>
        </div>
        <div className="flex items-center justify-between gap-5">
          <span className="text-red-300">Custos Estimados</span>
          <span className="font-semibold">{formatEUR(datum.despesaPrevista)}</span>
        </div>
        <div className="flex items-center justify-between gap-5 pt-1 border-t border-slate-700 font-bold">
          <span className="text-slate-200">Lucro Projetado</span>
          <span className={datum.saldoPrevisto >= 0 ? 'text-[#10B981]' : 'text-red-400'}>
            {datum.saldoPrevisto >= 0 ? '+' : ''}
            {formatEUR(datum.saldoPrevisto)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#0F172A] text-white rounded-xl border border-slate-700 px-3.5 py-2.5 shadow-xl text-[13px] space-y-1 tabular-nums">
      <p className="font-bold text-[14px] text-white border-b border-slate-700 pb-1 mb-1">
        {datum.fullLabel}
      </p>
      <div className="flex items-center justify-between gap-5">
        <span className="text-emerald-300">Receitas Reais</span>
        <span className="font-semibold">{formatEUR(datum.receitas ?? 0)}</span>
      </div>
      <div className="flex items-center justify-between gap-5">
        <span className="text-red-300">Despesas Reais</span>
        <span className="font-semibold">{formatEUR(datum.despesas ?? 0)}</span>
      </div>
      <div className="flex items-center justify-between gap-5 pt-1 border-t border-slate-700 font-bold">
        <span className="text-slate-200">Saldo Líquido</span>
        <span className={(datum.saldo ?? 0) >= 0 ? 'text-[#10B981]' : 'text-red-400'}>
          {(datum.saldo ?? 0) >= 0 ? '+' : ''}
          {formatEUR(datum.saldo ?? 0)}
        </span>
      </div>
      <div className="pt-1 border-t border-slate-800 text-[11px] text-slate-400 space-y-0.5">
        <div className="flex items-center justify-between gap-4">
          <span>Tendência Receita</span>
          <span>{formatEUR(datum.receitaPrevista)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span>Tendência Custos</span>
          <span>{formatEUR(datum.despesaPrevista)}</span>
        </div>
      </div>
    </div>
  );
};

interface FinanceTabProps {
  onOpenPaymentPortal?: (jobId: string) => void;
}

export const FinanceTab: React.FC<FinanceTabProps> = ({ onOpenPaymentPortal }) => {
  const {
    db,
    organization,
    createTransaction,
    softDeleteTransaction,
    simulatePaymentWebhook,
    issueATInvoice,
    advanceDunningStage,
    togglePauseJobDunning,
    showToast,
  } = useZelvo();

  const [financeView, setFinanceView] = useState<
    'overview' | 'collections' | 'profitability' | 'projections'
  >('overview');
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => new Date());
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [incomeModalOpen, setIncomeModalOpen] = useState(false);
  const [lightboxReceipt, setLightboxReceipt] = useState<string | null>(null);
  const [atInvoiceTx, setAtInvoiceTx] = useState<Transaction | null>(null);
  const [accountantModalOpen, setAccountantModalOpen] = useState(false);
  const [accountantPrintOpen, setAccountantPrintOpen] = useState(false);

  const activeTransactions = useMemo(
    () => db.transactions.filter((t) => !t.deleted_at),
    [db.transactions]
  );

  const monthTransactions = useMemo(
    () =>
      activeTransactions
        .filter((t) => isSameMonth(parseISO(t.transaction_date), selectedMonth))
        .sort(
          (a, b) =>
            new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()
        ),
    [activeTransactions, selectedMonth]
  );

  const QUICK_CATEGORY_FILTERS = useMemo(
    () => [
      { id: 'ALL', label: 'Todas' },
      { id: 'FUEL', label: 'Combustível' },
      { id: 'MATERIALS', label: 'Materiais' },
      { id: 'LABOR', label: 'Mão-de-obra' },
      { id: 'MAINTENANCE', label: 'Manutenção' },
      { id: 'EQUIPMENT', label: 'Equipamento' },
      { id: 'SERVICE_PAYMENT', label: 'Serviços' },
      { id: 'OTHER_GROUP', label: 'Outros' },
    ],
    []
  );

  const matchesCategoryFilter = (category: string, filterId: string): boolean => {
    if (filterId === 'ALL') return true;
    if (filterId === 'OTHER_GROUP') {
      return !['FUEL', 'MATERIALS', 'LABOR', 'MAINTENANCE', 'EQUIPMENT', 'SERVICE_PAYMENT'].includes(
        category
      );
    }
    return category === filterId;
  };

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: monthTransactions.length };
    for (const f of QUICK_CATEGORY_FILTERS) {
      if (f.id === 'ALL') continue;
      counts[f.id] = monthTransactions.filter((t) =>
        matchesCategoryFilter(t.category, f.id)
      ).length;
    }
    return counts;
  }, [QUICK_CATEGORY_FILTERS, monthTransactions]);

  const filteredMonthTransactions = useMemo(
    () => monthTransactions.filter((t) => matchesCategoryFilter(t.category, categoryFilter)),
    [categoryFilter, monthTransactions]
  );

  const filteredSubtotal = useMemo(() => {
    return filteredMonthTransactions.reduce(
      (acc, tx) => acc + (tx.type === 'INCOME' ? tx.amount : -tx.amount),
      0
    );
  }, [filteredMonthTransactions]);

  const sixMonthSeries = useMemo<HistoricalMonthPoint[]>(() => {
    const months: HistoricalMonthPoint[] = [];

    for (let offset = 5; offset >= 0; offset -= 1) {
      const mDate = subMonths(selectedMonth, offset);
      let receitas = 0;
      let despesas = 0;

      for (const tx of activeTransactions) {
        if (isSameMonth(parseISO(tx.transaction_date), mDate)) {
          if (tx.type === 'INCOME') receitas += tx.amount;
          else despesas += tx.amount;
        }
      }

      const rawShort = format(mDate, 'MMM', { locale: pt }).replace('.', '');
      const label = rawShort.charAt(0).toUpperCase() + rawShort.slice(1);
      months.push({
        key: format(mDate, 'yyyy-MM'),
        monthDate: mDate,
        label,
        fullLabel: formatMonthYearPT(mDate),
        receitas: Math.round(receitas * 100) / 100,
        despesas: Math.round(despesas * 100) / 100,
        saldo: Math.round((receitas - despesas) * 100) / 100,
      });
    }

    return months;
  }, [activeTransactions, selectedMonth]);

  const sixMonthSummary = useMemo(() => {
    const totalIncome = sixMonthSeries.reduce((acc, m) => acc + m.receitas, 0);
    const totalExpense = sixMonthSeries.reduce((acc, m) => acc + m.despesas, 0);
    const net = totalIncome - totalExpense;
    const marginPct = totalIncome > 0 ? Math.round((net / totalIncome) * 100) : 0;
    return { totalIncome, totalExpense, net, marginPct };
  }, [sixMonthSeries]);

  const forecast = useMemo(
    () => buildFinancialForecast(sixMonthSeries, 3),
    [sixMonthSeries]
  );

  const fitConfidenceLabel = useMemo(() => {
    const avgR2 = (forecast.revenueModel.rSquared + forecast.expenseModel.rSquared) / 2;
    if (avgR2 >= 0.7) return { label: 'Elevada', tone: 'success' as const };
    if (avgR2 >= 0.4) return { label: 'Moderada', tone: 'info' as const };
    return { label: 'Tendência Inicial', tone: 'warning' as const };
  }, [forecast.expenseModel.rSquared, forecast.revenueModel.rSquared]);

  const kpis = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const t of monthTransactions) {
      if (t.type === 'INCOME') income += t.amount;
      else expense += t.amount;
    }

    const pendingJobs = db.jobs.filter(
      (j) =>
        !j.deleted_at &&
        j.status !== 'CANCELLED' &&
        j.payment_status !== 'PAID' &&
        isSameMonth(parseISO(j.scheduled_start), selectedMonth)
    );
    const pendingTotal = pendingJobs.reduce((acc, j) => acc + j.price, 0);

    // Dynamic KPI 1: Average Monthly Revenue across all months with recorded income
    const monthlyRevenueMap = new Map<string, number>();
    let allTimeIncome = 0;
    let allTimeExpense = 0;
    for (const tx of activeTransactions) {
      const monthKey = tx.transaction_date.slice(0, 7);
      if (tx.type === 'INCOME') {
        allTimeIncome += tx.amount;
        monthlyRevenueMap.set(monthKey, (monthlyRevenueMap.get(monthKey) ?? 0) + tx.amount);
      } else {
        allTimeExpense += tx.amount;
      }
    }
    const activeRevenueMonths = monthlyRevenueMap.size;
    const avgMonthlyRevenue =
      activeRevenueMonths > 0 ? allTimeIncome / activeRevenueMonths : 0;

    // Dynamic KPI 2: Projected Profit Margin (incorporating realized + pending receivables)
    const totalPendingAllMonths = db.jobs
      .filter((j) => !j.deleted_at && j.status !== 'CANCELLED' && j.payment_status !== 'PAID')
      .reduce((acc, j) => acc + j.price, 0);

    const projectedRevenue = allTimeIncome + totalPendingAllMonths;
    const projectedProfit = projectedRevenue - allTimeExpense;
    const projectedMarginPct =
      projectedRevenue > 0 ? (projectedProfit / projectedRevenue) * 100 : 0;

    const projectedMonthlyNet = avgMonthlyRevenue * (projectedMarginPct / 100);

    return {
      income,
      expense,
      net: income - expense,
      pendingTotal,
      pendingCount: pendingJobs.length,
      avgMonthlyRevenue,
      activeRevenueMonths,
      projectedMarginPct,
      projectedMonthlyNet,
    };
  }, [activeTransactions, db.jobs, monthTransactions, selectedMonth]);

  const clientsById = useMemo(() => new Map(db.clients.map((c) => [c.id, c])), [db.clients]);

  const clientsProfitability = useMemo(
    () =>
      calculateAllClientsProfitability({
        clients: db.clients,
        jobs: db.jobs,
        transactions: db.transactions,
        users: db.users,
        inventoryItems: db.inventory_items,
      }),
    [db.clients, db.inventory_items, db.jobs, db.transactions, db.users]
  );

  const profitabilityTotals = useMemo(() => {
    const revenue = clientsProfitability.reduce((sum, c) => sum + c.revenue, 0);
    const materialsCost = clientsProfitability.reduce((sum, c) => sum + c.materialsCost, 0);
    const laborCost = clientsProfitability.reduce((sum, c) => sum + c.laborCost, 0);
    const netProfit = revenue - materialsCost - laborCost;
    const marginPct = revenue > 0 ? Math.round((netProfit / revenue) * 1000) / 10 : 0;
    return { revenue, materialsCost, laborCost, netProfit, marginPct };
  }, [clientsProfitability]);

  // Phase 2: Monthly Retainer Revenue (MRR)
  const retainerClients = useMemo(
    () =>
      db.clients.filter(
        (c) => !c.deleted_at && !c.is_anonymized && c.is_retainer && (c.retainer_amount ?? 0) > 0
      ),
    [db.clients]
  );

  const mrrTotal = useMemo(
    () => retainerClients.reduce((sum, c) => sum + (c.retainer_amount ?? 0), 0),
    [retainerClients]
  );

  // Phase 2: Dunning / Collections Queue (Completed & Unpaid Jobs)
  const pendingCollectionJobs = useMemo(() => {
    const today = new Date();
    return db.jobs
      .filter(
        (j) =>
          !j.deleted_at &&
          j.status === 'COMPLETED' &&
          j.payment_status !== 'PAID'
      )
      .map((job) => {
        const refDate = parseISO(job.checkout_at || job.scheduled_start);
        const daysOverdue = Math.max(0, differenceInCalendarDays(today, refDate));
        const computedStage: DunningStage =
          job.dunning_stage && job.dunning_stage !== 'NONE'
            ? job.dunning_stage
            : daysOverdue >= 7
              ? 'D7_CRITICAL'
              : daysOverdue >= 3
                ? 'D3_REMINDER'
                : 'D0_SENT';
        return { job, daysOverdue, computedStage };
      })
      .sort((a, b) => b.daysOverdue - a.daysOverdue);
  }, [db.jobs]);

  const handleOpenOrIssueAT = (tx: Transaction) => {
    if (tx.external_invoice_id && tx.atcud) {
      setAtInvoiceTx(tx);
      return;
    }
    const issued = issueATInvoice(tx.id);
    if (issued) {
      setAtInvoiceTx(issued);
    }
  };

  return (
    <div className="space-y-4">
      {/* Sub-navigation: Fluxo Mensal | Cobranças | Projeções */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex items-center p-1 rounded-xl bg-slate-200/80 border border-[#CBD5E1] overflow-x-auto max-w-full"
          role="tablist"
          aria-label="Vistas financeiras"
        >
          <button
            type="button"
            role="tab"
            aria-selected={financeView === 'overview'}
            onClick={() => setFinanceView('overview')}
            className={`min-h-[42px] px-3.5 rounded-lg text-[14px] sm:text-[15px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              financeView === 'overview'
                ? 'bg-white text-[#0F172A] shadow-xs'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            Fluxo Mensal
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={financeView === 'collections'}
            onClick={() => setFinanceView('collections')}
            className={`min-h-[42px] px-3.5 rounded-lg text-[14px] sm:text-[15px] font-semibold transition-colors whitespace-nowrap inline-flex items-center gap-1.5 cursor-pointer ${
              financeView === 'collections'
                ? 'bg-white text-[#0F172A] shadow-xs'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            <CreditCard className="w-4 h-4 text-[#B45309]" />
            <span>Cobranças</span>
            {pendingCollectionJobs.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-[#DC2626] text-white text-[11px] font-bold tabular-nums">
                {pendingCollectionJobs.length}
              </span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={financeView === 'profitability'}
            onClick={() => setFinanceView('profitability')}
            className={`min-h-[42px] px-3.5 rounded-lg text-[14px] sm:text-[15px] font-semibold transition-colors whitespace-nowrap inline-flex items-center gap-1.5 cursor-pointer ${
              financeView === 'profitability'
                ? 'bg-white text-[#0F172A] shadow-xs'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            <Users className="w-4 h-4 text-[#0F766E]" />
            <span>Rentabilidade</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={financeView === 'projections'}
            onClick={() => setFinanceView('projections')}
            className={`min-h-[42px] px-3.5 rounded-lg text-[14px] sm:text-[15px] font-semibold transition-colors whitespace-nowrap inline-flex items-center gap-1.5 cursor-pointer ${
              financeView === 'projections'
                ? 'bg-white text-[#0F172A] shadow-xs'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            <TrendingUp className="w-4 h-4 text-[#059669]" />
            <span>Projeções</span>
          </button>
        </div>

        <p className="text-[13px] font-medium text-[#475569] tabular-nums">
          MRR Avenças:{' '}
          <strong className="text-[#0F766E]">{formatEUR(mrrTotal)}/mês</strong> · Próx. mês:{' '}
          <strong className="text-[#15803D]">
            {formatEUR(forecast.nextMonth.estimatedRevenue)}
          </strong>
        </p>
      </div>

      {/* CLIENT PROFITABILITY SUB-TAB */}
      {financeView === 'profitability' && (
        <div className="space-y-4">
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-[#475569]">
                Receita Recebida
              </p>
              <p className="text-[20px] sm:text-[22px] font-extrabold text-[#15803D] tabular-nums mt-1">
                {formatEUR(profitabilityTotals.revenue)}
              </p>
            </div>
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-[#475569]">
                Insumos / Mat.
              </p>
              <p className="text-[20px] sm:text-[22px] font-extrabold text-[#B91C1C] tabular-nums mt-1">
                -{formatEUR(profitabilityTotals.materialsCost)}
              </p>
            </div>
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-[#475569]">
                Mão de Obra
              </p>
              <p className="text-[20px] sm:text-[22px] font-extrabold text-[#B45309] tabular-nums mt-1">
                -{formatEUR(profitabilityTotals.laborCost)}
              </p>
              <p className="text-[11px] text-[#64748B] mt-0.5">Cronómetro × custo/h</p>
            </div>
            <div className="bg-[#0F172A] text-white rounded-xl p-4">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-300">
                Lucro Líquido Real
              </p>
              <p
                className={`text-[20px] sm:text-[22px] font-extrabold tabular-nums mt-1 ${
                  profitabilityTotals.netProfit >= 0 ? 'text-[#34D399]' : 'text-[#FCA5A5]'
                }`}
              >
                {profitabilityTotals.netProfit >= 0 ? '+' : ''}
                {formatEUR(profitabilityTotals.netProfit)}
              </p>
              <p className="text-[12px] text-slate-300 tabular-nums mt-0.5">
                Margem global: {profitabilityTotals.marginPct.toFixed(1).replace('.', ',')}%
              </p>
            </div>
          </section>

          <section className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
            <div className="px-4 py-3.5 border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-[16px] font-bold text-[#0F172A]">
                  Lucro Real por Cliente
                </h3>
                <p className="text-[13px] text-[#475569]">
                  Receita Recebida − Insumos/Materiais − Custo de Mão de Obra (tempo real das visitas)
                </p>
              </div>
              <StatusBadge
                tone="teal"
                label={`${clientsProfitability.length} clientes`}
              />
            </div>

            {clientsProfitability.length === 0 ? (
              <div className="p-6 text-center text-[14px] text-[#475569]">
                Ainda não existem clientes com movimentos financeiros registados.
              </div>
            ) : (
              <div className="divide-y divide-[#E2E8F0]">
                {clientsProfitability.map((row) => (
                  <div
                    key={row.clientId}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[15px] font-bold text-[#0F172A] truncate">
                          {row.clientName}
                        </p>
                        <StatusBadge
                          tone={
                            row.revenue === 0
                              ? 'neutral'
                              : row.marginPct >= 50
                                ? 'success'
                                : row.marginPct >= 25
                                  ? 'warning'
                                  : 'danger'
                          }
                          label={
                            row.revenue > 0
                              ? `${row.marginPct.toFixed(1).replace('.', ',')}% margem`
                              : 'Sem receita'
                          }
                        />
                      </div>
                      <p className="text-[13px] text-[#475569] tabular-nums">
                        {row.completedJobsCount}{' '}
                        {row.completedJobsCount === 1 ? 'visita concluída' : 'visitas concluídas'}
                        {row.trackedMinutes > 0 ? ` · ${row.trackedMinutes} min cronometrados` : ''}
                      </p>
                    </div>

                    <div className="grid grid-cols-4 gap-2 sm:gap-4 text-right tabular-nums text-[13px] shrink-0">
                      <div>
                        <span className="block text-[11px] text-[#64748B]">Receita</span>
                        <span className="font-bold text-[#15803D]">{formatEUR(row.revenue)}</span>
                      </div>
                      <div>
                        <span className="block text-[11px] text-[#64748B]">Insumos</span>
                        <span className="font-semibold text-[#B91C1C]">
                          -{formatEUR(row.materialsCost)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[11px] text-[#64748B]">Mão Obra</span>
                        <span className="font-semibold text-[#B45309]">
                          -{formatEUR(row.laborCost)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[11px] text-[#64748B]">Lucro Real</span>
                        <span
                          className={`font-extrabold ${
                            row.netProfit >= 0 ? 'text-[#0F172A]' : 'text-[#B91C1C]'
                          }`}
                        >
                          {row.netProfit >= 0 ? '+' : ''}
                          {formatEUR(row.netProfit)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* COLLECTIONS & DUNNING SUB-TAB */}
      {financeView === 'collections' && (
        <div className="space-y-4">
          {/* MRR + Pending Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-[#1E293B] text-white rounded-xl p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-medium text-slate-300 flex items-center gap-1.5">
                  <Repeat className="w-4 h-4 text-[#14B8A6]" />
                  <span>Receita Mensal Recorrente (MRR · Avenças)</span>
                </p>
                <p className="font-display text-[26px] font-bold text-[#10B981] tabular-nums mt-1">
                  {formatEUR(mrrTotal)}
                </p>
                <p className="text-[12px] text-slate-300 mt-0.5">
                  {retainerClients.length}{' '}
                  {retainerClients.length === 1 ? 'cliente em avença' : 'clientes em avença'}{' '}
                  ativa (configurável na ficha do Cliente)
                </p>
              </div>
            </div>

            <div className="bg-white border border-[#FDE68A] rounded-xl p-4">
              <p className="text-[13px] font-semibold text-[#B45309] flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                <span>Total em Cobrança ({pendingCollectionJobs.length})</span>
              </p>
              <p className="font-display text-[26px] font-bold text-[#B91C1C] tabular-nums mt-1">
                {formatEUR(
                  pendingCollectionJobs.reduce((acc, item) => acc + item.job.price, 0)
                )}
              </p>
              <p className="text-[12px] text-[#475569] mt-0.5">
                Régua automática: D-0 (Link) → D+3 (Cordial) → D+7 (Crítico + Pausa)
              </p>
            </div>
          </div>

          {pendingCollectionJobs.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="w-6 h-6 text-[#15803D]" />}
              title="Sem pagamentos pendentes!"
              description="Todos os serviços concluídos já foram liquidados pelos clientes."
            />
          ) : (
            <div className="space-y-3">
              {pendingCollectionJobs.map(({ job, daysOverdue, computedStage }) => {
                const client = clientsById.get(job.client_id);
                const isCritical = daysOverdue >= 7 || computedStage === 'D7_CRITICAL';
                const nextStage: DunningStage =
                  computedStage === 'D0_SENT'
                    ? 'D3_REMINDER'
                    : computedStage === 'D3_REMINDER'
                      ? 'D7_CRITICAL'
                      : 'D7_CRITICAL';
                const payLink = `${window.location.origin}/pay/${job.id}`;
                const dunningMsg = isCritical
                  ? `Olá ${client?.name ?? 'Cliente'}, verificamos que o pagamento de ${formatEUR(job.price)} referente ao serviço "${job.title}" encontra-se com ${daysOverdue} dias de atraso. Para evitarmos pausar a próxima visita, pode regularizar por MB WAY ou Multibanco aqui: ${payLink}`
                  : daysOverdue >= 3
                    ? `Olá ${client?.name ?? 'Cliente'}, enviamos um lembrete cordial relativamente ao serviço "${job.title}" (${formatEUR(job.price)}). Pode pagar facilmente por MB WAY ou Multibanco neste link: ${payLink}`
                    : `Olá ${client?.name ?? 'Cliente'}, obrigado pela preferência na ${organization.name}! Segue o link para pagamento rápido do serviço "${job.title}" (${formatEUR(job.price)}) via MB WAY ou Multibanco: ${payLink}`;

                return (
                  <article
                    key={job.id}
                    className={`bg-white rounded-xl border border-l-4 p-4 space-y-3 ${
                      isCritical
                        ? 'border-[#FCA5A5] border-l-[#DC2626]'
                        : daysOverdue >= 3
                          ? 'border-[#FDE68A] border-l-[#D97706]'
                          : 'border-[#E2E8F0] border-l-[#0369A1]'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-[17px] font-bold text-[#0F172A]">
                            {client?.name ?? 'Cliente'}
                          </h4>
                          <StatusBadge
                            tone={isCritical ? 'danger' : daysOverdue >= 3 ? 'warning' : 'info'}
                            label={DUNNING_STAGE_LABELS[computedStage]}
                          />
                          {job.dunning_paused && (
                            <StatusBadge tone="danger" label="Próxima Visita Pausada" />
                          )}
                        </div>
                        <p className="text-[14px] text-[#475569] mt-0.5 tabular-nums">
                          {job.title} · Concluído há{' '}
                          <strong className={isCritical ? 'text-[#B91C1C]' : 'text-[#0F172A]'}>
                            {daysOverdue} {daysOverdue === 1 ? 'dia' : 'dias'}
                          </strong>
                        </p>
                      </div>
                      <p className="text-[20px] font-extrabold text-[#0F172A] tabular-nums">
                        {formatEUR(job.price)}
                      </p>
                    </div>

                    {/* 3-Step Dunning Bar */}
                    <div className="grid grid-cols-3 gap-1.5 text-[12px] font-semibold">
                      {(['D0_SENT', 'D3_REMINDER', 'D7_CRITICAL'] as const).map((step, i) => {
                        const activeIdx =
                          computedStage === 'D7_CRITICAL'
                            ? 2
                            : computedStage === 'D3_REMINDER'
                              ? 1
                              : 0;
                        const reached = i <= activeIdx;
                        return (
                          <div
                            key={step}
                            className={`px-2.5 py-1.5 rounded-lg border text-center ${
                              reached
                                ? i === 2
                                  ? 'bg-[#FEE2E2] border-[#FCA5A5] text-[#B91C1C]'
                                  : i === 1
                                    ? 'bg-[#FEF3C7] border-[#FDE68A] text-[#B45309]'
                                    : 'bg-[#E0F2FE] border-[#BAE6FD] text-[#0369A1]'
                                : 'bg-slate-50 border-[#E2E8F0] text-[#94A3B8]'
                            }`}
                          >
                            {i === 0 ? 'D-0 Link' : i === 1 ? 'D+3 Cordial' : 'D+7 Crítico'}
                          </div>
                        );
                      })}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <a
                        href={buildWhatsAppUrl(client?.phone ?? '910000000', dunningMsg)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => advanceDunningStage(job.id, nextStage)}
                        className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 min-h-11 px-3.5 rounded-[10px] bg-[#10B981] hover:bg-[#059669] text-white text-[14px] font-semibold whitespace-nowrap"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>Enviar WhatsApp</span>
                      </a>

                      {onOpenPaymentPortal && (
                        <button
                          type="button"
                          onClick={() => onOpenPaymentPortal(job.id)}
                          className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 min-h-11 px-3.5 rounded-[10px] border border-[#CBD5E1] bg-white hover:bg-slate-50 text-[#0F172A] text-[14px] font-semibold cursor-pointer whitespace-nowrap"
                        >
                          <ExternalLink className="w-4 h-4 text-[#0369A1]" />
                          <span>Abrir /pay</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          simulatePaymentWebhook({
                            jobId: job.id,
                            amount: job.price,
                            method: 'MBWAY',
                          })
                        }
                        className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 min-h-11 px-3.5 rounded-[10px] bg-[#1E293B] hover:bg-slate-800 text-white text-[14px] font-semibold cursor-pointer whitespace-nowrap"
                      >
                        <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                        <span>Marcar Pago</span>
                      </button>

                      {isCritical && (
                        <button
                          type="button"
                          onClick={() => togglePauseJobDunning(job.id, !job.dunning_paused)}
                          className={`w-full sm:w-auto inline-flex items-center justify-center gap-1.5 min-h-11 px-3.5 rounded-[10px] border text-[14px] font-semibold cursor-pointer whitespace-nowrap ${
                            job.dunning_paused
                              ? 'bg-[#DCFCE7] border-[#BBF7D0] text-[#15803D]'
                              : 'bg-[#FEE2E2] border-[#FECACA] text-[#B91C1C]'
                          }`}
                        >
                          {job.dunning_paused ? (
                            <>
                              <PlayCircle className="w-4 h-4" />
                              <span>Retomar Próxima Visita</span>
                            </>
                          ) : (
                            <>
                              <PauseCircle className="w-4 h-4" />
                              <span>Pausar Próxima Visita</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* Active Retainers List */}
          {retainerClients.length > 0 && (
            <section className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-2.5">
              <h4 className="text-[15px] font-bold text-[#0F172A] flex items-center gap-2">
                <Repeat className="w-4 h-4 text-[#0F766E]" />
                <span>Avenças Mensais Ativas ({retainerClients.length})</span>
              </h4>
              <div className="divide-y divide-[#E2E8F0]">
                {retainerClients.map((c) => (
                  <div
                    key={c.id}
                    className="py-2.5 flex items-center justify-between gap-3 text-[14px]"
                  >
                    <div>
                      <p className="font-bold text-[#0F172A]">{c.name}</p>
                      <p className="text-[12px] text-[#475569] tabular-nums">
                        Dia de cobrança: dia {c.retainer_billing_day ?? 5} de cada mês
                      </p>
                    </div>
                    <span className="font-extrabold text-[#0F766E] tabular-nums">
                      {formatEUR(c.retainer_amount ?? 0)}/mês
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Month Navigator (shown on Fluxo Mensal & Projeções) */}
      {financeView !== 'collections' && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl px-4 py-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setSelectedMonth((prev) => subMonths(prev, 1))}
            aria-label="Mês anterior"
            className="min-h-[44px] min-w-[44px] rounded-lg border border-[#CBD5E1] flex items-center justify-center text-[#0F172A] hover:bg-slate-50 cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="text-center">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-[#475569]">
              {financeView === 'projections'
                ? 'Base Histórica de Projeção (6 Meses até)'
                : 'Fluxo de Caixa Mensal'}
            </p>
            <h2 className="text-[19px] font-bold text-[#0F172A] tabular-nums">
              {formatMonthYearPT(selectedMonth)}
            </h2>
          </div>

          <button
            type="button"
            onClick={() => setSelectedMonth((prev) => addMonths(prev, 1))}
            aria-label="Mês seguinte"
            className="min-h-[44px] min-w-[44px] rounded-lg border border-[#CBD5E1] flex items-center justify-center text-[#0F172A] hover:bg-slate-50 cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* DEDICATED PROJECTIONS VIEW (Linear Regression Forecast) */}
      {financeView === 'projections' && (
        <div className="space-y-4">
          {/* Next Month Linear Regression KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-[#BBF7D0] rounded-xl p-4">
              <p className="text-[13px] font-semibold text-[#15803D]">
                Receita Est. ({formatMonthYearPT(forecast.nextMonth.monthDate)})
              </p>
              <p className="font-display text-[22px] sm:text-[26px] font-bold text-[#15803D] tabular-nums mt-1">
                {formatEUR(forecast.nextMonth.estimatedRevenue)}
              </p>
              <p className="text-[12px] text-[#475569] tabular-nums mt-0.5 flex items-center gap-1">
                {forecast.revenueModel.slope >= 0 ? (
                  <TrendingUp className="w-3.5 h-3.5 text-[#15803D] shrink-0" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-[#B91C1C] shrink-0" />
                )}
                <span>
                  {forecast.revenueModel.slope >= 0 ? '+' : ''}
                  {formatEUR(forecast.revenueModel.slope)}/mês
                </span>
              </p>
            </div>

            <div className="bg-white border border-[#FECACA] rounded-xl p-4">
              <p className="text-[13px] font-semibold text-[#B91C1C]">
                Custos Est. ({formatMonthYearPT(forecast.nextMonth.monthDate)})
              </p>
              <p className="font-display text-[22px] sm:text-[26px] font-bold text-[#B91C1C] tabular-nums mt-1">
                {formatEUR(forecast.nextMonth.estimatedExpense)}
              </p>
              <p className="text-[12px] text-[#475569] tabular-nums mt-0.5">
                Tendência: {forecast.expenseModel.slope >= 0 ? '+' : ''}
                {formatEUR(forecast.expenseModel.slope)}/mês
              </p>
            </div>

            <div className="bg-[#1E293B] text-white border border-slate-700 rounded-xl p-4">
              <p className="text-[13px] font-medium text-slate-300">
                Lucro Projetado (Próx. Mês)
              </p>
              <p
                className={`font-display text-[22px] sm:text-[26px] font-bold tabular-nums mt-1 ${
                  forecast.nextMonth.estimatedProfit >= 0 ? 'text-[#10B981]' : 'text-red-400'
                }`}
              >
                {forecast.nextMonth.estimatedProfit >= 0 ? '+' : ''}
                {formatEUR(forecast.nextMonth.estimatedProfit)}
              </p>
              <p className="text-[12px] text-slate-300 tabular-nums mt-0.5">
                vs. mês base: {forecast.nextMonth.profitDeltaVsLast >= 0 ? '+' : ''}
                {formatEUR(forecast.nextMonth.profitDeltaVsLast)}
              </p>
            </div>

            <div className="bg-white border border-[#99F6E4] rounded-xl p-4">
              <p className="text-[13px] font-semibold text-[#0F766E] flex items-center gap-1">
                <Activity className="w-3.5 h-3.5 shrink-0" />
                <span>Margem Estimada</span>
              </p>
              <p
                className={`font-display text-[22px] sm:text-[26px] font-bold tabular-nums mt-1 ${
                  forecast.nextMonth.estimatedMarginPct >= 0
                    ? 'text-[#0F766E]'
                    : 'text-[#B91C1C]'
                }`}
              >
                {forecast.nextMonth.estimatedMarginPct.toFixed(1).replace('.', ',')}%
              </p>
              <p className="text-[12px] text-[#475569] tabular-nums mt-0.5">
                Confiança: {fitConfidenceLabel.label}
              </p>
            </div>
          </div>

          {/* Linear Regression Forecast Chart (Bars + Dashed Forecast Lines) */}
          <section className="bg-white border border-[#E2E8F0] rounded-xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[17px] font-bold text-[#0F172A] flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-[#10B981] shrink-0" />
                    <span>Projeção por Regressão Linear (Próx. 3 Meses)</span>
                  </h3>
                  <StatusBadge
                    tone={fitConfidenceLabel.tone}
                    label={`Ajuste: ${fitConfidenceLabel.label}`}
                  />
                </div>
                <p className="text-[14px] text-[#475569] mt-0.5">
                  Linhas tracejadas projetam receitas e custos com base nos 6 meses históricos.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] font-semibold text-[#475569]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-[#10B981]" aria-hidden="true" />
                  Receitas Reais
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-[#DC2626]" aria-hidden="true" />
                  Custos Reais
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="w-5 border-t-2 border-dashed border-[#059669]"
                    aria-hidden="true"
                  />
                  Prev. Receitas
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="w-5 border-t-2 border-dashed border-[#B91C1C]"
                    aria-hidden="true"
                  />
                  Prev. Custos
                </span>
              </div>
            </div>

            <div className="w-full h-[270px] sm:h-[310px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={forecast.fullProjectionChart}
                  margin={{ top: 12, right: 12, left: -8, bottom: 4 }}
                  barGap={5}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#475569', fontSize: 12, fontWeight: 600 }}
                    dy={6}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    width={62}
                    tick={{ fill: '#475569', fontSize: 12 }}
                    tickFormatter={(val: number) =>
                      val >= 1000 ? `${(val / 1000).toFixed(1)}k €` : `${val} €`
                    }
                  />
                  <Tooltip
                    content={<SixMonthChartTooltip />}
                    cursor={{ fill: '#F1F5F9', radius: 6 }}
                  />
                  {forecast.lastHistoricalLabel && (
                    <ReferenceLine
                      x={forecast.lastHistoricalLabel}
                      stroke="#94A3B8"
                      strokeDasharray="4 4"
                      label={{
                        value: 'Previsão →',
                        position: 'insideTopRight',
                        fill: '#475569',
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    />
                  )}
                  <Bar
                    dataKey="receitas"
                    name="Receitas Reais"
                    fill="#10B981"
                    fillOpacity={0.85}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={26}
                  />
                  <Bar
                    dataKey="despesas"
                    name="Custos Reais"
                    fill="#DC2626"
                    fillOpacity={0.85}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={26}
                  />
                  <Line
                    type="linear"
                    dataKey="receitaPrevista"
                    name="Projeção Receitas"
                    stroke="#059669"
                    strokeWidth={2.5}
                    strokeDasharray="6 4"
                    dot={{ r: 4, fill: '#FFFFFF', stroke: '#059669', strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: '#059669', stroke: '#FFFFFF', strokeWidth: 2 }}
                  />
                  <Line
                    type="linear"
                    dataKey="despesaPrevista"
                    name="Projeção Custos"
                    stroke="#B91C1C"
                    strokeWidth={2.5}
                    strokeDasharray="6 4"
                    dot={{ r: 4, fill: '#FFFFFF', stroke: '#B91C1C', strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: '#B91C1C', stroke: '#FFFFFF', strokeWidth: 2 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* 3-Month Forecast Breakdown Table */}
          <section className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
            <div className="px-4 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between gap-2">
              <h3 className="text-[16px] font-bold text-[#0F172A]">
                Estimativa Mensal Projetada (Regressão Linear)
              </h3>
              <span className="text-[12px] font-semibold text-[#475569]">
                Valores em EUR (€)
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[12px] font-bold uppercase tracking-wide text-[#475569]">
                    <th className="py-3 px-4">Mês Projetado</th>
                    <th className="py-3 px-4 text-right">Receita Est.</th>
                    <th className="py-3 px-4 text-right">Custos Est.</th>
                    <th className="py-3 px-4 text-right">Lucro Est.</th>
                    <th className="py-3 px-4 text-right">Margem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] text-[14px] tabular-nums">
                  {forecast.horizon.map((item) => (
                    <tr
                      key={item.key}
                      className={item.step === 1 ? 'bg-[#DCFCE7]/35 font-semibold' : ''}
                    >
                      <td className="py-3.5 px-4 text-[#0F172A]">
                        <div className="flex items-center gap-2">
                          <span>{formatMonthYearPT(item.monthDate)}</span>
                          {item.step === 1 && (
                            <span className="px-2 py-0.5 rounded-full bg-[#DCFCE7] text-[#15803D] text-[11px] font-bold">
                              Próximo Mês
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-semibold text-[#15803D]">
                        {formatEUR(item.estimatedRevenue)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-semibold text-[#B91C1C]">
                        {formatEUR(item.estimatedExpense)}
                      </td>
                      <td
                        className={`py-3.5 px-4 text-right font-bold ${
                          item.estimatedProfit >= 0 ? 'text-[#0F172A]' : 'text-[#B91C1C]'
                        }`}
                      >
                        {item.estimatedProfit >= 0 ? '+' : ''}
                        {formatEUR(item.estimatedProfit)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-semibold text-[#0F766E]">
                        {item.estimatedMarginPct.toFixed(1).replace('.', ',')}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Statistical Model Parameters Summary */}
          <section className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-[15px] font-bold text-[#0F172A]">
                Parâmetros do Modelo (Mínimos Quadrados Ordinários)
              </h4>
              <button
                type="button"
                onClick={() => setFinanceView('overview')}
                className="text-[14px] font-semibold text-[#059669] hover:underline cursor-pointer"
              >
                Voltar aos movimentos mensais
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[13px] tabular-nums">
              <div className="bg-white border border-[#E2E8F0] rounded-lg p-3">
                <p className="text-[#475569] font-medium">Tendência de Receitas</p>
                <p className="text-[16px] font-bold text-[#15803D] mt-0.5">
                  {forecast.revenueModel.slope >= 0 ? '+' : ''}
                  {formatEUR(forecast.revenueModel.slope)} / mês
                </p>
                <p className="text-[12px] text-[#475569] mt-0.5">
                  Ajuste R² = {(forecast.revenueModel.rSquared * 100).toFixed(0)}%
                </p>
              </div>
              <div className="bg-white border border-[#E2E8F0] rounded-lg p-3">
                <p className="text-[#475569] font-medium">Tendência de Custos</p>
                <p className="text-[16px] font-bold text-[#B91C1C] mt-0.5">
                  {forecast.expenseModel.slope >= 0 ? '+' : ''}
                  {formatEUR(forecast.expenseModel.slope)} / mês
                </p>
                <p className="text-[12px] text-[#475569] mt-0.5">
                  Ajuste R² = {(forecast.expenseModel.rSquared * 100).toFixed(0)}%
                </p>
              </div>
              <div className="bg-white border border-[#E2E8F0] rounded-lg p-3">
                <p className="text-[#475569] font-medium">Base Histórica Analisada</p>
                <p className="text-[16px] font-bold text-[#0F172A] mt-0.5">
                  {forecast.revenueModel.sampleSize} meses consecutivos
                </p>
                <p className="text-[12px] text-[#475569] mt-0.5">
                  Atualizado em tempo real com cada movimento
                </p>
              </div>
            </div>
          </section>
        </div>
      )}

      {financeView === 'overview' && (
        <>

      {/* 6 KPI Cards (4 Monthly + 2 Dynamic Profitability Indicators) */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <p className="text-[13px] font-semibold text-[#475569]">Entradas</p>
          <p className="font-display text-[22px] sm:text-[26px] font-bold text-[#15803D] tabular-nums mt-1">
            {formatEUR(kpis.income)}
          </p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
          <p className="text-[13px] font-semibold text-[#475569]">Saídas</p>
          <p className="font-display text-[22px] sm:text-[26px] font-bold text-[#B91C1C] tabular-nums mt-1">
            {formatEUR(kpis.expense)}
          </p>
        </div>

        <div className="bg-[#1E293B] text-white border border-slate-700 rounded-xl p-4">
          <p className="text-[13px] font-medium text-slate-300">Saldo Líquido</p>
          <p
            className={`font-display text-[22px] sm:text-[26px] font-bold tabular-nums mt-1 ${
              kpis.net >= 0 ? 'text-[#10B981]' : 'text-red-400'
            }`}
          >
            {kpis.net >= 0 ? '+' : ''}
            {formatEUR(kpis.net)}
          </p>
        </div>

        <div className="bg-white border border-[#FDE68A] rounded-xl p-4">
          <p className="text-[13px] font-semibold text-[#B45309] flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            <span>Pendente ({kpis.pendingCount})</span>
          </p>
          <p className="font-display text-[22px] sm:text-[26px] font-bold text-[#B45309] tabular-nums mt-1">
            {formatEUR(kpis.pendingTotal)}
          </p>
        </div>

        <div className="bg-white border border-[#BAE6FD] rounded-xl p-4">
          <p className="text-[13px] font-semibold text-[#0369A1] flex items-center gap-1">
            <BarChart3 className="w-3.5 h-3.5 shrink-0" />
            <span>Média Faturação / Mês</span>
          </p>
          <p className="font-display text-[22px] sm:text-[26px] font-bold text-[#0F172A] tabular-nums mt-1">
            {formatEUR(kpis.avgMonthlyRevenue)}
          </p>
          <p className="text-[12px] text-[#475569] tabular-nums mt-0.5">
            Base: {kpis.activeRevenueMonths}{' '}
            {kpis.activeRevenueMonths === 1 ? 'mês ativo' : 'meses ativos'}
          </p>
        </div>

        <div className="bg-white border border-[#99F6E4] rounded-xl p-4">
          <p className="text-[13px] font-semibold text-[#0F766E] flex items-center gap-1">
            <Percent className="w-3.5 h-3.5 shrink-0" />
            <span>Margem Lucro Projetada</span>
          </p>
          <p
            className={`font-display text-[22px] sm:text-[26px] font-bold tabular-nums mt-1 ${
              kpis.projectedMarginPct >= 0 ? 'text-[#0F766E]' : 'text-[#B91C1C]'
            }`}
          >
            {kpis.projectedMarginPct.toFixed(1).replace('.', ',')}%
          </p>
          <p className="text-[12px] text-[#475569] tabular-nums mt-0.5">
            Lucro est./mês: {formatEUR(kpis.projectedMonthlyNet)}
          </p>
        </div>
      </div>

      {/* 6-Month Revenue vs Expenses Chart + Linear Regression Forecast Dashed Line (Recharts) */}
      <section className="bg-white border border-[#E2E8F0] rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-[17px] font-bold text-[#0F172A] flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#10B981] shrink-0" />
              <span>Receitas vs. Despesas (6 Meses + Previsão)</span>
            </h3>
            <p className="text-[14px] text-[#475569] tabular-nums mt-0.5">
              Resultado acumulado:{' '}
              <strong
                className={
                  sixMonthSummary.net >= 0 ? 'text-[#15803D]' : 'text-[#B91C1C]'
                }
              >
                {sixMonthSummary.net >= 0 ? '+' : ''}
                {formatEUR(sixMonthSummary.net)}
              </strong>{' '}
              · Margem {sixMonthSummary.marginPct}%
            </p>
          </div>

          <button
            type="button"
            onClick={() => setFinanceView('projections')}
            className="min-h-[40px] px-3 rounded-lg bg-[#DCFCE7] hover:bg-[#BBF7D0] text-[#15803D] text-[13px] font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <span>Ver Projeções</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] font-semibold text-[#475569]">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-[#10B981]" aria-hidden="true" />
            Receitas
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-[#DC2626]" aria-hidden="true" />
            Despesas
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="w-5 border-t-2 border-dashed border-[#059669]"
              aria-hidden="true"
            />
            Previsão Receita
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="w-5 border-t-2 border-dashed border-[#B91C1C]"
              aria-hidden="true"
            />
            Previsão Custos
          </span>
        </div>

        <div className="w-full h-[255px] sm:h-[285px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={forecast.sixMonthPlusNextChart}
              margin={{ top: 10, right: 10, left: -8, bottom: 4 }}
              barGap={6}
              onClick={(state) => {
                const idx =
                  typeof state?.activeTooltipIndex === 'number'
                    ? state.activeTooltipIndex
                    : -1;
                const clicked =
                  idx >= 0 ? forecast.sixMonthPlusNextChart[idx] : undefined;
                if (clicked && !clicked.isForecast) {
                  setSelectedMonth(clicked.monthDate);
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#475569', fontSize: 12, fontWeight: 600 }}
                dy={6}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                width={62}
                tick={{ fill: '#475569', fontSize: 12 }}
                tickFormatter={(val: number) =>
                  val >= 1000 ? `${(val / 1000).toFixed(1)}k €` : `${val} €`
                }
              />
              <Tooltip
                content={<SixMonthChartTooltip />}
                cursor={{ fill: '#F1F5F9', radius: 6 }}
              />
              {forecast.lastHistoricalLabel && (
                <ReferenceLine
                  x={forecast.lastHistoricalLabel}
                  stroke="#CBD5E1"
                  strokeDasharray="4 4"
                />
              )}
              <Bar
                dataKey="receitas"
                name="Receitas"
                fill="#10B981"
                radius={[6, 6, 0, 0]}
                maxBarSize={30}
                className="cursor-pointer"
              />
              <Bar
                dataKey="despesas"
                name="Despesas"
                fill="#DC2626"
                radius={[6, 6, 0, 0]}
                maxBarSize={30}
                className="cursor-pointer"
              />
              <Line
                type="linear"
                dataKey="receitaPrevista"
                name="Previsão Receita"
                stroke="#059669"
                strokeWidth={2.25}
                strokeDasharray="6 4"
                dot={{ r: 3.5, fill: '#FFFFFF', stroke: '#059669', strokeWidth: 2 }}
                activeDot={{ r: 5.5, fill: '#059669', stroke: '#FFFFFF', strokeWidth: 2 }}
              />
              <Line
                type="linear"
                dataKey="despesaPrevista"
                name="Previsão Custos"
                stroke="#B91C1C"
                strokeWidth={2.25}
                strokeDasharray="6 4"
                dot={{ r: 3.5, fill: '#FFFFFF', stroke: '#B91C1C', strokeWidth: 2 }}
                activeDot={{ r: 5.5, fill: '#B91C1C', stroke: '#FFFFFF', strokeWidth: 2 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <p className="text-[12px] text-[#475569]">
          Linha tracejada calculada por regressão linear. Toque numa coluna histórica para abrir esse mês.
        </p>
      </section>

      {/* Quick Action Buttons + CSV / PDF Export */}
      <div className="space-y-2.5">
        <div className="grid grid-cols-2 gap-3">
          <PrimaryButton
            variant="secondary"
            fullWidth
            onClick={() => setExpenseModalOpen(true)}
            icon={<ArrowUpRight className="w-5 h-5 text-[#B91C1C]" />}
          >
            Nova Despesa
          </PrimaryButton>
          <PrimaryButton
            fullWidth
            onClick={() => setIncomeModalOpen(true)}
            icon={<ArrowDownLeft className="w-5 h-5" />}
          >
            Novo Recebimento
          </PrimaryButton>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-3 flex flex-wrap items-center justify-between gap-2.5">
          <div className="text-[14px]">
            <p className="font-bold text-[#0F172A]">Exportar Relatório Financeiro</p>
            <p className="text-[13px] text-[#475569]">
              {formatMonthYearPT(selectedMonth)}
              {categoryFilter !== 'ALL'
                ? ` · Rubrica: ${
                    QUICK_CATEGORY_FILTERS.find((c) => c.id === categoryFilter)?.label ?? ''
                  }`
                : ' · Receitas, despesas e evolução 6 meses'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setAccountantModalOpen(true)}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 min-h-[48px] px-3.5 rounded-[10px] bg-[#10B981] hover:bg-[#059669] text-white text-[14px] font-bold transition-colors whitespace-nowrap cursor-pointer"
            >
              <Briefcase className="w-4 h-4 shrink-0" />
              <span>Exportar para Contabilista</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const activeLabel =
                  categoryFilter === 'ALL'
                    ? undefined
                    : QUICK_CATEGORY_FILTERS.find((c) => c.id === categoryFilter)?.label;
                exportFinanceCSV({
                  transactions: filteredMonthTransactions,
                  clientsById,
                  periodLabel: formatMonthYearPT(selectedMonth),
                  categoryLabel: activeLabel,
                  organizationSlug: organization.slug,
                });
                showToast('Relatório financeiro exportado em CSV.', 'success');
              }}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 min-h-[48px] px-3.5 rounded-[10px] border border-[#CBD5E1] bg-white text-[#0F172A] text-[14px] font-semibold hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#15803D]" />
              <span>CSV</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const activeLabel =
                  categoryFilter === 'ALL'
                    ? undefined
                    : QUICK_CATEGORY_FILTERS.find((c) => c.id === categoryFilter)?.label;
                exportFinancePDF({
                  organization,
                  periodLabel: formatMonthYearPT(selectedMonth),
                  categoryLabel: activeLabel,
                  kpis: {
                    income: kpis.income,
                    expense: kpis.expense,
                    net: kpis.net,
                    pendingTotal: kpis.pendingTotal,
                    pendingCount: kpis.pendingCount,
                    avgMonthlyRevenue: kpis.avgMonthlyRevenue,
                    projectedMarginPct: kpis.projectedMarginPct,
                  },
                  transactions: filteredMonthTransactions,
                  clientsById,
                  sixMonthSeries: sixMonthSeries.map((m) => ({
                    fullLabel: m.fullLabel,
                    receitas: m.receitas,
                    despesas: m.despesas,
                    saldo: m.saldo,
                  })),
                });
                showToast('Relatório detalhado gerado em PDF.', 'success');
              }}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 min-h-[48px] px-3.5 rounded-[10px] bg-[#1E293B] hover:bg-slate-800 text-white text-[14px] font-semibold transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download className="w-4 h-4 text-[#10B981]" />
              <span>PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* Recent Movements + Quick Category Filters */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[16px] font-bold text-[#0F172A]">
            Movimentos de {formatMonthYearPT(selectedMonth)} ({filteredMonthTransactions.length})
          </h3>
          {categoryFilter !== 'ALL' && (
            <p className="text-[14px] font-semibold text-[#475569] tabular-nums">
              Subtotal da rubrica:{' '}
              <span
                className={
                  filteredSubtotal >= 0 ? 'text-[#15803D]' : 'text-[#B91C1C]'
                }
              >
                {filteredSubtotal >= 0 ? '+' : '-'}
                {formatEUR(Math.abs(filteredSubtotal))}
              </span>
            </p>
          )}
        </div>

        {/* Horizontal Quick Category Filter Bar */}
        <div
          className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1"
          role="group"
          aria-label="Filtrar movimentos por categoria"
        >
          {QUICK_CATEGORY_FILTERS.map((cat) => {
            const isActive = categoryFilter === cat.id;
            const count = categoryCounts[cat.id] ?? 0;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                className={`min-h-[42px] px-3.5 rounded-xl border text-[14px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-[#1E293B] text-white border-[#1E293B]'
                    : 'bg-white text-[#0F172A] border-[#CBD5E1] hover:bg-slate-50'
                }`}
              >
                <span>{cat.label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[12px] font-bold tabular-nums ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-[#475569]'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {filteredMonthTransactions.length === 0 ? (
          <EmptyState
            icon={<Wallet className="w-6 h-6" />}
            title={
              categoryFilter === 'ALL'
                ? 'Sem movimentos neste mês'
                : 'Sem movimentos nesta rubrica'
            }
            description={
              categoryFilter === 'ALL'
                ? 'Registe pagamentos de visitas ou despesas de combustível, materiais e mão-de-obra para acompanhar o lucro real.'
                : 'Não existem lançamentos registados nesta categoria durante o mês selecionado.'
            }
            actionLabel={categoryFilter !== 'ALL' ? 'Ver todas as categorias' : undefined}
            onAction={categoryFilter !== 'ALL' ? () => setCategoryFilter('ALL') : undefined}
          />
        ) : (
          <div className="bg-white border border-[#E2E8F0] rounded-xl divide-y divide-[#E2E8F0] overflow-hidden">
            {filteredMonthTransactions.map((tx) => {
              const isIncome = tx.type === 'INCOME';
              const client = tx.client_id ? clientsById.get(tx.client_id) : null;
              return (
                <div
                  key={tx.id}
                  className="p-4 flex items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        isIncome
                          ? 'bg-[#DCFCE7] text-[#15803D]'
                          : 'bg-[#FEE2E2] text-[#B91C1C]'
                      }`}
                    >
                      {isIncome ? (
                        <ArrowDownLeft className="w-5 h-5" />
                      ) : (
                        <ArrowUpRight className="w-5 h-5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[15px] font-bold text-[#0F172A] truncate">
                        {tx.description || getCategoryLabel(tx.category)}
                      </p>
                      <p className="text-[13px] text-[#475569] tabular-nums">
                        {getCategoryLabel(tx.category)} ·{' '}
                        {PAYMENT_METHOD_LABELS[tx.payment_method]}
                        {client ? ` · ${client.name}` : ''} ·{' '}
                        {formatShortDatePT(tx.transaction_date)}
                      </p>
                      {isIncome && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          {tx.external_invoice_id && tx.atcud ? (
                            <button
                              type="button"
                              onClick={() => handleOpenOrIssueAT(tx)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#DCFCE7] hover:bg-[#BBF7D0] text-[#15803D] text-[12px] font-bold tabular-nums cursor-pointer"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>{tx.external_invoice_id} (AT)</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenOrIssueAT(tx)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[#CBD5E1] bg-slate-50 hover:bg-slate-100 text-[#0F172A] text-[12px] font-semibold cursor-pointer"
                            >
                              <ShieldCheck className="w-3.5 h-3.5 text-[#059669]" />
                              <span>Emitir Fatura-Recibo (AT)</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {tx.receipt_path && (
                      <button
                        type="button"
                        onClick={() => setLightboxReceipt(tx.receipt_path)}
                        aria-label="Ver talão"
                        className="min-h-[40px] min-w-[40px] rounded-lg border border-[#CBD5E1] flex items-center justify-center text-[#0369A1] hover:bg-slate-50 cursor-pointer"
                      >
                        <Receipt className="w-4 h-4" />
                      </button>
                    )}
                    <span
                      className={`text-[16px] font-bold tabular-nums ${
                        isIncome ? 'text-[#15803D]' : 'text-[#B91C1C]'
                      }`}
                    >
                      {isIncome ? '+' : '-'}
                      {formatEUR(tx.amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => softDeleteTransaction(tx.id)}
                      aria-label="Remover movimento"
                      className="min-h-[40px] min-w-[40px] rounded-lg text-[#475569] hover:text-[#B91C1C] hover:bg-red-50 flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
        </>
      )}

      {/* New Expense Modal */}
      <ExpenseModal
        open={expenseModalOpen}
        onClose={() => setExpenseModalOpen(false)}
        onSave={(payload) => {
          createTransaction({ ...payload, type: 'EXPENSE' });
          setExpenseModalOpen(false);
        }}
        onError={(msg) => showToast(msg, 'danger')}
      />

      {/* New Income Modal */}
      <IncomeModal
        open={incomeModalOpen}
        onClose={() => setIncomeModalOpen(false)}
        onSave={(payload) => {
          createTransaction({ ...payload, type: 'INCOME' });
          setIncomeModalOpen(false);
        }}
      />

      <PhotoLightbox
        src={lightboxReceipt}
        caption="Talão / Comprovativo de Despesa"
        onClose={() => setLightboxReceipt(null)}
      />

      <ATInvoiceModal
        open={Boolean(atInvoiceTx)}
        onClose={() => setAtInvoiceTx(null)}
        transaction={atInvoiceTx}
        organization={organization}
        client={atInvoiceTx?.client_id ? clientsById.get(atInvoiceTx.client_id) ?? null : null}
      />

      {/* Accountant Export Selector Modal */}
      <Modal
        open={accountantModalOpen}
        onClose={() => setAccountantModalOpen(false)}
        title="Exportação Mensal para o Contabilista"
        subtitle={`${formatMonthYearPT(selectedMonth)} · ${monthTransactions.length} movimentos contabilísticos`}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3 text-center tabular-nums">
            <div>
              <p className="text-[11px] font-semibold uppercase text-[#475569]">Entradas</p>
              <p className="text-[16px] font-bold text-[#15803D]">{formatEUR(kpis.income)}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase text-[#475569]">Saídas</p>
              <p className="text-[16px] font-bold text-[#B91C1C]">{formatEUR(kpis.expense)}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase text-[#475569]">IVA Est. (23%)</p>
              <p className="text-[16px] font-bold text-[#0F172A]">
                {formatEUR(kpis.income - kpis.income / 1.23)}
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => {
                exportAccountantCSV({
                  transactions: monthTransactions,
                  clientsById,
                  periodLabel: formatMonthYearPT(selectedMonth),
                  organizationName: organization.name,
                  organizationNif: organization.nif,
                  organizationSlug: organization.slug,
                });
                showToast('Ficheiro CSV (Excel UTF-8) exportado para o contabilista.', 'success');
                setAccountantModalOpen(false);
              }}
              className="w-full min-h-[60px] p-4 rounded-xl border border-[#CBD5E1] bg-white hover:bg-[#F8FAFC] flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-[#DCFCE7] text-[#15803D] flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[15px] font-bold text-[#0F172A]">
                    Descarregar CSV (Excel)
                  </p>
                  <p className="text-[13px] text-[#475569]">
                    UTF-8 com BOM · Data, Tipo, Categoria, Cliente, NIF, Método, Valor e Fatura AT / ATCUD
                  </p>
                </div>
              </div>
              <Download className="w-5 h-5 text-[#475569] shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => {
                setAccountantModalOpen(false);
                setAccountantPrintOpen(true);
              }}
              className="w-full min-h-[60px] p-4 rounded-xl border border-[#CBD5E1] bg-white hover:bg-[#F8FAFC] flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-[#E0F2FE] text-[#0369A1] flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[15px] font-bold text-[#0F172A]">
                    Relatório PDF Mensal
                  </p>
                  <p className="text-[13px] text-[#475569]">
                    Vista pronta a imprimir com resumo de Entradas, Saídas, IVA estimado e tabela completa
                  </p>
                </div>
              </div>
              <Printer className="w-5 h-5 text-[#475569] shrink-0" />
            </button>
          </div>
        </div>
      </Modal>

      {/* Clean Printable Monthly Accountant Report Modal (window.print) */}
      <Modal
        open={accountantPrintOpen}
        onClose={() => setAccountantPrintOpen(false)}
        title={`Relatório Mensal Contabilista · ${formatMonthYearPT(selectedMonth)}`}
        size="xl"
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E2E8F0] no-print">
            <p className="text-[13px] text-[#475569]">
              Pronto para guardar em PDF ou imprimir diretamente para o seu contabilista.
            </p>
            <PrimaryButton
              onClick={() => window.print()}
              icon={<Printer className="w-4 h-4" />}
            >
              Imprimir / Guardar PDF
            </PrimaryButton>
          </div>

          <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-[#E2E8F0]">
              <div>
                <h2 className="text-[20px] font-extrabold text-[#0F172A]">
                  {organization.name}
                </h2>
                <p className="text-[13px] text-[#475569] tabular-nums">
                  {organization.nif ? `NIF: ${organization.nif}` : 'NIF não configurado'}
                  {organization.email ? ` · ${organization.email}` : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[12px] font-bold uppercase tracking-wider text-[#059669]">
                  Fecho Mensal para Contabilidade
                </p>
                <p className="text-[16px] font-bold text-[#0F172A]">
                  {formatMonthYearPT(selectedMonth)}
                </p>
                <p className="text-[12px] text-[#64748B] tabular-nums">
                  Emitido a {format(new Date(), 'dd/MM/yyyy HH:mm')}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 tabular-nums">
              <div className="rounded-lg border border-[#E2E8F0] p-3 bg-[#F8FAFC]">
                <p className="text-[11px] font-semibold uppercase text-[#475569]">
                  Total Entradas
                </p>
                <p className="text-[18px] font-extrabold text-[#15803D] mt-0.5">
                  {formatEUR(kpis.income)}
                </p>
              </div>
              <div className="rounded-lg border border-[#E2E8F0] p-3 bg-[#F8FAFC]">
                <p className="text-[11px] font-semibold uppercase text-[#475569]">
                  Total Saídas
                </p>
                <p className="text-[18px] font-extrabold text-[#B91C1C] mt-0.5">
                  {formatEUR(kpis.expense)}
                </p>
              </div>
              <div className="rounded-lg border border-[#E2E8F0] p-3 bg-[#F8FAFC]">
                <p className="text-[11px] font-semibold uppercase text-[#475569]">
                  Saldo Líquido
                </p>
                <p className="text-[18px] font-extrabold text-[#0F172A] mt-0.5">
                  {kpis.net >= 0 ? '+' : ''}
                  {formatEUR(kpis.net)}
                </p>
              </div>
              <div className="rounded-lg border border-[#E2E8F0] p-3 bg-[#F8FAFC]">
                <p className="text-[11px] font-semibold uppercase text-[#475569]">
                  IVA Estimado (23%)
                </p>
                <p className="text-[18px] font-extrabold text-[#0F766E] mt-0.5">
                  {formatEUR(kpis.income - kpis.income / 1.23)}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[13px] tabular-nums">
                <thead>
                  <tr className="border-b-2 border-[#0F172A] text-[#0F172A]">
                    <th className="py-2 pr-2 font-bold">Data</th>
                    <th className="py-2 pr-2 font-bold">Tipo</th>
                    <th className="py-2 pr-2 font-bold">Categoria</th>
                    <th className="py-2 pr-2 font-bold">Cliente / Descrição</th>
                    <th className="py-2 pr-2 font-bold">NIF</th>
                    <th className="py-2 pr-2 font-bold">Método</th>
                    <th className="py-2 pr-2 font-bold">Fatura AT / ATCUD</th>
                    <th className="py-2 text-right font-bold">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {monthTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-[#64748B]">
                        Sem movimentos registados em {formatMonthYearPT(selectedMonth)}.
                      </td>
                    </tr>
                  ) : (
                    monthTransactions.map((tx) => {
                      const client = tx.client_id ? clientsById.get(tx.client_id) : undefined;
                      const isIncome = tx.type === 'INCOME';
                      return (
                        <tr key={tx.id}>
                          <td className="py-2 pr-2 whitespace-nowrap">
                            {formatShortDatePT(tx.transaction_date)}
                          </td>
                          <td className="py-2 pr-2 font-semibold">
                            {isIncome ? 'Entrada' : 'Saída'}
                          </td>
                          <td className="py-2 pr-2">{getCategoryLabel(tx.category)}</td>
                          <td className="py-2 pr-2">
                            {client?.name ?? tx.description ?? '—'}
                          </td>
                          <td className="py-2 pr-2">{client?.nif ?? '—'}</td>
                          <td className="py-2 pr-2">
                            {PAYMENT_METHOD_LABELS[tx.payment_method]}
                          </td>
                          <td className="py-2 pr-2 font-mono text-[11px]">
                            {tx.external_invoice_id
                              ? `${tx.external_invoice_id}${tx.atcud ? ` · ${tx.atcud}` : ''}`
                              : '—'}
                          </td>
                          <td
                            className={`py-2 text-right font-bold whitespace-nowrap ${
                              isIncome ? 'text-[#15803D]' : 'text-[#B91C1C]'
                            }`}
                          >
                            {isIncome ? '+' : '-'}
                            {formatEUR(tx.amount)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

interface ExpenseModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (payload: {
    category: string;
    amount: number;
    payment_method: PaymentMethod;
    transaction_date: string;
    description?: string | null;
    receipt_path?: string | null;
  }) => void;
  onError: (msg: string) => void;
}

const ExpenseModal: React.FC<ExpenseModalProps> = ({ open, onClose, onSave, onError }) => {
  const [category, setCategory] = useState<string>('FUEL');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CARD');
  const [dateStr, setDateStr] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [description, setDescription] = useState('');
  const [receiptDataUrl, setReceiptDataUrl] = useState<string | null>(null);
  const [receiptSizeKb, setReceiptSizeKb] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const compressed = await compressImageFile(file);
      setReceiptDataUrl(compressed.dataUrl);
      setReceiptSizeKb(compressed.sizeKb);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao carregar foto do talão.');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      onError('Indique um valor de despesa superior a 0 €.');
      return;
    }
    onSave({
      category,
      amount: numericAmount,
      payment_method: method,
      transaction_date: dateStr,
      description: description.trim() || null,
      receipt_path: receiptDataUrl,
    });
    setAmount('');
    setDescription('');
    setReceiptDataUrl(null);
    setReceiptSizeKb(null);
  };

  return (
    <Modal open={open} onClose={onClose} title="Registar Despesa">
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
              Categoria *
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full min-h-12 px-3 rounded-[10px] border border-[#CBD5E1] bg-white text-[15px]"
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
              Valor (€) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="45.00"
              className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px] tabular-nums"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
              Data
            </label>
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="w-full min-h-12 px-3 rounded-[10px] border border-[#CBD5E1] text-[15px] tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
              Método
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className="w-full min-h-12 px-3 rounded-[10px] border border-[#CBD5E1] bg-white text-[15px]"
            >
              {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
            Descrição
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex.: Gasóleo carrinha (Galp)"
            className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px]"
          />
        </div>

        <div>
          <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
            Foto do Talão (opcional)
          </label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void handleReceiptUpload(e)}
          />
          {receiptDataUrl ? (
            <div className="flex items-center gap-3 p-2.5 rounded-xl border border-[#CBD5E1] bg-[#F8FAFC]">
              <img
                src={receiptDataUrl}
                alt="Talão anexado"
                className="w-14 h-14 rounded-lg object-cover border border-[#CBD5E1]"
              />
              <div className="flex-1 text-[13px] text-[#475569] tabular-nums">
                <p className="font-semibold text-[#0F172A]">Talão anexado</p>
                <p>Comprimido para {receiptSizeKb} KB</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setReceiptDataUrl(null);
                  setReceiptSizeKb(null);
                }}
                className="min-h-[40px] px-3 rounded-lg text-[13px] font-semibold text-[#B91C1C] hover:bg-red-50 cursor-pointer"
              >
                Remover
              </button>
            </div>
          ) : (
            <PrimaryButton
              type="button"
              variant="secondary"
              fullWidth
              onClick={() => fileRef.current?.click()}
              icon={<Camera className="w-4 h-4 text-[#10B981]" />}
            >
              Fotografar / Anexar Talão
            </PrimaryButton>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <PrimaryButton type="button" variant="secondary" fullWidth onClick={onClose}>
            Cancelar
          </PrimaryButton>
          <PrimaryButton type="submit" fullWidth>
            Guardar Despesa
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
};

interface IncomeModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (payload: {
    job_id?: string | null;
    client_id?: string | null;
    category: string;
    amount: number;
    payment_method: PaymentMethod;
    transaction_date: string;
    description?: string | null;
  }) => void;
}

const IncomeModal: React.FC<IncomeModalProps> = ({ open, onClose, onSave }) => {
  const { db } = useZelvo();
  const pendingJobs = useMemo(
    () =>
      db.jobs.filter(
        (j) => !j.deleted_at && j.status !== 'CANCELLED' && j.payment_status !== 'PAID'
      ),
    [db.jobs]
  );
  const clientsById = useMemo(() => new Map(db.clients.map((c) => [c.id, c])), [db.clients]);

  const [selectedJobId, setSelectedJobId] = useState('');
  const [category, setCategory] = useState('SERVICE_PAYMENT');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('MBWAY');
  const [dateStr, setDateStr] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [description, setDescription] = useState('');

  const handleSelectJob = (jobId: string) => {
    setSelectedJobId(jobId);
    const job = pendingJobs.find((j) => j.id === jobId);
    if (job) {
      const client = clientsById.get(job.client_id);
      setAmount(job.price.toFixed(2));
      setDescription(`${job.title}${client ? ` — ${client.name}` : ''}`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return;
    const job = pendingJobs.find((j) => j.id === selectedJobId);

    onSave({
      job_id: job?.id ?? null,
      client_id: job?.client_id ?? null,
      category,
      amount: numericAmount,
      payment_method: method,
      transaction_date: dateStr,
      description: description.trim() || null,
    });
    setSelectedJobId('');
    setAmount('');
    setDescription('');
  };

  return (
    <Modal open={open} onClose={onClose} title="Registar Recebimento">
      <form onSubmit={handleSubmit} className="space-y-3.5">
        {pendingJobs.length > 0 && (
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
              Associar a Visita Pendente (opcional)
            </label>
            <select
              value={selectedJobId}
              onChange={(e) => handleSelectJob(e.target.value)}
              className="w-full min-h-12 px-3 rounded-[10px] border border-[#CBD5E1] bg-white text-[15px]"
            >
              <option value="">Recebimento avulso (sem visita)</option>
              {pendingJobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {clientsById.get(j.client_id)?.name ?? 'Cliente'} · {j.title} (
                  {formatEUR(j.price)})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
              Valor (€) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="75.00"
              className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px] tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
              Método
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className="w-full min-h-12 px-3 rounded-[10px] border border-[#CBD5E1] bg-white text-[15px]"
            >
              {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
              Categoria
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full min-h-12 px-3 rounded-[10px] border border-[#CBD5E1] bg-white text-[15px]"
            >
              {INCOME_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
              Data
            </label>
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="w-full min-h-12 px-3 rounded-[10px] border border-[#CBD5E1] text-[15px] tabular-nums"
            />
          </div>
        </div>

        <div>
          <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
            Descrição
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex.: Pagamento manutenção mensal"
            className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px]"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <PrimaryButton type="button" variant="secondary" fullWidth onClick={onClose}>
            Cancelar
          </PrimaryButton>
          <PrimaryButton type="submit" fullWidth>
            Guardar Recebimento
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
};
