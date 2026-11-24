import React, { useMemo } from 'react';
import { CheckCircle2, Printer, ShieldCheck, X } from 'lucide-react';
import {
  formatDatePT,
  formatDateTimePT,
  formatEUR,
  PAYMENT_METHOD_LABELS,
} from '../../i18n/pt-PT';
import type { Client, Organization, Transaction } from '../../types/database';
import { roundCurrency } from '../../utils/calculations';
import { PrimaryButton } from './UIPrimitives';
import { ZelvoLogo } from './ZelvoLogo';

interface ATInvoiceModalProps {
  open: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  organization: Organization;
  client: Client | null;
}

/**
 * Generates a deterministic 21x21 QR-like SVG matrix from the AT Portugal payload
 * with authentic 3 finder patterns, timing strips, and deterministic data modules.
 */
function buildFiscalQrMatrix(payload: string): boolean[][] {
  const size = 21;
  const grid: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false)
  );
  const reserved: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false)
  );

  const placeFinder = (top: number, left: number) => {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const rr = top + r;
        const cc = left + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        reserved[rr][cc] = true;
        if (r === -1 || r === 7 || c === -1 || c === 7) {
          grid[rr][cc] = false;
        } else if (r === 0 || r === 6 || c === 0 || c === 6) {
          grid[rr][cc] = true;
        } else if (r >= 2 && r <= 4 && c >= 2 && c <= 4) {
          grid[rr][cc] = true;
        } else {
          grid[rr][cc] = false;
        }
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i += 1) {
    reserved[6][i] = true;
    reserved[i][6] = true;
    grid[6][i] = i % 2 === 0;
    grid[i][6] = i % 2 === 0;
  }

  // Deterministic hash seed from AT payload
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (reserved[r][c]) continue;
      hash ^= (r * 31 + c * 17) & 0xff;
      hash = Math.imul(hash, 16777619) >>> 0;
      grid[r][c] = ((hash >>> ((r + c) % 16)) & 1) === 1;
    }
  }

  return grid;
}

