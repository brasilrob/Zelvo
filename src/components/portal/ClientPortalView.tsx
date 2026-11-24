import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  CreditCard,
  FileCheck2,
  FileText,
  History,
  KeyRound,
  Lock,
  MessageCircle,
  Printer,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  UserCheck,
  Zap,
} from 'lucide-react';
import {
  formatEUR,
  formatShortDatePT,
  QUOTE_STATUS_LABELS,
  SERVICE_UNIT_LABELS,
} from '../../i18n/pt-PT';
import { useZelvo } from '../../store/ZelvoContext';
import {
  publicLeadInputSchema,
  type PaymentMethod,
  type Transaction,
} from '../../types/database';
import {
  buildWhatsAppUrl,
  calculateQuoteTotals,
  compressImageFile,
  isQuoteExpired,
  roundCurrency,
} from '../../utils/calculations';
import { ATInvoiceModal } from '../common/ATInvoiceModal';
import { QuotePrintModal } from '../common/QuotePrintModal';
import { PhotoLightbox, PrimaryButton, StatusBadge } from '../common/UIPrimitives';
import { ZelvoLogo } from '../common/ZelvoLogo';

export type PortalRouteMode =
  | 'lead_form'
  | 'quote_approval'
  | 'service_payment'
  | 'client_history'
  | 'invite_accept';

interface ClientPortalViewProps {
  initialMode?: PortalRouteMode;
  initialQuoteToken?: string | null;
  initialJobId?: string | null;
  initialInviteToken?: string | null;
  onExit: () => void;
}

function generateMultibancoReference(seed: string): string {
  let hash = 5381;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 33) ^ seed.charCodeAt(i);
  }
  const num = Math.abs(hash) % 900000000 + 100000000;
  const str = String(num);
  return `${str.slice(0, 3)} ${str.slice(3, 6)} ${str.slice(6, 9)}`;
}

/* --- Reusable Portugal Payment Simulator (MB WAY, Multibanco 11249, Cartão) --- */
interface PortugalPaymentSimulatorProps {
  amount: number;
  seedKey: string;
  accent: string;
  ctaLabel?: string;
  onWebhookConfirmed: (method: PaymentMethod, reference: string) => void;
}

