import React from 'react';
import { Printer, X, CheckCircle2 } from 'lucide-react';
import {
  formatEUR,
  formatShortDatePT,
  QUOTE_STATUS_LABELS,
  SERVICE_UNIT_LABELS,
} from '../../i18n/pt-PT';
import type { Client, Lead, Organization, Quote } from '../../types/database';
import { calculateQuoteTotals } from '../../utils/calculations';
import { PrimaryButton } from './UIPrimitives';
import { ZelvoLogo } from './ZelvoLogo';

interface QuotePrintModalProps {
  open: boolean;
  onClose: () => void;
  quote: Quote | null;
  organization: Organization;
  client?: Client | null;
  lead?: Lead | null;
}

export const QuotePrintModal: React.FC<QuotePrintModalProps> = ({
  open,
  onClose,
  quote,
  organization,
  client,
  lead,
}) => {
  if (!open || !quote) return null;

  const recipientName = client?.name ?? lead?.name ?? 'Cliente Final';
  const recipientPhone = client?.phone ?? lead?.phone ?? null;
  const recipientEmail = client?.email ?? lead?.email ?? null;
  const recipientAddress = client?.billing_address ?? lead?.address ?? null;
  const recipientNif = client?.nif ?? null;
  const { vatBreakdown } = calculateQuoteTotals(quote.items);
  const accent = organization.primary_color || '#10B981';

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-900/70 backdrop-blur-[2px] flex flex-col items-center overflow-y-auto p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Pré-visualização PDF ${quote.quote_number}`}
    >
      {/* Top Toolbar (hidden on print) */}
      <div className="no-print w-full max-w-[794px] flex flex-wrap items-center justify-between gap-3 mb-4 bg-[#1E293B] text-white px-4 py-3 rounded-xl border border-slate-700">
        <div>
          <p className="font-semibold text-[15px]">Pré-visualização de Orçamento (PDF A4)</p>
          <p className="text-[13px] text-slate-300">
            Light White-Label · {organization.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PrimaryButton
            onClick={() => window.print()}
            icon={<Printer className="w-4 h-4" />}
          >
            Imprimir / Guardar PDF
          </PrimaryButton>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar pré-visualização"
            className="min-h-12 min-w-12 flex items-center justify-center rounded-lg bg-slate-700 hover:bg-slate-600 text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Printable A4 Sheet */}
      <div
        id="zelvo-print-sheet"
        className="w-full max-w-[794px] bg-white rounded-xl border border-[#E2E8F0] shadow-xl overflow-hidden text-[#0F172A]"
      >
        {/* Top brand accent stripe */}
        <div className="h-2 w-full" style={{ backgroundColor: accent }} />

        <div className="p-6 sm:p-10 space-y-8">
          {/* Header: Org branding + Quote Metadata */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 border-b border-[#E2E8F0] pb-6">
            <div className="space-y-2">
              {organization.logo_url ? (
                <img
                  src={organization.logo_url}
                  alt={organization.name}
                  className="h-14 max-w-[200px] object-contain"
                />
              ) : (
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-display font-bold text-xl"
                    style={{ backgroundColor: accent }}
                  >
                    {organization.name.slice(0, 1).toUpperCase()}
                  </div>
                  <span className="font-display text-2xl font-bold text-[#0F172A]">
                    {organization.name}
                  </span>
                </div>
              )}
              <div className="text-[14px] text-[#475569] space-y-0.5 pt-1">
                {organization.logo_url && (
                  <p className="font-semibold text-[#0F172A]">{organization.name}</p>
                )}
                {organization.nif && <p>NIF: {organization.nif}</p>}
                {organization.phone && <p>Tel.: {organization.phone}</p>}
                {organization.email && <p>{organization.email}</p>}
              </div>
            </div>

            <div className="sm:text-right space-y-1">
              <p
                className="text-[13px] font-bold tracking-wider uppercase"
                style={{ color: accent }}
              >
                Orçamento
              </p>
              <h1 className="font-display text-2xl font-bold text-[#0F172A] tabular-nums">
                {quote.quote_number}
              </h1>
              <p className="text-[14px] text-[#475569] tabular-nums">
                Emissão: {formatShortDatePT(quote.created_at)}
              </p>
              {quote.valid_until && (
                <p className="text-[14px] text-[#475569] tabular-nums">
                  Válido até: <strong>{formatShortDatePT(quote.valid_until)}</strong>
                </p>
              )}
              <p className="text-[13px] font-semibold text-[#0F172A] pt-1">
                Estado: {QUOTE_STATUS_LABELS[quote.status]}
              </p>
            </div>
          </div>

          {/* Recipient Box */}
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 sm:p-5">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-[#475569] mb-1">
              Destinatário
            </p>
            <p className="text-[17px] font-bold text-[#0F172A]">{recipientName}</p>
            <div className="text-[14px] text-[#475569] mt-1 space-y-0.5">
              {recipientAddress && <p>{recipientAddress}</p>}
              <p>
                {recipientPhone ? `Tel.: ${recipientPhone}` : ''}
                {recipientPhone && recipientEmail ? ' · ' : ''}
                {recipientEmail ?? ''}
              </p>
              {recipientNif && <p>NIF: {recipientNif}</p>}
            </div>
          </div>

          {/* Items Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-[#0F172A] text-[13px] text-[#475569]">
                  <th className="py-2.5 pr-3 font-semibold">Descrição do Serviço</th>
                  <th className="py-2.5 px-2 font-semibold text-right">Qtd.</th>
                  <th className="py-2.5 px-2 font-semibold text-right">Preço Unit.</th>
                  <th className="py-2.5 px-2 font-semibold text-right">IVA</th>
                  <th className="py-2.5 pl-2 font-semibold text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-[15px]">
                {quote.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-3 pr-3 font-medium text-[#0F172A]">
                      {item.name}
                      <span className="block text-[12px] text-[#475569]">
                        Unidade: {SERVICE_UNIT_LABELS[item.unit]}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right tabular-nums">{item.qty}</td>
                    <td className="py-3 px-2 text-right tabular-nums">
                      {formatEUR(item.unit_price)}
                    </td>
                    <td className="py-3 px-2 text-right tabular-nums">{item.vat_rate}%</td>
                    <td className="py-3 pl-2 text-right font-semibold tabular-nums">
                      {formatEUR(item.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals & VAT Summary */}
          <div className="flex flex-col sm:flex-row justify-between gap-6 pt-2">
            <div className="text-[13px] text-[#475569] space-y-1 max-w-sm">
              <p className="font-semibold text-[#0F172A]">Resumo de IVA</p>
              {vatBreakdown.map((row) => (
                <p key={row.rate} className="tabular-nums">
                  Taxa {row.rate}% · Base {formatEUR(row.base)} · Imposto {formatEUR(row.tax)}
                </p>
              ))}
              {quote.approved_at && (
                <div className="mt-3 p-3 rounded-lg bg-[#DCFCE7] text-[#15803D] flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="text-[13px] tabular-nums">
                    <p className="font-semibold">Aprovado digitalmente pelo cliente</p>
                    <p>
                      {formatShortDatePT(quote.approved_at)} · IP {quote.approved_ip ?? 'Verificado'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="w-full sm:w-72 space-y-2 border-t sm:border-t-0 pt-4 sm:pt-0 border-[#E2E8F0]">
              <div className="flex justify-between text-[15px] text-[#475569]">
                <span>Subtotal (s/ IVA)</span>
                <span className="tabular-nums font-medium">{formatEUR(quote.subtotal)}</span>
              </div>
              <div className="flex justify-between text-[15px] text-[#475569]">
                <span>Total IVA</span>
                <span className="tabular-nums font-medium">{formatEUR(quote.vat_total)}</span>
              </div>
              <div
                className="flex justify-between items-baseline pt-3 border-t-2 text-[20px] font-bold"
                style={{ borderColor: accent }}
              >
                <span>TOTAL</span>
                <span className="tabular-nums" style={{ color: accent }}>
                  {formatEUR(quote.total)}
                </span>
              </div>
            </div>
          </div>

          {/* Light White-Label Footer */}
          <div className="pt-6 border-t border-[#E2E8F0] flex items-center justify-between text-[13px] text-[#475569]">
            <span>Condições: Pagamento após conclusão do serviço (MB WAY, Multibanco ou Transferência).</span>
            <div className="flex items-center gap-1.5 shrink-0 ml-4">
              <span>Com tecnologia</span>
              <ZelvoLogo variant="light" size="sm" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