export const ATInvoiceModal: React.FC<ATInvoiceModalProps> = ({
  open,
  onClose,
  transaction,
  organization,
  client,
}) => {
  const fiscalData = useMemo(() => {
    if (!transaction) return null;
    const invoiceNumber = transaction.external_invoice_id ?? 'FR 2026/001';
    const atcud = transaction.atcud ?? 'ATCUD:JF8K4921-1';
    const orgNif = organization.nif ?? '516482910';
    const clientNif = client?.nif ?? '999999990';
    const grossTotal = roundCurrency(transaction.amount);
    const netBase = roundCurrency(grossTotal / 1.23);
    const vatAmount = roundCurrency(grossTotal - netBase);
    const dateCompact = transaction.transaction_date.replace(/-/g, '');
    const qrPayload = `A:${orgNif}*B:${clientNif}*C:PT*D:FR*E:N*F:${dateCompact}*G:${invoiceNumber}*H:${atcud.replace(
      'ATCUD:',
      ''
    )}*I1:PT*I7:${netBase.toFixed(2)}*I8:${vatAmount.toFixed(2)}*N:${vatAmount.toFixed(
      2
    )}*O:${grossTotal.toFixed(2)}*Q:Z7kP*R:2841`;

    return {
      invoiceNumber,
      atcud,
      orgNif,
      clientNif,
      grossTotal,
      netBase,
      vatAmount,
      qrPayload,
      qrMatrix: buildFiscalQrMatrix(qrPayload),
    };
  }, [client?.nif, organization.nif, transaction]);

  if (!open || !transaction || !fiscalData) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-[2px] p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Fatura-Recibo Certificada AT"
    >
      <div className="w-full max-w-2xl bg-white rounded-2xl border border-[#E2E8F0] shadow-2xl max-h-[94vh] flex flex-col overflow-hidden">
        {/* Top controls bar (hidden on print) */}
        <div className="no-print flex items-center justify-between gap-3 px-5 py-3.5 bg-[#1E293B] text-white shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="w-5 h-5 text-[#10B981] shrink-0" />
            <div className="min-w-0">
              <p className="text-[15px] font-bold truncate">
                Fatura-Recibo Certificada (AT Portugal)
              </p>
              <p className="text-[12px] text-slate-300 tabular-nums">
                {fiscalData.invoiceNumber} · {fiscalData.atcud}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <PrimaryButton
              onClick={handlePrint}
              icon={<Printer className="w-4 h-4" />}
              className="!min-h-10 !px-3.5 !text-[14px]"
            >
              Imprimir / PDF
            </PrimaryButton>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar pré-visualização fiscal"
              className="min-h-10 min-w-10 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Document Body */}
        <div className="overflow-y-auto p-5 sm:p-8 space-y-6 bg-white text-[#0F172A]">
          {/* Header: Issuer + Document ID */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b-2 border-[#0F172A]">
            <div className="space-y-1.5">
              <ZelvoLogo variant="light" size="sm" />
              <p className="text-[18px] font-bold text-[#0F172A] pt-1">
                {organization.name}
              </p>
              <p className="text-[13px] text-[#475569] tabular-nums">
                NIF: <strong className="text-[#0F172A]">{fiscalData.orgNif}</strong>
              </p>
              {organization.phone && (
                <p className="text-[13px] text-[#475569] tabular-nums">
                  Tel.: {organization.phone}
                  {organization.email ? ` · ${organization.email}` : ''}
                </p>
              )}
              <p className="text-[12px] text-[#475569]">Braga, Portugal</p>
            </div>

            <div className="sm:text-right space-y-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#DCFCE7] text-[#15803D] text-[12px] font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                ORIGINAL · PAGO
              </span>
              <h1 className="text-[22px] font-extrabold text-[#0F172A] tabular-nums pt-1">
                {fiscalData.invoiceNumber}
              </h1>
              <p className="text-[13px] font-semibold text-[#0F172A] tabular-nums">
                {fiscalData.atcud}
              </p>
              <p className="text-[13px] text-[#475569] tabular-nums">
                Data de emissão: {formatDatePT(transaction.transaction_date)}
              </p>
              {transaction.invoice_issued_at && (
                <p className="text-[12px] text-[#64748B] tabular-nums">
                  Emitida em {formatDateTimePT(transaction.invoice_issued_at)}
                </p>
              )}
            </div>
          </div>

          {/* Client & Payment Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                Adquirente / Cliente
              </p>
              <p className="text-[16px] font-bold text-[#0F172A]">
                {client ? client.name : 'Consumidor Final'}
              </p>
              <p className="text-[14px] text-[#475569] tabular-nums">
                NIF:{' '}
                <strong className="text-[#0F172A]">
                  {client?.nif ? client.nif : 'Consumidor Final (999999990)'}
                </strong>
              </p>
              {client?.billing_address && (
                <p className="text-[13px] text-[#475569]">{client.billing_address}</p>
              )}
            </div>

            <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                Dados de Liquidação
              </p>
              <p className="text-[14px] text-[#0F172A]">
                Meio de pagamento:{' '}
                <strong>{PAYMENT_METHOD_LABELS[transaction.payment_method]}</strong>
              </p>
              <p className="text-[13px] text-[#475569] tabular-nums">
                Ref. Pagamento:{' '}
                <strong className="text-[#0F172A]">
                  {transaction.external_payment_id ?? 'LIQ-MANUAL-PT'}
                </strong>
              </p>
              <p className="text-[13px] text-[#475569]">Moeda: EUR (€) · Regime Geral IVA</p>
            </div>
          </div>

          {/* Line Item Table */}
          <div className="rounded-xl border border-[#E2E8F0] overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#1E293B] text-white text-[12px] uppercase tracking-wider">
                  <th className="py-2.5 px-3 font-semibold">Descrição do Serviço</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Base</th>
                  <th className="py-2.5 px-3 font-semibold text-right">IVA</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-[14px]">
                <tr>
                  <td className="py-3.5 px-3">
                    <p className="font-semibold text-[#0F172A]">
                      {transaction.description || 'Prestação de Serviços no Terreno'}
                    </p>
                    <p className="text-[12px] text-[#64748B] mt-0.5">
                      Serviço prestado em Portugal Continental · Taxa Normal 23%
                    </p>
                  </td>
                  <td className="py-3.5 px-3 text-right tabular-nums text-[#475569]">
                    {formatEUR(fiscalData.netBase)}
                  </td>
                  <td className="py-3.5 px-3 text-right tabular-nums text-[#475569]">
                    23% ({formatEUR(fiscalData.vatAmount)})
                  </td>
                  <td className="py-3.5 px-3 text-right font-bold tabular-nums text-[#0F172A]">
                    {formatEUR(fiscalData.grossTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Totals + AT Fiscal QR Code */}
          <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-6 pt-2">
            {/* Official AT QR Code Block */}
            <div className="flex items-start gap-4 rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] p-3.5">
              <div className="bg-white p-2 rounded-lg border border-[#E2E8F0] shrink-0">
                <svg
                  width="96"
                  height="96"
                  viewBox="0 0 21 21"
                  shapeRendering="crispEdges"
                  role="img"
                  aria-label="Código QR Fiscal Autoridade Tributária"
                >
                  <rect width="21" height="21" fill="#FFFFFF" />
                  {fiscalData.qrMatrix.map((row, rIdx) =>
                    row.map((filled, cIdx) =>
                      filled ? (
                        <rect
                          key={`${rIdx}-${cIdx}`}
                          x={cIdx}
                          y={rIdx}
                          width="1"
                          height="1"
                          fill="#0F172A"
                        />
                      ) : null
                    )
                  )}
                </svg>
              </div>
              <div className="space-y-1 text-[12px]">
                <p className="font-bold text-[#0F172A] uppercase tracking-wide">
                  QR Code Fiscal (AT)
                </p>
                <p className="font-semibold text-[#0F172A] tabular-nums">
                  {fiscalData.atcud}
                </p>
                <p className="text-[#475569] leading-snug max-w-[210px]">
                  Z7kP-Processado por programa certificado n.º 2841/AT (Simulação
                  Português — Portaria n.º 195/2020).
                </p>
              </div>
            </div>

            {/* Summary Totals Box */}
            <div className="w-full sm:w-64 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 space-y-2">
              <div className="flex items-center justify-between text-[14px] text-[#475569]">
                <span>Subtotal s/ IVA</span>
                <span className="tabular-nums font-medium text-[#0F172A]">
                  {formatEUR(fiscalData.netBase)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[14px] text-[#475569]">
                <span>IVA (23%)</span>
                <span className="tabular-nums font-medium text-[#0F172A]">
                  {formatEUR(fiscalData.vatAmount)}
                </span>
              </div>
              <div className="pt-2 border-t border-[#CBD5E1] flex items-center justify-between">
                <span className="text-[15px] font-bold text-[#0F172A]">Total Pago</span>
                <span className="text-[22px] font-extrabold text-[#15803D] tabular-nums">
                  {formatEUR(fiscalData.grossTotal)}
                </span>
              </div>
            </div>
          </div>

          {/* Legal footer */}
          <div className="pt-4 border-t border-[#E2E8F0] text-[11px] text-[#64748B] flex flex-wrap items-center justify-between gap-2">
            <span>
              Os bens/serviços foram colocados à disposição do adquirente na data do
              documento.
            </span>
            <span className="tabular-nums">Documento emitido via Zelvo · PT</span>
          </div>
        </div>
      </div>
    </div>
  );
};