const PortugalPaymentSimulator: React.FC<PortugalPaymentSimulatorProps> = ({
  amount,
  seedKey,
  accent,
  ctaLabel = 'Simular Webhook de Pagamento Confirmado',
  onWebhookConfirmed,
}) => {
  const [method, setMethod] = useState<'MBWAY' | 'MULTIBANCO' | 'CARD'>('MBWAY');
  const [mbwayPhone, setMbwayPhone] = useState('912 345 678');
  const [mbwayRequested, setMbwayRequested] = useState(false);
  const [cardNumber, setCardNumber] = useState('4532 •••• •••• 8910');
  const [cardExpiry, setCardExpiry] = useState('09/28');

  const mbReference = useMemo(() => generateMultibancoReference(seedKey), [seedKey]);

  const handleTriggerWebhook = () => {
    const cleanRef =
      method === 'MBWAY'
        ? `MBW-${mbwayPhone.replace(/\D/g, '').slice(-4) || '9100'}-${Date.now().toString().slice(-4)}`
        : method === 'MULTIBANCO'
          ? `MB-11249-${mbReference.replace(/\s/g, '')}`
          : `CARD-${Date.now().toString().slice(-6)}`;
    onWebhookConfirmed(method, cleanRef);
  };

  return (
    <div className="rounded-2xl border border-[#CBD5E1] bg-[#F8FAFC] p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-wider text-[#0F766E]">
            Pagamento Seguro · Portugal
          </p>
          <p className="text-[16px] font-bold text-[#0F172A]">
            Montante a liquidar:{' '}
            <span className="tabular-nums" style={{ color: accent }}>
              {formatEUR(amount)}
            </span>
          </p>
        </div>
        <StatusBadge tone="teal" label="SSL 256-bit" icon={<ShieldCheck className="w-3.5 h-3.5" />} />
      </div>

      {/* Method Selector */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { id: 'MBWAY' as const, label: 'MB WAY', icon: Smartphone },
          { id: 'MULTIBANCO' as const, label: 'Multibanco', icon: Building2 },
          { id: 'CARD' as const, label: 'Cartão', icon: CreditCard },
        ].map((opt) => {
          const Icon = opt.icon;
          const active = method === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                setMethod(opt.id);
                setMbwayRequested(false);
              }}
              className={`min-h-12 px-2.5 rounded-xl border text-[13px] sm:text-[14px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                active
                  ? 'bg-[#1E293B] text-white border-[#1E293B]'
                  : 'bg-white text-[#0F172A] border-[#CBD5E1] hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>

      {/* MB WAY Panel */}
      {method === 'MBWAY' && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 space-y-3">
          <div>
            <label className="block text-[13px] font-semibold text-[#0F172A] mb-1">
              N.º de Telemóvel associado ao MB WAY
            </label>
            <input
              type="tel"
              value={mbwayPhone}
              onChange={(e) => setMbwayPhone(e.target.value)}
              placeholder="912 345 678"
              className="w-full min-h-12 px-3.5 rounded-xl border border-[#CBD5E1] text-[16px] font-semibold tabular-nums"
            />
          </div>

          {!mbwayRequested ? (
            <PrimaryButton
              type="button"
              variant="secondary"
              fullWidth
              onClick={() => setMbwayRequested(true)}
              icon={<Smartphone className="w-4 h-4 text-[#10B981]" />}
            >
              Confirmar no Telemóvel ({mbwayPhone || 'MB WAY'})
            </PrimaryButton>
          ) : (
            <div className="rounded-xl bg-[#FEF3C7] border border-[#FDE68A] p-3.5 text-[14px] text-[#92400E] space-y-1">
              <p className="font-bold">Notificação enviada para a app MB WAY!</p>
              <p>
                Tem 4 minutos para aceitar o pagamento de{' '}
                <strong className="tabular-nums">{formatEUR(amount)}</strong> no telemóvel{' '}
                <span className="tabular-nums">{mbwayPhone}</span>.
              </p>
            </div>
          )}
        </div>
      )}

      {/* MULTIBANCO Panel */}
      {method === 'MULTIBANCO' && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 space-y-2.5">
          <p className="text-[13px] font-semibold text-[#475569]">
            Efetue o pagamento em qualquer caixa Multibanco ou Homebanking:
          </p>
          <div className="grid grid-cols-3 gap-2 text-center bg-[#F8FAFC] rounded-xl p-3 border border-[#CBD5E1] tabular-nums">
            <div>
              <p className="text-[11px] font-bold uppercase text-[#64748B]">Entidade</p>
              <p className="text-[18px] font-extrabold text-[#0F172A] mt-0.5">11249</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase text-[#64748B]">Referência</p>
              <p className="text-[16px] sm:text-[18px] font-extrabold text-[#0F172A] mt-0.5">
                {mbReference}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase text-[#64748B]">Valor</p>
              <p className="text-[18px] font-extrabold text-[#059669] mt-0.5">
                {formatEUR(amount)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* CARD Panel */}
      {method === 'CARD' && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 space-y-3">
          <div>
            <label className="block text-[13px] font-semibold text-[#0F172A] mb-1">
              Número do Cartão (Visa / Mastercard)
            </label>
            <input
              type="text"
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
              className="w-full min-h-12 px-3.5 rounded-xl border border-[#CBD5E1] text-[15px] tabular-nums"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-semibold text-[#0F172A] mb-1">
                Validade
              </label>
              <input
                type="text"
                value={cardExpiry}
                onChange={(e) => setCardExpiry(e.target.value)}
                className="w-full min-h-12 px-3.5 rounded-xl border border-[#CBD5E1] text-[15px] tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#0F172A] mb-1">
                CVC
              </label>
              <input
                type="text"
                defaultValue="482"
                className="w-full min-h-12 px-3.5 rounded-xl border border-[#CBD5E1] text-[15px] tabular-nums"
              />
            </div>
          </div>
        </div>
      )}

      {/* Webhook Simulation Button */}
      <button
        type="button"
        onClick={handleTriggerWebhook}
        className="w-full min-h-[52px] px-4 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white font-bold text-[15px] flex items-center justify-center gap-2 transition-colors cursor-pointer"
      >
        <Zap className="w-5 h-5 shrink-0" />
        <span>{ctaLabel}</span>
      </button>
    </div>
  );
};

export const ClientPortalView: React.FC<ClientPortalViewProps> = ({
  initialMode = 'quote_approval',
  initialQuoteToken = null,
  initialJobId = null,
  initialInviteToken = null,
  onExit,
}) => {
  const {
    db,
    organization,
    createLead,
    approveQuoteByToken,
    simulatePaymentWebhook,
    issueATInvoice,
    acceptTeamInvitation,
    setCurrentUserId,
    showToast,
  } = useZelvo();

  const [portalRoute, setPortalRoute] = useState<PortalRouteMode>(initialMode);

  // Quotes available to test in /q/[token]
  const activeQuotes = useMemo(() => db.quotes.filter((q) => !q.deleted_at), [db.quotes]);

  const defaultQuoteToken = useMemo(() => {
    if (initialQuoteToken) return initialQuoteToken;
    const withPackages = activeQuotes.find(
      (q) => q.status === 'SENT' && q.packages && q.packages.length > 0
    );
    const sent = activeQuotes.find((q) => q.status === 'SENT');
    return withPackages?.public_token ?? sent?.public_token ?? activeQuotes[0]?.public_token ?? '';
  }, [activeQuotes, initialQuoteToken]);

  const [selectedToken, setSelectedToken] = useState<string>(defaultQuoteToken);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [printOpen, setPrintOpen] = useState(false);

  // Jobs available to pay in /pay/[id]
  const payableJobs = useMemo(
    () =>
      db.jobs
        .filter((j) => !j.deleted_at && j.status !== 'CANCELLED')
        .sort((a, b) => {
          if (a.payment_status !== 'PAID' && b.payment_status === 'PAID') return -1;
          if (a.payment_status === 'PAID' && b.payment_status !== 'PAID') return 1;
          return b.scheduled_start.localeCompare(a.scheduled_start);
        }),
    [db.jobs]
  );

  const [selectedJobId, setSelectedJobId] = useState<string>(
    () => initialJobId ?? payableJobs[0]?.id ?? ''
  );
  const [confirmedTxId, setConfirmedTxId] = useState<string | null>(null);
  const [atInvoiceTx, setAtInvoiceTx] = useState<Transaction | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<{ src: string; caption: string } | null>(
    null
  );

  // --- Client History & Receipts state ---
  const activeClients = useMemo(
    () => db.clients.filter((c) => !c.deleted_at && !c.is_anonymized),
    [db.clients]
  );
  const [selectedHistoryClientId, setSelectedHistoryClientId] = useState<string>(
    () => activeClients[0]?.id ?? ''
  );

  // --- Invite Acceptance (/invite/[token]) state ---
  const allInvitations = useMemo(
    () =>
      [...db.team_invitations].sort((a, b) => {
        if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
        if (a.status !== 'PENDING' && b.status === 'PENDING') return 1;
        return b.created_at.localeCompare(a.created_at);
      }),
    [db.team_invitations]
  );
  const [selectedInviteToken, setSelectedInviteToken] = useState<string>(
    () => initialInviteToken ?? allInvitations[0]?.token ?? ''
  );
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteConfirmPassword, setInviteConfirmPassword] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [activatedUserName, setActivatedUserName] = useState<string | null>(null);
  const [activatedUserId, setActivatedUserId] = useState<string | null>(null);

  useEffect(() => {
    if (initialQuoteToken) {
      setSelectedToken(initialQuoteToken);
      setPortalRoute('quote_approval');
    }
  }, [initialQuoteToken]);

  useEffect(() => {
    if (initialJobId) {
      setSelectedJobId(initialJobId);
      setPortalRoute('service_payment');
    }
  }, [initialJobId]);

  useEffect(() => {
    if (initialInviteToken) {
      setSelectedInviteToken(initialInviteToken);
      setPortalRoute('invite_accept');
      setInviteError('');
      setActivatedUserName(null);
      setActivatedUserId(null);
    }
  }, [initialInviteToken]);

  // --- /p/[slug] Lead Request Form state ---
  const [leadName, setLeadName] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadAddress, setLeadAddress] = useState('');
  const [leadDescription, setLeadDescription] = useState('');
  const [gdprConsent, setGdprConsent] = useState(false);
  const [leadPhotos, setLeadPhotos] = useState<Array<{ dataUrl: string; sizeKb: number }>>([]);
  const [leadFormError, setLeadFormError] = useState('');
  const [leadSubmittedId, setLeadSubmittedId] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  // --- /q/[token] Approval feedback ---
  const [approvalError, setApprovalError] = useState('');
  const [justApproved, setJustApproved] = useState(false);

  const selectedQuote = useMemo(
    () => activeQuotes.find((q) => q.public_token === selectedToken) ?? null,
    [activeQuotes, selectedToken]
  );

  useEffect(() => {
    if (!selectedQuote?.packages || selectedQuote.packages.length === 0) {
      setSelectedPackageId(null);
      return;
    }
    const initialPkg =
      selectedQuote.selected_package_id ??
      selectedQuote.packages.find((p) => p.recommended)?.id ??
      selectedQuote.packages[0].id;
    setSelectedPackageId(initialPkg);
  }, [selectedQuote?.id]);

  const activePackage = useMemo(() => {
    if (!selectedQuote?.packages || selectedQuote.packages.length === 0) return null;
    return (
      selectedQuote.packages.find((p) => p.id === selectedPackageId) ??
      selectedQuote.packages[0]
    );
  }, [selectedPackageId, selectedQuote?.packages]);

  const displayedQuoteItems = activePackage ? activePackage.items : (selectedQuote?.items ?? []);
  const displayedSubtotal = activePackage
    ? activePackage.subtotal
    : (selectedQuote?.subtotal ?? 0);
  const displayedTotal = activePackage ? activePackage.total : (selectedQuote?.total ?? 0);
  const depositAmount =
    selectedQuote?.deposit_pct && selectedQuote.deposit_pct > 0
      ? roundCurrency(displayedTotal * (selectedQuote.deposit_pct / 100))
      : 0;

  const selectedJob = useMemo(
    () => payableJobs.find((j) => j.id === selectedJobId) ?? null,
    [payableJobs, selectedJobId]
  );

  const selectedJobClient = selectedJob
    ? db.clients.find((c) => c.id === selectedJob.client_id) ?? null
    : null;
  const selectedJobAsset = selectedJob
    ? db.service_assets.find((a) => a.id === selectedJob.asset_id) ?? null
    : null;

  const linkedJobTransaction = useMemo(() => {
    if (confirmedTxId) {
      const byId = db.transactions.find((t) => t.id === confirmedTxId);
      if (byId) return byId;
    }
    if (!selectedJob) return null;
    return (
      db.transactions.find(
        (t) => !t.deleted_at && t.type === 'INCOME' && t.job_id === selectedJob.id
      ) ?? null
    );
  }, [confirmedTxId, db.transactions, selectedJob]);

  const accent = organization.primary_color || '#10B981';

  const handleLeadPhotosChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    if (leadPhotos.length + files.length > 5) {
      setLeadFormError(
        'Pode anexar no máximo 5 fotografias por pedido de orçamento (400 Bad Request).'
      );
      return;
    }

    setLeadFormError('');
    try {
      const processed: Array<{ dataUrl: string; sizeKb: number }> = [];
      for (const file of files) {
        const res = await compressImageFile(file);
        processed.push({ dataUrl: res.dataUrl, sizeKb: res.sizeKb });
      }
      setLeadPhotos((prev) => [...prev, ...processed]);
    } catch (err) {
      setLeadFormError(
        err instanceof Error ? err.message : 'Erro ao comprimir fotografias.'
      );
    }
  };

  const handleLeadFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLeadFormError('');

    const parsed = publicLeadInputSchema.safeParse({
      name: leadName,
      phone: leadPhone,
      email: leadEmail,
      address: leadAddress,
      description: leadDescription,
      gdpr_consent: gdprConsent,
      photos: leadPhotos.map((p) => p.dataUrl),
    });

    if (!parsed.success) {
      setLeadFormError(
        parsed.error.issues[0]?.message ?? 'Verifique os campos obrigatórios.'
      );
      return;
    }

    const created = createLead({
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email || null,
      address: parsed.data.address,
      description: parsed.data.description,
      source: 'WEB_FORM',
      photo_urls: parsed.data.photos,
      gdpr_consent: true,
    });

    setLeadSubmittedId(created.id);
    showToast(`Novo lead "${created.name}" recebido na app (estado NEW).`, 'success');
  };

  const handleApproveQuote = () => {
    if (!selectedQuote) return;
    setApprovalError('');
    const result = approveQuoteByToken(selectedQuote.public_token, activePackage?.id ?? null);
    if (!result.ok) {
      setApprovalError(result.error ?? 'Não foi possível aprovar este orçamento.');
      return;
    }
    setJustApproved(true);
    showToast(
      `Orçamento ${selectedQuote.quote_number} aprovado! Lead atualizado para Fechado (Ganho).`,
      'success'
    );
  };

  const handleOpenATInvoice = (tx: Transaction) => {
    if (tx.external_invoice_id && tx.atcud) {
      setAtInvoiceTx(tx);
      return;
    }
    const issued = issueATInvoice(tx.id);
    if (issued) {
      setAtInvoiceTx(issued);
    }
  };

  const quoteClient = selectedQuote?.client_id
    ? db.clients.find((c) => c.id === selectedQuote.client_id) ?? null
    : null;
  const quoteLead = selectedQuote?.lead_id
    ? db.leads.find((l) => l.id === selectedQuote.lead_id) ?? null
    : null;

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      {/* Top Preview Switcher Bar */}
      <header className="sticky top-0 z-40 bg-[#1E293B] text-white border-b border-slate-700 px-4 py-2.5 no-print">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={onExit}
            className="inline-flex items-center gap-2 min-h-[44px] px-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-[14px] font-semibold cursor-pointer whitespace-nowrap"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar à App Zelvo</span>
          </button>

          <div className="inline-flex items-center p-1 rounded-xl bg-slate-800 border border-slate-700 overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => {
                setPortalRoute('lead_form');
                setLeadSubmittedId(null);
              }}
              className={`min-h-[38px] px-3 rounded-lg text-[13px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                portalRoute === 'lead_form'
                  ? 'bg-[#10B981] text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              /p/{organization.slug}
            </button>
            <button
              type="button"
              onClick={() => {
                setPortalRoute('quote_approval');
                setApprovalError('');
                setJustApproved(false);
              }}
              className={`min-h-[38px] px-3 rounded-lg text-[13px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                portalRoute === 'quote_approval'
                  ? 'bg-[#10B981] text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              /q/[token] (Orçamento)
            </button>
            <button
              type="button"
              onClick={() => {
                setPortalRoute('service_payment');
                setConfirmedTxId(null);
              }}
              className={`min-h-[38px] px-3 rounded-lg text-[13px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                portalRoute === 'service_payment'
                  ? 'bg-[#10B981] text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              /pay/[id] (Pagar)
            </button>
            <button
              type="button"
              onClick={() => setPortalRoute('client_history')}
              className={`min-h-[38px] px-3 rounded-lg text-[13px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                portalRoute === 'client_history'
                  ? 'bg-[#10B981] text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Histórico & Recibos
            </button>
            <button
              type="button"
              onClick={() => {
                setPortalRoute('invite_accept');
                setInviteError('');
              }}
              className={`min-h-[38px] px-3 rounded-lg text-[13px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                portalRoute === 'invite_accept'
                  ? 'bg-[#10B981] text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              /invite/[token]
            </button>
          </div>
        </div>
      </header>

      {/* Main Public Portal Canvas */}
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-6 sm:py-8">
        {/* ROUTE 1: /p/[slug] Public Lead Request Form */}
        {portalRoute === 'lead_form' && (
          <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-xs">
            <div className="h-2 w-full" style={{ backgroundColor: accent }} />
            <div className="p-5 sm:p-8 space-y-6">
              <div className="flex items-center gap-3.5 pb-4 border-b border-[#E2E8F0]">
                {organization.logo_url ? (
                  <img
                    src={organization.logo_url}
                    alt={organization.name}
                    className="h-12 max-w-[140px] object-contain"
                  />
                ) : (
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-display font-bold text-xl shrink-0"
                    style={{ backgroundColor: accent }}
                  >
                    {organization.name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div>
                  <h1 className="text-[20px] font-bold text-[#0F172A]">
                    {organization.name}
                  </h1>
                  <p className="text-[14px] text-[#475569]">
                    Pedido de Orçamento Online · Sem registo nem instalação
                  </p>
                </div>
              </div>

              {leadSubmittedId ? (
                <div className="py-6 text-center space-y-4">
                  <div className="w-14 h-14 rounded-full bg-[#DCFCE7] text-[#15803D] flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-[22px] font-bold text-[#0F172A]">
                      Pedido recebido com sucesso!
                    </h2>
                    <p className="text-[16px] text-[#475569] max-w-md mx-auto">
                      Obrigado, <strong>{leadName}</strong>. O seu pedido já entrou no
                      funil da <strong>{organization.name}</strong> (estado <em>Novo</em>) e
                      entraremos em contacto brevemente.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                    <a
                      href={buildWhatsAppUrl(
                        organization.phone ?? '914820351',
                        `Olá ${organization.name}, acabei de enviar um pedido de orçamento online em nome de ${leadName}.`
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-12 px-5 rounded-[10px] bg-[#10B981] hover:bg-[#059669] text-white font-semibold"
                    >
                      <MessageCircle className="w-5 h-5" />
                      <span>Falar por WhatsApp</span>
                    </a>
                    <PrimaryButton
                      variant="secondary"
                      onClick={() => {
                        setLeadSubmittedId(null);
                        setLeadName('');
                        setLeadPhone('');
                        setLeadEmail('');
                        setLeadAddress('');
                        setLeadDescription('');
                        setLeadPhotos([]);
                        setGdprConsent(false);
                      }}
                    >
                      Enviar outro pedido
                    </PrimaryButton>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleLeadFormSubmit} className="space-y-4">
                  {leadFormError && (
                    <div className="p-3.5 rounded-xl bg-[#FEE2E2] border border-[#FECACA] text-[#B91C1C] text-[14px] font-semibold flex items-start gap-2.5">
                      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                      <span>{leadFormError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
                        O seu nome *
                      </label>
                      <input
                        type="text"
                        value={leadName}
                        onChange={(e) => setLeadName(e.target.value)}
                        placeholder="Ex.: Sofia Almeida"
                        className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px]"
                      />
                    </div>
                    <div>
                      <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
                        Telefone / Telemóvel *
                      </label>
                      <input
                        type="tel"
                        value={leadPhone}
                        onChange={(e) => setLeadPhone(e.target.value)}
                        placeholder="912 345 678"
                        className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px] tabular-nums"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
                        Email (opcional)
                      </label>
                      <input
                        type="email"
                        value={leadEmail}
                        onChange={(e) => setLeadEmail(e.target.value)}
                        placeholder="sofia@mail.pt"
                        className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px]"
                      />
                    </div>
                    <div>
                      <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
                        Morada / Freguesia *
                      </label>
                      <input
                        type="text"
                        value={leadAddress}
                        onChange={(e) => setLeadAddress(e.target.value)}
                        placeholder="Ex.: Gualtar, Braga"
                        className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
                      O que precisa que façamos? *
                    </label>
                    <textarea
                      rows={3}
                      value={leadDescription}
                      onChange={(e) => setLeadDescription(e.target.value)}
                      placeholder="Ex.: Corte de relva (aprox. 180 m²), poda de sebe e limpeza de canteiros…"
                      className="w-full p-3 rounded-[10px] border border-[#CBD5E1] text-[16px]"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[14px] font-semibold text-[#0F172A]">
                        Fotos do espaço (até 5 fotos)
                      </label>
                      <span className="text-[13px] font-semibold text-[#475569] tabular-nums">
                        {leadPhotos.length}/5
                      </span>
                    </div>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => void handleLeadPhotosChange(e)}
                    />
                    <PrimaryButton
                      type="button"
                      variant="secondary"
                      fullWidth
                      onClick={() => photoInputRef.current?.click()}
                      icon={<Camera className="w-4 h-4 text-[#10B981]" />}
                    >
                      Anexar Fotografias ({5 - leadPhotos.length} disponíveis)
                    </PrimaryButton>

                    {leadPhotos.length > 0 && (
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 pt-1">
                        {leadPhotos.map((ph, idx) => (
                          <div
                            key={`lp-${idx}`}
                            className="relative rounded-lg overflow-hidden border border-[#CBD5E1]"
                          >
                            <img
                              src={ph.dataUrl}
                              alt={`Foto ${idx + 1}`}
                              className="w-full aspect-square object-cover"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setLeadPhotos((prev) => prev.filter((_, i) => i !== idx))
                              }
                              aria-label="Remover foto"
                              className="absolute top-1 right-1 p-1 rounded-full bg-slate-900/75 text-white cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <span className="block text-[11px] text-center bg-white py-0.5 text-[#475569] tabular-nums">
                              {ph.sizeKb} KB
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <label className="flex items-start gap-3 p-3.5 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={gdprConsent}
                      onChange={(e) => setGdprConsent(e.target.checked)}
                      className="w-5 h-5 mt-0.5 accent-[#10B981] shrink-0"
                    />
                    <span className="text-[14px] text-[#0F172A] leading-snug">
                      <strong className="inline-flex items-center gap-1">
                        <ShieldCheck className="w-4 h-4 text-[#15803D]" />
                        Consentimento RGPD (obrigatório):
                      </strong>{' '}
                      Autorizo a {organization.name} a tratar os meus dados e fotografias
                      exclusivamente para elaboração de orçamento e contacto comercial.
                    </span>
                  </label>

                  <button
                    type="submit"
                    className="w-full min-h-[52px] rounded-[10px] text-white font-bold text-[16px] flex items-center justify-center gap-2 transition-opacity hover:opacity-95 cursor-pointer"
                    style={{ backgroundColor: accent }}
                  >
                    <Send className="w-5 h-5" />
                    <span>Enviar Pedido de Orçamento</span>
                  </button>
                </form>
              )}

              <div className="pt-4 border-t border-[#E2E8F0] flex items-center justify-center gap-1.5 text-[13px] text-[#475569]">
                <span>Com tecnologia</span>
                <ZelvoLogo variant="light" size="sm" />
              </div>
            </div>
          </div>
        )}

        {/* ROUTE 2: /q/[token] Public Quote Approval (Multi-Package + Optional 30% Deposit) */}
        {portalRoute === 'quote_approval' && (
          <div className="space-y-4">
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="portal-quote-select"
                className="text-[14px] font-semibold text-[#0F172A]"
              >
                Orçamento a pré-visualizar:
              </label>
              <select
                id="portal-quote-select"
                value={selectedToken}
                onChange={(e) => {
                  setSelectedToken(e.target.value);
                  setApprovalError('');
                  setJustApproved(false);
                }}
                className="min-h-[44px] px-3 rounded-lg border border-[#CBD5E1] bg-white text-[14px] font-semibold text-[#0F172A]"
              >
                {activeQuotes.map((q) => (
                  <option key={q.id} value={q.public_token}>
                    {q.quote_number} · {QUOTE_STATUS_LABELS[q.status]} ({formatEUR(q.total)})
                    {q.packages && q.packages.length > 0 ? ' ★ Pacotes' : ''}
                  </option>
                ))}
              </select>
            </div>

            {selectedQuote ? (
              <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-xs">
                <div className="h-2.5 w-full" style={{ backgroundColor: accent }} />

                <div className="p-5 sm:p-8 space-y-6">
                  {/* Branding Header */}
                  <div className="text-center space-y-2 pb-5 border-b border-[#E2E8F0]">
                    {organization.logo_url ? (
                      <img
                        src={organization.logo_url}
                        alt={organization.name}
                        className="h-14 mx-auto object-contain"
                      />
                    ) : (
                      <div
                        className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-white font-display font-bold text-2xl"
                        style={{ backgroundColor: accent }}
                      >
                        {organization.name.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <h1 className="text-[20px] font-bold text-[#0F172A]">
                      {organization.name}
                    </h1>
                    <p
                      className="text-[14px] font-bold tracking-wider uppercase tabular-nums"
                      style={{ color: accent }}
                    >
                      Orçamento #{selectedQuote.quote_number}
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2 text-[14px] text-[#475569] tabular-nums">
                      <span>
                        Para: <strong>{quoteClient?.name ?? quoteLead?.name ?? 'Cliente'}</strong>
                      </span>
                      {selectedQuote.valid_until && (
                        <>
                          <span>·</span>
                          <span>
                            Válido até{' '}
                            <strong>{formatShortDatePT(selectedQuote.valid_until)}</strong>
                          </span>
                        </>
                      )}
                    </div>
                    <div className="pt-1 flex flex-wrap items-center justify-center gap-2">
                      <StatusBadge
                        tone={
                          selectedQuote.status === 'APPROVED'
                            ? 'success'
                            : isQuoteExpired(selectedQuote.valid_until)
                              ? 'warning'
                              : selectedQuote.status === 'SENT'
                                ? 'info'
                                : 'neutral'
                        }
                        label={
                          isQuoteExpired(selectedQuote.valid_until) &&
                          selectedQuote.status === 'SENT'
                            ? 'Expirado'
                            : QUOTE_STATUS_LABELS[selectedQuote.status]
                        }
                      />
                      {selectedQuote.deposit_pct && selectedQuote.deposit_pct > 0 && (
                        <StatusBadge
                          tone={selectedQuote.deposit_paid ? 'success' : 'teal'}
                          label={
                            selectedQuote.deposit_paid
                              ? `Sinal ${selectedQuote.deposit_pct}% Pago`
                              : `Requer Sinal ${selectedQuote.deposit_pct}%`
                          }
                        />
                      )}
                    </div>
                  </div>

                  {/* Multi-Package Interactive Selector */}
                  {selectedQuote.packages && selectedQuote.packages.length > 0 && (
                    <div className="space-y-2.5">
                      <p className="text-[14px] font-bold text-[#0F172A] flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-[#10B981]" />
                        <span>Escolha a opção que melhor se adapta ao seu espaço:</span>
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {selectedQuote.packages.map((pkg) => {
                          const isSelected = activePackage?.id === pkg.id;
                          return (
                            <button
                              key={pkg.id}
                              type="button"
                              disabled={selectedQuote.status === 'APPROVED'}
                              onClick={() => setSelectedPackageId(pkg.id)}
                              className={`text-left p-4 rounded-xl border-2 transition-all cursor-pointer disabled:cursor-default ${
                                isSelected
                                  ? 'border-[#10B981] bg-[#ECFDF5]'
                                  : 'border-[#E2E8F0] bg-white hover:border-slate-300'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-[15px] font-bold text-[#0F172A]">
                                  {pkg.name}
                                </span>
                                <span
                                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                    isSelected
                                      ? 'border-[#10B981] bg-[#10B981] text-white'
                                      : 'border-slate-300'
                                  }`}
                                >
                                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                </span>
                              </div>
                              {pkg.recommended && (
                                <span className="inline-block mt-1 px-2 py-0.5 rounded bg-[#10B981] text-white text-[11px] font-bold">
                                  Recomendado
                                </span>
                              )}
                              {pkg.description && (
                                <p className="text-[13px] text-[#475569] mt-1.5">
                                  {pkg.description}
                                </p>
                              )}
                              <p className="text-[19px] font-extrabold text-[#0F172A] tabular-nums mt-2.5">
                                {formatEUR(pkg.total)}
                                <span className="text-[12px] font-medium text-[#64748B] ml-1">
                                  c/ IVA
                                </span>
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Line Items */}
                  <div className="divide-y divide-[#E2E8F0]">
                    {displayedQuoteItems.map((item) => (
                      <div
                        key={item.id}
                        className="py-3 flex items-start justify-between gap-4"
                      >
                        <div>
                          <p className="text-[16px] font-semibold text-[#0F172A]">
                            {item.name}
                          </p>
                          <p className="text-[13px] text-[#475569] tabular-nums">
                            {item.qty} × {formatEUR(item.unit_price)} (
                            {SERVICE_UNIT_LABELS[item.unit]}) · IVA {item.vat_rate}%
                          </p>
                        </div>
                        <span className="text-[16px] font-bold text-[#0F172A] tabular-nums shrink-0">
                          {formatEUR(item.total)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Totals */}
                  <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 space-y-1.5 tabular-nums">
                    <div className="flex justify-between text-[15px] text-[#475569]">
                      <span>Subtotal</span>
                      <span>{formatEUR(displayedSubtotal)}</span>
                    </div>
                    {calculateQuoteTotals(displayedQuoteItems).vatBreakdown.map((v) => (
                      <div
                        key={v.rate}
                        className="flex justify-between text-[15px] text-[#475569]"
                      >
                        <span>IVA ({v.rate}%)</span>
                        <span>{formatEUR(v.tax)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between items-baseline pt-2.5 border-t border-[#CBD5E1] text-[22px] font-bold text-[#0F172A]">
                      <span>TOTAL</span>
                      <span style={{ color: accent }}>{formatEUR(displayedTotal)}</span>
                    </div>
                    {depositAmount > 0 && (
                      <div className="flex justify-between items-center pt-1.5 text-[14px] font-bold text-[#0F766E]">
                        <span>Sinal de Adjudicação ({selectedQuote.deposit_pct}%)</span>
                        <span>{formatEUR(depositAmount)}</span>
                      </div>
                    )}
                  </div>

                  {approvalError && (
                    <div className="p-3.5 rounded-xl bg-[#FEE2E2] border border-[#FECACA] text-[#B91C1C] text-[14px] font-semibold flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                      <span>{approvalError}</span>
                    </div>
                  )}

                  {selectedQuote.status === 'APPROVED' && (
                    <div className="p-4 rounded-xl bg-[#DCFCE7] border border-[#BBF7D0] text-[#15803D] flex items-start gap-3">
                      <FileCheck2 className="w-6 h-6 shrink-0 mt-0.5" />
                      <div className="text-[15px] tabular-nums">
                        <p className="font-bold">
                          {justApproved
                            ? 'Orçamento aprovado agora mesmo!'
                            : 'Orçamento aprovado digitalmente'}
                        </p>
                        <p className="text-[14px]">
                          Registado em{' '}
                          {selectedQuote.approved_at
                            ? formatShortDatePT(selectedQuote.approved_at)
                            : 'Hoje'}{' '}
                          · IP {selectedQuote.approved_ip ?? '85.242.194.18'}
                          {selectedQuote.deposit_paid ? ' · Sinal pago confirmado' : ''}.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Deposit Payment Simulator (when quote requires 30% deposit and not yet paid) */}
                  {depositAmount > 0 &&
                    !selectedQuote.deposit_paid &&
                    selectedQuote.status === 'SENT' && (
                      <PortugalPaymentSimulator
                        amount={depositAmount}
                        seedKey={`${selectedQuote.id}-${activePackage?.id ?? 'base'}`}
                        accent={accent}
                        ctaLabel={`Simular Webhook: Sinal ${selectedQuote.deposit_pct}% Pago & Aprovar`}
                        onWebhookConfirmed={(method, ref) => {
                          const tx = simulatePaymentWebhook({
                            quoteId: selectedQuote.id,
                            amount: depositAmount,
                            method,
                            reference: ref,
                            selectedPackageId: activePackage?.id ?? null,
                          });
                          if (tx) {
                            setJustApproved(true);
                          }
                        }}
                      />
                    )}

                  {/* Actions */}
                  <div className="space-y-2.5 pt-1">
                    {selectedQuote.status !== 'APPROVED' && depositAmount === 0 && (
                      <button
                        type="button"
                        onClick={handleApproveQuote}
                        className="w-full min-h-[52px] rounded-[10px] text-white font-bold text-[16px] flex items-center justify-center gap-2 transition-opacity hover:opacity-95 cursor-pointer"
                        style={{ backgroundColor: accent }}
                      >
                        <CheckCircle2 className="w-5 h-5" />
                        <span>
                          Aprovar Orçamento Agora
                          {activePackage ? ` (${activePackage.name})` : ''}
                        </span>
                      </button>
                    )}

                    <PrimaryButton
                      variant="secondary"
                      fullWidth
                      onClick={() => setPrintOpen(true)}
                      icon={<Printer className="w-5 h-5" />}
                    >
                      Descarregar / Imprimir PDF
                    </PrimaryButton>
                  </div>

                  <div className="pt-4 border-t border-[#E2E8F0] flex items-center justify-center gap-1.5 text-[13px] text-[#475569]">
                    <span>Com tecnologia</span>
                    <ZelvoLogo variant="light" size="sm" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-[#475569]">
                <FileText className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                Nenhum orçamento disponível para pré-visualização.
              </div>
            )}
          </div>
        )}

        {/* ROUTE 3: /pay/[id] Service Payment Screen (MB WAY / Multibanco / Card + AT Invoice) */}
        {portalRoute === 'service_payment' && (
          <div className="space-y-4">
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="portal-pay-job-select"
                className="text-[14px] font-semibold text-[#0F172A]"
              >
                Serviço (/pay/[id]):
              </label>
              <select
                id="portal-pay-job-select"
                value={selectedJobId}
                onChange={(e) => {
                  setSelectedJobId(e.target.value);
                  setConfirmedTxId(null);
                }}
                className="min-h-[44px] px-3 rounded-lg border border-[#CBD5E1] bg-white text-[14px] font-semibold text-[#0F172A] max-w-full"
              >
                {payableJobs.map((j) => {
                  const cli = db.clients.find((c) => c.id === j.client_id);
                  return (
                    <option key={j.id} value={j.id}>
                      {cli?.name ?? 'Cliente'} · {j.title} ({formatEUR(j.price)}) —{' '}
                      {j.payment_status === 'PAID' ? 'PAGO' : 'PENDENTE'}
                    </option>
                  );
                })}
              </select>
            </div>

            {selectedJob ? (
              <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-xs">
                <div className="h-2.5 w-full" style={{ backgroundColor: accent }} />
                <div className="p-5 sm:p-8 space-y-6">
                  <div className="flex items-start justify-between gap-3 pb-4 border-b border-[#E2E8F0]">
                    <div>
                      <p className="text-[12px] font-bold uppercase tracking-wider text-[#059669]">
                        {organization.name} · /pay/{selectedJob.id}
                      </p>
                      <h1 className="text-[21px] font-bold text-[#0F172A] mt-0.5">
                        {selectedJob.title}
                      </h1>
                      <p className="text-[14px] text-[#475569] mt-0.5">
                        {selectedJobClient?.name ?? 'Cliente'} ·{' '}
                        {selectedJobAsset?.address ?? 'Braga'} ·{' '}
                        {formatShortDatePT(selectedJob.scheduled_start)}
                      </p>
                    </div>
                    <StatusBadge
                      tone={selectedJob.payment_status === 'PAID' ? 'success' : 'warning'}
                      label={selectedJob.payment_status === 'PAID' ? 'Pago' : 'Por Pagar'}
                    />
                  </div>

                  {/* Extras breakdown if present */}
                  {selectedJob.extras && selectedJob.extras.length > 0 && (
                    <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-3.5 space-y-1.5 text-[14px]">
                      <p className="font-bold text-[#0F172A]">Extras incluídos no serviço:</p>
                      {selectedJob.extras.map((ex) => (
                        <div key={ex.id} className="flex justify-between tabular-nums">
                          <span className="text-[#475569]">
                            {ex.qty}× {ex.name}
                          </span>
                          <span className="font-semibold text-[#0F172A]">
                            {formatEUR(ex.total)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedJob.payment_status === 'PAID' ? (
                    <div className="space-y-4">
                      <div className="p-5 rounded-2xl bg-[#DCFCE7] border border-[#BBF7D0] text-[#15803D] space-y-2">
                        <div className="flex items-center gap-2.5">
                          <CheckCircle2 className="w-7 h-7 shrink-0" />
                          <div>
                            <h2 className="text-[18px] font-extrabold">
                              Pagamento Confirmado!
                            </h2>
                            <p className="text-[14px] tabular-nums">
                              Montante liquidado: <strong>{formatEUR(selectedJob.price)}</strong>
                              {linkedJobTransaction?.external_payment_id
                                ? ` · Ref.: ${linkedJobTransaction.external_payment_id}`
                                : ''}
                            </p>
                          </div>
                        </div>
                      </div>

                      {linkedJobTransaction && (
                        <PrimaryButton
                          fullWidth
                          onClick={() => handleOpenATInvoice(linkedJobTransaction)}
                          icon={<ShieldCheck className="w-5 h-5" />}
                        >
                          {linkedJobTransaction.external_invoice_id
                            ? `Ver Fatura-Recibo AT (${linkedJobTransaction.external_invoice_id})`
                            : 'Emitir Fatura-Recibo (AT Portugal)'}
                        </PrimaryButton>
                      )}
                    </div>
                  ) : (
                    <PortugalPaymentSimulator
                      amount={selectedJob.price}
                      seedKey={selectedJob.id}
                      accent={accent}
                      onWebhookConfirmed={(method, ref) => {
                        const tx = simulatePaymentWebhook({
                          jobId: selectedJob.id,
                          amount: selectedJob.price,
                          method,
                          reference: ref,
                        });
                        if (tx) {
                          setConfirmedTxId(tx.id);
                        }
                      }}
                    />
                  )}

                  <div className="pt-4 border-t border-[#E2E8F0] flex items-center justify-center gap-1.5 text-[13px] text-[#475569]">
                    <span>Pagamentos processados com tecnologia</span>
                    <ZelvoLogo variant="light" size="sm" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-[#475569]">
                Nenhum serviço encontrado para pagamento.
              </div>
            )}
          </div>
        )}

        {/* ROUTE 4: Client History & AT Receipts Portal */}
        {portalRoute === 'client_history' && (() => {
          const historyClient =
            activeClients.find((c) => c.id === selectedHistoryClientId) ?? activeClients[0] ?? null;
          const completedVisits = historyClient
            ? db.jobs
                .filter(
                  (j) => !j.deleted_at && j.client_id === historyClient.id && j.status === 'COMPLETED'
                )
                .sort((a, b) => b.scheduled_start.localeCompare(a.scheduled_start))
            : [];
          const clientReceipts = historyClient
            ? db.transactions
                .filter(
                  (t) =>
                    !t.deleted_at &&
                    t.type === 'INCOME' &&
                    t.client_id === historyClient.id
                )
                .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))
            : [];

          return (
            <div className="space-y-4">
              {/* Demo client switcher */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-2.5 no-print">
                <label
                  htmlFor="portal-history-client-select"
                  className="text-[13px] font-semibold text-[#475569] inline-flex items-center gap-1.5"
                >
                  <History className="w-4 h-4 text-[#059669]" />
                  <span>Simular área privada do cliente:</span>
                </label>
                <select
                  id="portal-history-client-select"
                  value={historyClient?.id ?? ''}
                  onChange={(e) => setSelectedHistoryClientId(e.target.value)}
                  className="min-h-[42px] px-3 rounded-lg border border-[#CBD5E1] bg-white text-[14px] font-medium max-w-full"
                >
                  {activeClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {historyClient ? (
                <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-xs">
                  <div className="h-2.5 w-full" style={{ backgroundColor: accent }} />
                  <div className="p-5 sm:p-7 space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#E2E8F0]">
                      <div className="flex items-center gap-3">
                        {organization.logo_url ? (
                          <img
                            src={organization.logo_url}
                            alt={organization.name}
                            className="h-11 max-w-[120px] object-contain"
                          />
                        ) : (
                          <div
                            className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-[18px] shrink-0"
                            style={{ backgroundColor: accent }}
                          >
                            {organization.name.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="text-[12px] font-bold uppercase tracking-wider text-[#059669]">
                            {organization.name} · Área do Cliente
                          </p>
                          <h1 className="text-[20px] font-bold text-[#0F172A]">
                            {historyClient.name}
                          </h1>
                        </div>
                      </div>
                      <StatusBadge
                        tone="success"
                        label={`${completedVisits.length} visitas concluídas`}
                      />
                    </div>

                    {/* Completed Visits + Before/After Gallery */}
                    <section className="space-y-3">
                      <h2 className="text-[16px] font-bold text-[#0F172A]">
                        Visitas Concluídas & Galeria Antes / Depois
                      </h2>

                      {completedVisits.length === 0 ? (
                        <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-6 text-center text-[14px] text-[#475569]">
                          Ainda não existem visitas concluídas para este cliente.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {completedVisits.map((visit) => {
                            const asset = db.service_assets.find((a) => a.id === visit.asset_id);
                            const media = db.job_media.filter(
                              (m) => !m.deleted_at && m.job_id === visit.id
                            );
                            const beforePhotos = media.filter((m) => m.media_type === 'BEFORE');
                            const afterPhotos = media.filter((m) => m.media_type === 'AFTER');
                            const linkedTx = db.transactions.find(
                              (t) => !t.deleted_at && t.type === 'INCOME' && t.job_id === visit.id
                            );

                            return (
                              <div
                                key={visit.id}
                                className="rounded-xl border border-[#E2E8F0] p-4 space-y-3 bg-[#F8FAFC]/60"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div>
                                    <p className="text-[15px] font-bold text-[#0F172A]">
                                      {visit.title}
                                    </p>
                                    <p className="text-[13px] text-[#475569]">
                                      {formatShortDatePT(visit.scheduled_start)}
                                      {asset ? ` · ${asset.name}` : ''}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[15px] font-bold text-[#0F172A] tabular-nums">
                                      {formatEUR(visit.price)}
                                    </span>
                                    <StatusBadge
                                      tone={visit.payment_status === 'PAID' ? 'success' : 'warning'}
                                      label={visit.payment_status === 'PAID' ? 'Pago' : 'Por pagar'}
                                    />
                                  </div>
                                </div>

                                {(beforePhotos.length > 0 || afterPhotos.length > 0) && (
                                  <div className="grid grid-cols-2 gap-2.5">
                                    {beforePhotos.slice(0, 2).map((p) => (
                                      <button
                                        key={p.id}
                                        type="button"
                                        onClick={() =>
                                          setLightboxPhoto({
                                            src: p.data_url,
                                            caption: `Antes — ${visit.title}`,
                                          })
                                        }
                                        className="relative rounded-xl overflow-hidden border border-[#CBD5E1] aspect-[4/3] group cursor-pointer"
                                      >
                                        <img
                                          src={p.data_url}
                                          alt={`Antes ${visit.title}`}
                                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                        />
                                        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-slate-900/80 text-white text-[11px] font-bold">
                                          ANTES
                                        </span>
                                      </button>
                                    ))}
                                    {afterPhotos.slice(0, 2).map((p) => (
                                      <button
                                        key={p.id}
                                        type="button"
                                        onClick={() =>
                                          setLightboxPhoto({
                                            src: p.data_url,
                                            caption: `Depois — ${visit.title}`,
                                          })
                                        }
                                        className="relative rounded-xl overflow-hidden border border-[#10B981] aspect-[4/3] group cursor-pointer"
                                      >
                                        <img
                                          src={p.data_url}
                                          alt={`Depois ${visit.title}`}
                                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                        />
                                        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-[#10B981] text-white text-[11px] font-bold">
                                          DEPOIS
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                )}

                                {linkedTx && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenATInvoice(linkedTx)}
                                    className="w-full sm:w-auto min-h-[44px] px-3.5 rounded-xl border border-[#CBD5E1] bg-white hover:bg-slate-50 text-[#0F172A] text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                                  >
                                    <ShieldCheck className="w-4 h-4 text-[#059669]" />
                                    <span>
                                      {linkedTx.external_invoice_id
                                        ? `Ver / Descarregar Fatura-Recibo AT (${linkedTx.external_invoice_id})`
                                        : 'Ver / Emitir Fatura-Recibo AT'}
                                    </span>
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>

                    {/* Issued AT Invoices / Receipts */}
                    <section className="space-y-3 pt-2 border-t border-[#E2E8F0]">
                      <h2 className="text-[16px] font-bold text-[#0F172A]">
                        Faturas-Recibo AT & Comprovativos ({clientReceipts.length})
                      </h2>
                      {clientReceipts.length === 0 ? (
                        <p className="text-[14px] text-[#475569]">
                          Sem recibos emitidos para este cliente até ao momento.
                        </p>
                      ) : (
                        <div className="divide-y divide-[#E2E8F0] rounded-xl border border-[#E2E8F0] overflow-hidden">
                          {clientReceipts.map((tx) => (
                            <div
                              key={tx.id}
                              className="p-3.5 flex flex-wrap items-center justify-between gap-2.5 bg-white"
                            >
                              <div className="min-w-0">
                                <p className="text-[14px] font-bold text-[#0F172A] truncate">
                                  {tx.external_invoice_id || 'Recibo de Pagamento'}
                                </p>
                                <p className="text-[12px] text-[#475569] tabular-nums">
                                  {formatShortDatePT(tx.transaction_date)}
                                  {tx.atcud ? ` · ATCUD: ${tx.atcud}` : ''}
                                </p>
                              </div>
                              <div className="flex items-center gap-2.5">
                                <span className="text-[15px] font-bold text-[#15803D] tabular-nums">
                                  {formatEUR(tx.amount)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleOpenATInvoice(tx)}
                                  className="min-h-[42px] px-3 rounded-lg bg-[#1E293B] hover:bg-slate-800 text-white text-[13px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                                >
                                  <FileText className="w-4 h-4 text-[#10B981]" />
                                  <span>Abrir PDF</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-[#475569]">
                  Nenhum cliente ativo encontrado.
                </div>
              )}
            </div>
          );
        })()}

        {/* ROUTE 5: /invite/[token] Technician Invitation Acceptance */}
        {portalRoute === 'invite_accept' && (() => {
          const invite =
            allInvitations.find((inv) => inv.token === selectedInviteToken) ??
            allInvitations[0] ??
            null;

          const handleActivateAccount = (e: React.FormEvent) => {
            e.preventDefault();
            if (!invite) return;
            setInviteError('');

            if (invitePassword.trim().length < 6) {
              setInviteError('A palavra-passe deve ter pelo menos 6 caracteres.');
              return;
            }
            if (invitePassword !== inviteConfirmPassword) {
              setInviteError('As palavras-passe não coincidem.');
              return;
            }

            const existingIds = new Set(db.users.map((u) => u.id));
            acceptTeamInvitation(invite.id);
            setActivatedUserName(invite.full_name);
            setInvitePassword('');
            setInviteConfirmPassword('');

            // Match newly created user by email on next render via fallback lookup
            const alreadyMatched = db.users.find(
              (u) => !existingIds.has(u.id) || u.email?.toLowerCase() === invite.email.toLowerCase()
            );
            setActivatedUserId(alreadyMatched?.id ?? null);
          };

          const resolvedActivatedUser =
            (activatedUserId ? db.users.find((u) => u.id === activatedUserId) : null) ??
            (invite
              ? db.users.find(
                  (u) => u.email?.toLowerCase() === invite.email.toLowerCase() && u.is_active
                )
              : null);

          return (
            <div className="space-y-4">
              {allInvitations.length > 0 && (
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-2.5 no-print">
                  <label
                    htmlFor="portal-invite-select"
                    className="text-[13px] font-semibold text-[#475569] inline-flex items-center gap-1.5"
                  >
                    <KeyRound className="w-4 h-4 text-[#059669]" />
                    <span>Simular link de convite (/invite/[token]):</span>
                  </label>
                  <select
                    id="portal-invite-select"
                    value={invite?.token ?? ''}
                    onChange={(e) => {
                      setSelectedInviteToken(e.target.value);
                      setInviteError('');
                      setActivatedUserName(null);
                      setActivatedUserId(null);
                    }}
                    className="min-h-[42px] px-3 rounded-lg border border-[#CBD5E1] bg-white text-[14px] font-medium max-w-full"
                  >
                    {allInvitations.map((inv) => (
                      <option key={inv.id} value={inv.token}>
                        {inv.full_name} ({inv.status === 'PENDING' ? 'Pendente' : inv.status})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {invite ? (
                <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-xs">
                  <div className="h-2.5 w-full" style={{ backgroundColor: accent }} />
                  <div className="p-5 sm:p-8 space-y-6">
                    <div className="flex flex-col items-center text-center space-y-3 pb-4 border-b border-[#E2E8F0]">
                      {organization.logo_url ? (
                        <img
                          src={organization.logo_url}
                          alt={organization.name}
                          className="h-14 max-w-[160px] object-contain"
                        />
                      ) : (
                        <div
                          className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-extrabold text-[24px]"
                          style={{ backgroundColor: accent }}
                        >
                          {organization.name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="text-[12px] font-bold uppercase tracking-wider text-[#059669]">
                          Convite Oficial de Equipa · /invite/{invite.token}
                        </p>
                        <h1 className="text-[22px] font-bold text-[#0F172A] mt-1">
                          Junte-se à equipa da {organization.name}
                        </h1>
                        <p className="text-[14px] text-[#475569] mt-1">
                          Olá <strong>{invite.full_name}</strong>, foi convidado para aceder à app{' '}
                          <strong>Zelvo</strong> como <strong>Técnico de Campo</strong>.
                        </p>
                      </div>
                    </div>

                    {activatedUserName || invite.status === 'ACCEPTED' ? (
                      <div className="space-y-4 text-center py-2">
                        <div className="w-14 h-14 rounded-full bg-[#DCFCE7] text-[#15803D] flex items-center justify-center mx-auto">
                          <CheckCircle2 className="w-8 h-8" />
                        </div>
                        <div className="space-y-1">
                          <h2 className="text-[20px] font-extrabold text-[#0F172A]">
                            Conta Ativada na Equipa!
                          </h2>
                          <p className="text-[14px] text-[#475569]">
                            <strong>{activatedUserName ?? invite.full_name}</strong> já faz parte da
                            equipa ativa da <strong>{organization.name}</strong> e pode consultar as
                            suas visitas no terreno.
                          </p>
                        </div>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                          {resolvedActivatedUser && (
                            <PrimaryButton
                              onClick={() => {
                                setCurrentUserId(resolvedActivatedUser.id);
                                onExit();
                              }}
                              icon={<UserCheck className="w-5 h-5" />}
                            >
                              Entrar na App como {resolvedActivatedUser.full_name.split(' ')[0]}
                            </PrimaryButton>
                          )}
                          <PrimaryButton variant="secondary" onClick={onExit}>
                            Voltar à Gestão
                          </PrimaryButton>
                        </div>
                      </div>
                    ) : invite.status === 'REVOKED' || invite.status === 'EXPIRED' ? (
                      <div className="rounded-xl bg-[#FEE2E2] border border-[#FECACA] p-5 text-center space-y-2 text-[#B91C1C]">
                        <AlertCircle className="w-7 h-7 mx-auto" />
                        <h2 className="text-[17px] font-bold">
                          {invite.status === 'REVOKED' ? 'Convite Revogado' : 'Convite Expirado'}
                        </h2>
                        <p className="text-[14px]">
                          Este link já não é válido. Peça ao administrador da{' '}
                          <strong>{organization.name}</strong> para enviar um novo convite.
                        </p>
                      </div>
                    ) : (
                      <form onSubmit={handleActivateAccount} className="space-y-4">
                        <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-3.5 text-[14px] space-y-1">
                          <div className="flex justify-between gap-2">
                            <span className="text-[#475569]">Técnico convidado:</span>
                            <strong className="text-[#0F172A]">{invite.full_name}</strong>
                          </div>
                          <div className="flex justify-between gap-2">
                            <span className="text-[#475569]">Email de acesso:</span>
                            <strong className="text-[#0F172A]">{invite.email}</strong>
                          </div>
                          <div className="flex justify-between gap-2">
                            <span className="text-[#475569]">Telemóvel:</span>
                            <strong className="text-[#0F172A] tabular-nums">{invite.phone}</strong>
                          </div>
                        </div>

                        <div>
                          <label
                            htmlFor="invite-pass"
                            className="block text-[14px] font-semibold text-[#0F172A] mb-1"
                          >
                            Criar Palavra-passe *
                          </label>
                          <div className="relative">
                            <Lock className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                              id="invite-pass"
                              type="password"
                              required
                              minLength={6}
                              value={invitePassword}
                              onChange={(e) => setInvitePassword(e.target.value)}
                              placeholder="Mínimo 6 caracteres"
                              className="w-full min-h-12 pl-10 pr-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px]"
                            />
                          </div>
                        </div>

                        <div>
                          <label
                            htmlFor="invite-pass-confirm"
                            className="block text-[14px] font-semibold text-[#0F172A] mb-1"
                          >
                            Confirmar Palavra-passe *
                          </label>
                          <div className="relative">
                            <Lock className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                              id="invite-pass-confirm"
                              type="password"
                              required
                              minLength={6}
                              value={inviteConfirmPassword}
                              onChange={(e) => setInviteConfirmPassword(e.target.value)}
                              placeholder="Repita a palavra-passe"
                              className="w-full min-h-12 pl-10 pr-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px]"
                            />
                          </div>
                        </div>

                        {inviteError && (
                          <div className="rounded-xl bg-[#FEE2E2] border border-[#FECACA] px-3.5 py-2.5 text-[14px] font-semibold text-[#B91C1C]">
                            {inviteError}
                          </div>
                        )}

                        <PrimaryButton
                          type="submit"
                          fullWidth
                          icon={<UserCheck className="w-5 h-5" />}
                        >
                          Ativar Conta na Equipa
                        </PrimaryButton>
                      </form>
                    )}

                    <div className="pt-4 border-t border-[#E2E8F0] flex items-center justify-center gap-1.5 text-[13px] text-[#475569]">
                      <span>Acesso de equipa protegido por</span>
                      <ZelvoLogo variant="light" size="sm" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 text-center space-y-3">
                  <KeyRound className="w-8 h-8 text-[#64748B] mx-auto" />
                  <h2 className="text-[18px] font-bold text-[#0F172A]">
                    Nenhum convite de equipa disponível
                  </h2>
                  <p className="text-[14px] text-[#475569]">
                    Crie primeiro um convite em <strong>Menu → Equipa & Técnicos</strong> para
                    testar a página de ativação de conta.
                  </p>
                  <PrimaryButton variant="secondary" onClick={onExit}>
                    Voltar à App Zelvo
                  </PrimaryButton>
                </div>
              )}
            </div>
          );
        })()}
      </main>

      <QuotePrintModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        quote={selectedQuote}
        organization={organization}
        client={quoteClient}
        lead={quoteLead}
      />

      <ATInvoiceModal
        open={Boolean(atInvoiceTx)}
        onClose={() => setAtInvoiceTx(null)}
        transaction={atInvoiceTx}
        organization={organization}
        client={
          atInvoiceTx?.client_id
            ? db.clients.find((c) => c.id === atInvoiceTx.client_id) ?? null
            : selectedJobClient
        }
      />

      <PhotoLightbox
        src={lightboxPhoto?.src ?? null}
        caption={lightboxPhoto?.caption}
        onClose={() => setLightboxPhoto(null)}
      />
    </div>
  );
};
