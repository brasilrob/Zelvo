import React, { useMemo, useRef, useState } from 'react';
import { addMonths, format, isSameMonth, parseISO, subMonths } from 'date-fns';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Camera,
  ChevronLeft,
  ChevronRight,
  Clock,
  Receipt,
  Trash2,
  Wallet,
} from 'lucide-react';
import {
  EXPENSE_CATEGORIES,
  formatEUR,
  formatMonthYearPT,
  formatShortDatePT,
  getCategoryLabel,
  INCOME_CATEGORIES,
  PAYMENT_METHOD_LABELS,
} from '../../i18n/pt-PT';
import { useZelvo } from '../../store/ZelvoContext';
import type { PaymentMethod } from '../../types/database';
import { compressImageFile } from '../../utils/calculations';
import {
  EmptyState,
  Modal,
  PhotoLightbox,
  PrimaryButton,
} from '../common/UIPrimitives';

export const FinanceTab: React.FC = () => {
  const { db, createTransaction, softDeleteTransaction, showToast } = useZelvo();

  const [selectedMonth, setSelectedMonth] = useState<Date>(() => new Date());
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [incomeModalOpen, setIncomeModalOpen] = useState(false);
  const [lightboxReceipt, setLightboxReceipt] = useState<string | null>(null);

  const monthTransactions = useMemo(
    () =>
      db.transactions
        .filter((t) => !t.deleted_at && isSameMonth(parseISO(t.transaction_date), selectedMonth))
        .sort(
          (a, b) =>
            new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()
        ),
    [db.transactions, selectedMonth]
  );

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

    return {
      income,
      expense,
      net: income - expense,
      pendingTotal,
      pendingCount: pendingJobs.length,
    };
  }, [db.jobs, monthTransactions, selectedMonth]);

  const clientsById = useMemo(() => new Map(db.clients.map((c) => [c.id, c])), [db.clients]);

  return (
    <div className="space-y-4">
      {/* Month Navigator */}
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
            Fluxo de Caixa Mensal
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

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
      </div>

      {/* Quick Action Buttons */}
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

      {/* Recent Movements */}
      <section className="space-y-2.5">
        <h3 className="text-[16px] font-bold text-[#0F172A]">
          Movimentos de {formatMonthYearPT(selectedMonth)} ({monthTransactions.length})
        </h3>

        {monthTransactions.length === 0 ? (
          <EmptyState
            icon={<Wallet className="w-6 h-6" />}
            title="Sem movimentos neste mês"
            description="Registe pagamentos de visitas ou despesas de combustível e materiais para acompanhar o lucro real."
          />
        ) : (
          <div className="bg-white border border-[#E2E8F0] rounded-xl divide-y divide-[#E2E8F0] overflow-hidden">
            {monthTransactions.map((tx) => {
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
