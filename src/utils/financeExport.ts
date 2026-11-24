import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  formatEUR,
  formatShortDatePT,
  getCategoryLabel,
  PAYMENT_METHOD_LABELS,
  SERVICE_UNIT_LABELS,
} from '../i18n/pt-PT';
import type { Client, Organization, Quote, Transaction } from '../types/database';
import { calculateQuoteTotals } from './calculations';

export interface FinanceExportKpis {
  income: number;
  expense: number;
  net: number;
  pendingTotal: number;
  pendingCount: number;
  avgMonthlyRevenue: number;
  projectedMarginPct: number;
}

export interface SixMonthExportRow {
  fullLabel: string;
  receitas: number;
  despesas: number;
  saldo: number;
}

function escapeCsvCell(value: string): string {
  const safe = value.replace(/\r?\n/g, ' ');
  if (safe.includes(';') || safe.includes('"') || safe.includes(',')) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const num = Number.parseInt(full, 16);
  if (Number.isNaN(num)) return [16, 185, 129];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Exports financial movements (income and expenses) to a UTF-8 BOM CSV file
 * formatted with semicolons for direct opening in Excel (pt-PT).
 */
export function exportFinanceCSV(params: {
  transactions: Transaction[];
  clientsById: Map<string, Client>;
  periodLabel: string;
  categoryLabel?: string;
  organizationSlug: string;
}): void {
  const { transactions, clientsById, periodLabel, categoryLabel, organizationSlug } = params;

  const headers = [
    'Data',
    'Tipo',
    'Categoria',
    'Descrição',
    'Cliente',
    'Método de Pagamento',
    'Valor (EUR)',
  ];

  const rows = transactions.map((tx) => {
    const clientName = tx.client_id ? clientsById.get(tx.client_id)?.name ?? '' : '';
    const signedValue = tx.type === 'INCOME' ? tx.amount : -tx.amount;
    return [
      formatShortDatePT(tx.transaction_date),
      tx.type === 'INCOME' ? 'Receita' : 'Despesa',
      getCategoryLabel(tx.category),
      tx.description ?? '',
      clientName,
      PAYMENT_METHOD_LABELS[tx.payment_method],
      signedValue.toFixed(2).replace('.', ','),
    ].map(escapeCsvCell);
  });

  const csvLines = [
    `# Relatório Financeiro — ${periodLabel}${
      categoryLabel ? ` (Rubrica: ${categoryLabel})` : ''
    }`,
    headers.map(escapeCsvCell).join(';'),
    ...rows.map((r) => r.join(';')),
  ];

  const blob = new Blob([`\uFEFF${csvLines.join('\r\n')}`], {
    type: 'text/csv;charset=utf-8;',
  });
  const dateStamp = format(new Date(), 'yyyy-MM-dd');
  const filename = `zelvo-financas-${organizationSlug}-${dateStamp}.csv`;
  triggerDownload(blob, filename);
}

/**
 * Exports monthly transactions formatted for Portuguese accountants (Excel UTF-8 BOM),
 * including Client NIF and Certified AT Invoice / ATCUD references.
 */
export function exportAccountantCSV(params: {
  transactions: Transaction[];
  clientsById: Map<string, Client>;
  periodLabel: string;
  organizationName: string;
  organizationNif: string | null;
  organizationSlug: string;
}): void {
  const {
    transactions,
    clientsById,
    periodLabel,
    organizationName,
    organizationNif,
    organizationSlug,
  } = params;

  const headers = [
    'Data',
    'Tipo',
    'Categoria',
    'Cliente',
    'NIF',
    'Método',
    'Valor (EUR)',
    'Fatura AT / ATCUD',
  ];

  const rows = transactions.map((tx) => {
    const client = tx.client_id ? clientsById.get(tx.client_id) : undefined;
    const clientName = client?.name ?? (tx.description ?? '');
    const clientNif = client?.nif ?? '';
    const signedValue = tx.type === 'INCOME' ? tx.amount : -tx.amount;
    const fiscalRef = tx.external_invoice_id
      ? `${tx.external_invoice_id}${tx.atcud ? ` (${tx.atcud})` : ''}`
      : '';

    return [
      formatShortDatePT(tx.transaction_date),
      tx.type === 'INCOME' ? 'Entrada' : 'Saída',
      getCategoryLabel(tx.category),
      clientName,
      clientNif,
      PAYMENT_METHOD_LABELS[tx.payment_method],
      signedValue.toFixed(2).replace('.', ','),
      fiscalRef,
    ].map(escapeCsvCell);
  });

  const csvLines = [
    `# Exportação Contabilista — ${organizationName}${organizationNif ? ` (NIF ${organizationNif})` : ''} — ${periodLabel}`,
    headers.map(escapeCsvCell).join(';'),
    ...rows.map((r) => r.join(';')),
  ];

  const blob = new Blob([`\uFEFF${csvLines.join('\r\n')}`], {
    type: 'text/csv;charset=utf-8;',
  });
  const dateStamp = format(new Date(), 'yyyy-MM-dd');
  const filename = `zelvo-contabilista-${organizationSlug}-${dateStamp}.csv`;
  triggerDownload(blob, filename);
}

/**
 * Generates a detailed Light White-Label financial report PDF using jsPDF + jspdf-autotable.
 */
export function exportFinancePDF(params: {
  organization: Organization;
  periodLabel: string;
  categoryLabel?: string;
  kpis: FinanceExportKpis;
  transactions: Transaction[];
  clientsById: Map<string, Client>;
  sixMonthSeries: SixMonthExportRow[];
}): void {
  const {
    organization,
    periodLabel,
    categoryLabel,
    kpis,
    transactions,
    clientsById,
    sixMonthSeries,
  } = params;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const accentRgb = hexToRgb(organization.primary_color || '#10B981');

  // Top Accent Stripe
  doc.setFillColor(accentRgb[0], accentRgb[1], accentRgb[2]);
  doc.rect(0, 0, pageWidth, 4, 'F');

  // Header Block
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(organization.name, 14, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  const orgDetails = [
    organization.nif ? `NIF: ${organization.nif}` : null,
    organization.phone ? `Tel.: ${organization.phone}` : null,
    organization.email ?? null,
  ]
    .filter(Boolean)
    .join('  |  ');
  if (orgDetails) {
    doc.text(orgDetails, 14, 22);
  }

  // Right-aligned Report Meta
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(accentRgb[0], accentRgb[1], accentRgb[2]);
  doc.text('RELATÓRIO FINANCEIRO', pageWidth - 14, 15, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Período: ${periodLabel}${categoryLabel ? ` (${categoryLabel})` : ''}`,
    pageWidth - 14,
    21,
    { align: 'right' }
  );
  doc.text(
    `Emitido em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`,
    pageWidth - 14,
    26,
    { align: 'right' }
  );

  // Divider
  doc.setDrawColor(226, 232, 240);
  doc.line(14, 30, pageWidth - 14, 30);

  // 1. KPI Summary Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('1. Resumo de Indicadores (KPIs)', 14, 37);

  autoTable(doc, {
    startY: 40,
    head: [['Indicador', 'Valor', 'Indicador de Rentabilidade', 'Valor']],
    body: [
      [
        'Entradas do Mês',
        formatEUR(kpis.income),
        'Média Faturação Mensal',
        formatEUR(kpis.avgMonthlyRevenue),
      ],
      [
        'Saídas do Mês',
        formatEUR(kpis.expense),
        'Margem de Lucro Projetada',
        `${kpis.projectedMarginPct.toFixed(1).replace('.', ',')}%`,
      ],
      [
        'Saldo Líquido do Mês',
        `${kpis.net >= 0 ? '+' : ''}${formatEUR(kpis.net)}`,
        `Pendente a Receber (${kpis.pendingCount})`,
        formatEUR(kpis.pendingTotal),
      ],
    ],
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 9,
    },
    styles: {
      fontSize: 9,
      cellPadding: 3,
      textColor: [15, 23, 42],
    },
    columnStyles: {
      1: { halign: 'right', fontStyle: 'bold' },
      3: { halign: 'right', fontStyle: 'bold' },
    },
  });

  // 2. Category Breakdown
  const afterKpiY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 72;

  const categoryTotals = new Map<
    string,
    { label: string; type: 'Receita' | 'Despesa'; count: number; total: number }
  >();
  for (const tx of transactions) {
    const key = `${tx.type}:${tx.category}`;
    const existing = categoryTotals.get(key) ?? {
      label: getCategoryLabel(tx.category),
      type: tx.type === 'INCOME' ? 'Receita' : 'Despesa',
      count: 0,
      total: 0,
    };
    existing.count += 1;
    existing.total += tx.amount;
    categoryTotals.set(key, existing);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('2. Detalhe de Movimentos', 14, afterKpiY + 9);

  autoTable(doc, {
    startY: afterKpiY + 12,
    head: [['Data', 'Tipo', 'Categoria', 'Descrição / Cliente', 'Método', 'Valor']],
    body:
      transactions.length > 0
        ? transactions.map((tx) => {
            const client = tx.client_id ? clientsById.get(tx.client_id)?.name : null;
            const desc = [tx.description || getCategoryLabel(tx.category), client]
              .filter(Boolean)
              .join(' — ');
            const sign = tx.type === 'INCOME' ? '+' : '-';
            return [
              formatShortDatePT(tx.transaction_date),
              tx.type === 'INCOME' ? 'Receita' : 'Despesa',
              getCategoryLabel(tx.category),
              desc,
              PAYMENT_METHOD_LABELS[tx.payment_method],
              `${sign}${formatEUR(tx.amount)}`,
            ];
          })
        : [['—', '—', '—', 'Sem movimentos registados no filtro selecionado', '—', '0,00 €']],
    theme: 'striped',
    headStyles: {
      fillColor: accentRgb,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    styles: {
      fontSize: 8.5,
      cellPadding: 2.6,
      textColor: [15, 23, 42],
    },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 18 },
      2: { cellWidth: 32 },
      4: { cellWidth: 24 },
      5: { halign: 'right', fontStyle: 'bold', cellWidth: 25 },
    },
    didParseCell: (hookData) => {
      if (hookData.section === 'body' && hookData.column.index === 5) {
        const text = String(hookData.cell.raw ?? '');
        if (text.startsWith('+')) {
          hookData.cell.styles.textColor = [21, 128, 61];
        } else if (text.startsWith('-')) {
          hookData.cell.styles.textColor = [185, 28, 28];
        }
      }
    },
  });

  // 3. Breakdown by Category + 6-Month Evolution
  const afterMovY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 150;

  if (categoryTotals.size > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('3. Totais por Rubrica', 14, afterMovY + 9);

    autoTable(doc, {
      startY: afterMovY + 12,
      head: [['Rubrica', 'Tipo', 'N.º Movimentos', 'Total']],
      body: Array.from(categoryTotals.values()).map((row) => [
        row.label,
        row.type,
        String(row.count),
        `${row.type === 'Receita' ? '+' : '-'}${formatEUR(row.total)}`,
      ]),
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8.5 },
      styles: { fontSize: 8.5, cellPadding: 2.5 },
      columnStyles: {
        2: { halign: 'right' },
        3: { halign: 'right', fontStyle: 'bold' },
      },
    });
  }

  const afterCatY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? afterMovY;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('4. Evolução de Rentabilidade (Últimos 6 Meses)', 14, afterCatY + 9);

  autoTable(doc, {
    startY: afterCatY + 12,
    head: [['Mês', 'Receitas', 'Despesas', 'Saldo Líquido', 'Margem']],
    body: sixMonthSeries.map((m) => {
      const margin = m.receitas > 0 ? `${Math.round((m.saldo / m.receitas) * 100)}%` : '—';
      return [
        m.fullLabel,
        formatEUR(m.receitas),
        formatEUR(m.despesas),
        `${m.saldo >= 0 ? '+' : ''}${formatEUR(m.saldo)}`,
        margin,
      ];
    }),
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8.5 },
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right', fontStyle: 'bold' },
      4: { halign: 'right' },
    },
  });

  // Footer with page numbers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Relatório gerado com tecnologia zelvo · ${organization.name}`,
      14,
      pageHeight - 8
    );
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - 14, pageHeight - 8, {
      align: 'right',
    });
  }

  const dateStamp = format(new Date(), 'yyyy-MM-dd');
  doc.save(`zelvo-relatorio-financeiro-${organization.slug}-${dateStamp}.pdf`);
}

