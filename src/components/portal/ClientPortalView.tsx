import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  FileCheck2,
  FileText,
  MessageCircle,
  Printer,
  Send,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  formatEUR,
  formatShortDatePT,
  QUOTE_STATUS_LABELS,
  SERVICE_UNIT_LABELS,
} from '../../i18n/pt-PT';
import { useZelvo } from '../../store/ZelvoContext';
import { publicLeadInputSchema } from '../../types/database';
import {
  buildWhatsAppUrl,
  calculateQuoteTotals,
  compressImageFile,
  isQuoteExpired,
} from '../../utils/calculations';
import { QuotePrintModal } from '../common/QuotePrintModal';
import { PrimaryButton, StatusBadge } from '../common/UIPrimitives';
import { ZelvoLogo } from '../common/ZelvoLogo';

interface ClientPortalViewProps {
  initialMode?: 'lead_form' | 'quote_approval';
  initialQuoteToken?: string | null;
  onExit: () => void;
}

export const ClientPortalView: React.FC<ClientPortalViewProps> = ({
  initialMode = 'quote_approval',
  initialQuoteToken = null,
  onExit,
}) => {
  const { db, organization, createLead, approveQuoteByToken, showToast } = useZelvo();

  const [portalRoute, setPortalRoute] = useState<'lead_form' | 'quote_approval'>(
    initialMode
  );

  // Quotes available to test in /q/[token]
  const activeQuotes = useMemo(
    () => db.quotes.filter((q) => !q.deleted_at),
    [db.quotes]
  );

  const defaultQuoteToken = useMemo(() => {
    if (initialQuoteToken) return initialQuoteToken;
    const sent = activeQuotes.find((q) => q.status === 'SENT');
    return sent?.public_token ?? activeQuotes[0]?.public_token ?? '';
  }, [activeQuotes, initialQuoteToken]);

  const [selectedToken, setSelectedToken] = useState<string>(defaultQuoteToken);
  const [printOpen, setPrintOpen] = useState(false);

  useEffect(() => {
    if (initialQuoteToken) {
      setSelectedToken(initialQuoteToken);
      setPortalRoute('quote_approval');
    }
  }, [initialQuoteToken]);

  // --- /p/[slug] Lead Request Form state ---
  const [leadName, setLeadName] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadAddress, setLeadAddress] = useState('');
  const [leadDescription, setLeadDescription] = useState('');
  const [gdprConsent, setGdprConsent] = useState(false);
  const [leadPhotos, setLeadPhotos] = useState<Array<{ dataUrl: string; sizeKb: number }>>(
    []
  );
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

  const accent = organization.primary_color || '#10B981';

  const handleLeadPhotosChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    // TC-04: Reject > 5 photos with clear validation error
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
      setLeadFormError(parsed.error.issues[0]?.message ?? 'Verifique os campos obrigatórios.');
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
    const result = approveQuoteByToken(selectedQuote.public_token);
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

  const quoteClient = selectedQuote?.client_id
    ? db.clients.find((c) => c.id === selectedQuote.client_id) ?? null
    : null;
  const quoteLead = selectedQuote?.lead_id
    ? db.leads.find((l) => l.id === selectedQuote.lead_id) ?? null
    : null;

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      {/* Top Preview Switcher Bar */}
      <header className="sticky top-0 z-40 bg-[#1E293B] text-white border-b border-slate-700 px-4 py-2.5">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={onExit}
            className="inline-flex items-center gap-2 min-h-[44px] px-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-[14px] font-semibold cursor-pointer whitespace-nowrap"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar à App Zelvo</span>
          </button>

          <div className="inline-flex items-center p-1 rounded-xl bg-slate-800 border border-slate-700">
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
              /p/{organization.slug} (Pedir Orçamento)
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
              /q/[token] (Aprovar Orçamento)
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
              {/* White-label header */}
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

                  {/* Photo Upload up to 5 photos */}
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

                  {/* Mandatory GDPR Consent Checkbox (TC-03 & TC-04) */}
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

              {/* Light White-Label Footer */}
              <div className="pt-4 border-t border-[#E2E8F0] flex items-center justify-center gap-1.5 text-[13px] text-[#475569]">
                <span>Com tecnologia</span>
                <ZelvoLogo variant="light" size="sm" />
              </div>
            </div>
          </div>
        )}

        {/* ROUTE 2: /q/[token] Public Quote Approval */}
        {portalRoute === 'quote_approval' && (
          <div className="space-y-4">
            {/* Demo Quote Selector */}
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
                    <div className="pt-1">
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
                    </div>
                  </div>

                  {/* Line Items */}
                  <div className="divide-y divide-[#E2E8F0]">
                    {selectedQuote.items.map((item) => (
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
                      <span>{formatEUR(selectedQuote.subtotal)}</span>
                    </div>
                    {calculateQuoteTotals(selectedQuote.items).vatBreakdown.map((v) => (
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
                      <span style={{ color: accent }}>{formatEUR(selectedQuote.total)}</span>
                    </div>
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
                          · IP {selectedQuote.approved_ip ?? '85.242.194.18'}.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="space-y-2.5 pt-1">
                    {selectedQuote.status !== 'APPROVED' && (
                      <button
                        type="button"
                        onClick={handleApproveQuote}
                        className="w-full min-h-[52px] rounded-[10px] text-white font-bold text-[16px] flex items-center justify-center gap-2 transition-opacity hover:opacity-95 cursor-pointer"
                        style={{ backgroundColor: accent }}
                      >
                        <CheckCircle2 className="w-5 h-5" />
                        <span>Aprovar Orçamento Agora</span>
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

                  {/* Light White-Label Footer */}
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
      </main>

      <QuotePrintModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        quote={selectedQuote}
        organization={organization}
        client={quoteClient}
        lead={quoteLead}
      />
    </div>
  );
};