/**
 * Generates an automatic invoice PDF from a recurring maintenance quote using jsPDF + autoTable.
 */
export function exportGeneratedInvoicePDF(params: {
  invoiceNumber: string;
  issueDate: string;
  quote: Quote;
  organization: Organization;
  client: Client | null;
}): void {
  const { invoiceNumber, issueDate, quote, organization, client } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const accentRgb = hexToRgb(organization.primary_color || '#10B981');
  const totals = calculateQuoteTotals(quote.items);

  doc.setFillColor(accentRgb[0], accentRgb[1], accentRgb[2]);
  doc.rect(0, 0, pageWidth, 4, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text(organization.name, 14, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    [
      organization.nif ? `NIF: ${organization.nif}` : null,
      organization.phone ? `Tel.: ${organization.phone}` : null,
      organization.email ?? null,
    ]
      .filter(Boolean)
      .join('  |  '),
    14,
    22
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(accentRgb[0], accentRgb[1], accentRgb[2]);
  doc.text(`FATURA AUTOMÁTICA ${invoiceNumber}`, pageWidth - 14, 15, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Contrato Ref.: ${quote.quote_number}`, pageWidth - 14, 21, { align: 'right' });
  doc.text(`Data de Emissão: ${formatShortDatePT(issueDate)}`, pageWidth - 14, 26, {
    align: 'right',
  });

  doc.setDrawColor(226, 232, 240);
  doc.line(14, 30, pageWidth - 14, 30);

  // Client details
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 35, pageWidth - 28, 22, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(`Cliente: ${client?.name ?? 'Cliente Contratual'}`, 18, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  if (client?.billing_address) {
    doc.text(client.billing_address, 18, 48);
  }
  doc.text(
    [
      client?.nif ? `NIF: ${client.nif}` : null,
      client?.phone ? `Tel.: ${client.phone}` : null,
      client?.email ?? null,
    ]
      .filter(Boolean)
      .join(' · '),
    18,
    53
  );

  autoTable(doc, {
    startY: 64,
    head: [['Serviço Contratado', 'Unidade', 'Qtd.', 'Preço Unit.', 'IVA', 'Subtotal']],
    body: quote.items.map((item) => [
      item.name,
      SERVICE_UNIT_LABELS[item.unit],
      String(item.qty),
      formatEUR(item.unit_price),
      `${item.vat_rate}%`,
      formatEUR(item.total),
    ]),
    theme: 'striped',
    headStyles: { fillColor: accentRgb, textColor: 255, fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right', fontStyle: 'bold' },
    },
  });

  const finalY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 120;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text('Subtotal (s/ IVA):', pageWidth - 65, finalY + 12);
  doc.text(formatEUR(totals.subtotal), pageWidth - 14, finalY + 12, { align: 'right' });

  doc.text('Total IVA:', pageWidth - 65, finalY + 18);
  doc.text(formatEUR(totals.vat_total), pageWidth - 14, finalY + 18, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(accentRgb[0], accentRgb[1], accentRgb[2]);
  doc.text('TOTAL A PAGAR:', pageWidth - 65, finalY + 27);
  doc.text(formatEUR(totals.total), pageWidth - 14, finalY + 27, { align: 'right' });

  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Fatura gerada automaticamente de contrato de manutenção · Com tecnologia zelvo`,
    14,
    pageHeight - 10
  );

  doc.save(`${invoiceNumber.toLowerCase()}-${organization.slug}.pdf`);
}
