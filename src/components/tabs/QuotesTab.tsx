import React, { useEffect, useMemo, useState } from 'react';
import { addDays, format } from 'date-fns';
import {
  CheckCircle2,
  Edit3,
  ExternalLink,
  FileText,
  MessageCircle,
  Package,
  Plus,
  Printer,
  Trash2,
} from 'lucide-react';
import {
  formatEUR,
  formatShortDatePT,
  QUOTE_STATUS_LABELS,
  SERVICE_UNIT_LABELS,
} from '../../i18n/pt-PT';
import { useZelvo } from '../../store/ZelvoContext';
import type {
  Quote,
  QuoteItem,
  ServiceCatalogItem,
  ServiceUnit,
} from '../../types/database';
import {
  buildWhatsAppUrl,
  calculateQuoteTotals,
  generateId,
  isQuoteExpired,
} from '../../utils/calculations';
import { QuotePrintModal } from '../common/QuotePrintModal';
import {
  EmptyState,
  Modal,
  PrimaryButton,
  StatusBadge,
  type SemanticTone,
} from '../common/UIPrimitives';

interface QuotesTabProps {
  preselectedLeadId?: string | null;
  onClearPreselectedLead?: () => void;
  onOpenQuoteInPortal: (token: string) => void;
}

const QUOTE_STATUS_TONE: Record<Quote['status'], SemanticTone> = {
  DRAFT: 'neutral',
  SENT: 'info',
  APPROVED: 'success',
  REJECTED: 'danger',
  EXPIRED: 'warning',
};

export const QuotesTab: React.FC<QuotesTabProps> = ({
  preselectedLeadId,
  onClearPreselectedLead,
  onOpenQuoteInPortal,
}) => {
  const {
    db,
    organization,
    upsertCatalogItem,
    softDeleteCatalogItem,
    createQuote,
    updateQuoteStatus,
    showToast,
  } = useZelvo();

  const [subTab, setSubTab] = useState<'quotes' | 'catalog'>('quotes');
  const [quoteBuilderOpen, setQuoteBuilderOpen] = useState(false);
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);
  const [editingCatalog, setEditingCatalog] = useState<ServiceCatalogItem | null>(null);
  const [printQuote, setPrintQuote] = useState<Quote | null>(null);

  useEffect(() => {
    if (preselectedLeadId) {
      setSubTab('quotes');
      setQuoteBuilderOpen(true);
    }
  }, [preselectedLeadId]);

  const activeQuotes = useMemo(
    () =>
      db.quotes
        .filter((q) => !q.deleted_at)
        .sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ),
    [db.quotes]
  );

  const activeCatalog = useMemo(
    () =>
      db.service_catalog
        .filter((c) => !c.deleted_at)
        .sort((a, b) => a.name.localeCompare(b.name, 'pt')),
    [db.service_catalog]
  );

  const clientsById = useMemo(() => new Map(db.clients.map((c) => [c.id, c])), [db.clients]);
  const leadsById = useMemo(() => new Map(db.leads.map((l) => [l.id, l])), [db.leads]);

  const handleSendWhatsApp = (quote: Quote) => {
    const client = quote.client_id ? clientsById.get(quote.client_id) : null;
    const lead = quote.lead_id ? leadsById.get(quote.lead_id) : null;
    const recipientName = client?.name ?? lead?.name ?? 'Cliente';
    const recipientPhone = client?.phone ?? lead?.phone ?? organization.phone ?? '910000000';

    if (quote.status === 'DRAFT') {
      updateQuoteStatus(quote.id, 'SENT');
    }

    const portalUrl = `${window.location.origin}/q/${quote.public_token}`;
    const msg = `Olá ${recipientName}, segue o orçamento ${quote.quote_number} da ${organization.name} no valor total de ${formatEUR(quote.total)} (IVA incluído). Pode consultar o PDF e aprovar com 1 clique aqui: ${portalUrl}`;
    const waUrl = buildWhatsAppUrl(recipientPhone, msg);

    showToast(
      `Orçamento ${quote.quote_number} pronto no WhatsApp e marcado como Enviado.`,
      'success'
    );

    const link = document.createElement('a');
    link.href = waUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.click();
  };

  return (
    <div className="space-y-4">
      {/* Sub-navigation + Primary CTA */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex items-center p-1 rounded-xl bg-slate-200/80 border border-[#CBD5E1]"
          role="tablist"
        >
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'quotes'}
            onClick={() => setSubTab('quotes')}
            className={`min-h-[42px] px-4 rounded-lg text-[15px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'quotes'
                ? 'bg-white text-[#0F172A] shadow-xs'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            Orçamentos (<span className="tabular-nums">{activeQuotes.length}</span>)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'catalog'}
            onClick={() => setSubTab('catalog')}
            className={`min-h-[42px] px-4 rounded-lg text-[15px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'catalog'
                ? 'bg-white text-[#0F172A] shadow-xs'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            Catálogo (<span className="tabular-nums">{activeCatalog.length}</span>)
          </button>
        </div>

        {subTab === 'quotes' ? (
          <PrimaryButton
            onClick={() => setQuoteBuilderOpen(true)}
            icon={<Plus className="w-5 h-5" />}
          >
            Novo Orçamento
          </PrimaryButton>
        ) : (
          <PrimaryButton
            onClick={() => {
              setEditingCatalog(null);
              setCatalogModalOpen(true);
            }}
            icon={<Plus className="w-5 h-5" />}
          >
            Novo Serviço
          </PrimaryButton>
        )}
      </div>

      {/* Quotes List */}
      {subTab === 'quotes' && (
        <>
          {activeQuotes.length === 0 ? (
            <EmptyState
              icon={<FileText className="w-6 h-6" />}
              title="Ainda sem orçamentos"
              description="Crie propostas rápidas a partir do seu catálogo, imprima em PDF com a sua marca e envie por WhatsApp."
              actionLabel="+ Novo Orçamento"
              onAction={() => setQuoteBuilderOpen(true)}
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {activeQuotes.map((quote) => {
                const client = quote.client_id ? clientsById.get(quote.client_id) : null;
                const lead = quote.lead_id ? leadsById.get(quote.lead_id) : null;
                const recipientName = client?.name ?? lead?.name ?? 'Cliente não associado';
                const expired =
                  quote.status === 'SENT' && isQuoteExpired(quote.valid_until);

                return (
                  <article
                    key={quote.id}
                    className="bg-white border border-[#E2E8F0] rounded-xl p-4 flex flex-col justify-between gap-3.5"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[13px] font-bold text-[#059669] tabular-nums">
                            {quote.quote_number}
                          </p>
                          <h3 className="text-[18px] font-bold text-[#0F172A]">
                            {recipientName}
                          </h3>
                        </div>
                        <StatusBadge
                          tone={expired ? 'warning' : QUOTE_STATUS_TONE[quote.status]}
                          label={expired ? 'Expirado' : QUOTE_STATUS_LABELS[quote.status]}
                        />
                      </div>

                      <div className="text-[14px] text-[#475569] space-y-1">
                        <p className="tabular-nums">
                          {quote.items.length}{' '}
                          {quote.items.length === 1 ? 'serviço' : 'serviços'} · Emissão{' '}
                          {formatShortDatePT(quote.created_at)}
                          {quote.valid_until
                            ? ` · Válido até ${formatShortDatePT(quote.valid_until)}`
                            : ''}
                        </p>
                        {quote.approved_at && (
                          <p className="text-[#15803D] font-medium flex items-center gap-1.5 tabular-nums">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span>
                              Aprovado em {formatShortDatePT(quote.approved_at)}
                            </span>
                          </p>
                        )}
                      </div>

                      <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3.5 py-2.5 flex items-center justify-between">
                        <div className="text-[13px] text-[#475569] tabular-nums">
                          Subtotal {formatEUR(quote.subtotal)} + IVA{' '}
                          {formatEUR(quote.vat_total)}
                        </div>
                        <div className="text-[18px] font-bold text-[#0F172A] tabular-nums">
                          {formatEUR(quote.total)}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 pt-1">
                      <div className="grid grid-cols-2 gap-2">
                        <PrimaryButton
                          variant="secondary"
                          onClick={() => setPrintQuote(quote)}
                          icon={<Printer className="w-4 h-4" />}
                        >
                          PDF / Imprimir
                        </PrimaryButton>
                        <PrimaryButton
                          onClick={() => handleSendWhatsApp(quote)}
                          icon={<MessageCircle className="w-4 h-4" />}
                        >
                          WhatsApp
                        </PrimaryButton>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (quote.status === 'DRAFT') {
                            updateQuoteStatus(quote.id, 'SENT');
                          }
                          onOpenQuoteInPortal(quote.public_token);
                        }}
                        className="w-full min-h-[44px] px-3 rounded-lg border border-dashed border-[#CBD5E1] text-[14px] font-semibold text-[#0369A1] hover:bg-[#E0F2FE]/40 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span>Abrir no Portal Cliente (/q/{quote.public_token.slice(0, 10)}…)</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Service Catalog List */}
      {subTab === 'catalog' && (
        <>
          {activeCatalog.length === 0 ? (
            <EmptyState
              icon={<Package className="w-6 h-6" />}
              title="Catálogo vazio"
              description="Adicione os seus serviços padrão com preço, unidade e taxa de IVA para criar orçamentos em segundos."
              actionLabel="+ Novo Serviço"
              onAction={() => {
                setEditingCatalog(null);
                setCatalogModalOpen(true);
              }}
            />
          ) : (
            <div className="bg-white border border-[#E2E8F0] rounded-xl divide-y divide-[#E2E8F0] overflow-hidden">
              {activeCatalog.map((item) => (
                <div
                  key={item.id}
                  className="p-4 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <h3 className="text-[16px] font-bold text-[#0F172A]">{item.name}</h3>
                    {item.description && (
                      <p className="text-[14px] text-[#475569] line-clamp-2">
                        {item.description}
                      </p>
                    )}
                    <p className="text-[14px] font-semibold text-[#059669] tabular-nums pt-0.5">
                      {formatEUR(item.unit_price)} / {SERVICE_UNIT_LABELS[item.unit]} · IVA{' '}
                      {item.vat_rate}%
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCatalog(item);
                        setCatalogModalOpen(true);
                      }}
                      aria-label={`Editar ${item.name}`}
                      className="min-h-[44px] min-w-[44px] rounded-lg border border-[#CBD5E1] flex items-center justify-center text-[#0F172A] hover:bg-slate-50 cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => softDeleteCatalogItem(item.id)}
                      aria-label={`Remover ${item.name}`}
                      className="min-h-[44px] min-w-[44px] rounded-lg border border-[#FECACA] flex items-center justify-center text-[#B91C1C] hover:bg-red-50 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Quote Builder Modal */}
      <QuoteBuilderModal
        open={quoteBuilderOpen}
        onClose={() => {
          setQuoteBuilderOpen(false);
          onClearPreselectedLead?.();
        }}
        initialLeadId={preselectedLeadId}
        catalog={activeCatalog}
        onSave={(payload) => {
          createQuote(payload);
          setQuoteBuilderOpen(false);
          onClearPreselectedLead?.();
        }}
      />

      {/* Catalog Item Modal */}
      <CatalogItemModal
        open={catalogModalOpen}
        onClose={() => setCatalogModalOpen(false)}
        initialItem={editingCatalog}
        onSave={(payload) => {
          upsertCatalogItem(payload);
          setCatalogModalOpen(false);
        }}
      />

      {/* Light White-Label PDF Print Modal */}
      <QuotePrintModal
        open={Boolean(printQuote)}
        onClose={() => setPrintQuote(null)}
        quote={printQuote}
        organization={organization}
        client={
          printQuote?.client_id ? clientsById.get(printQuote.client_id) ?? null : null
        }
        lead={printQuote?.lead_id ? leadsById.get(printQuote.lead_id) ?? null : null}
      />
    </div>
  );
};

/* --- Catalog Upsert Modal --- */
interface CatalogItemModalProps {
  open: boolean;
  onClose: () => void;
  initialItem: ServiceCatalogItem | null;
  onSave: (payload: {
    id?: string;
    name: string;
    description?: string | null;
    unit: ServiceUnit;
    unit_price: number;
    cost_price: number;
    vat_rate: number;
  }) => void;
}

const CatalogItemModal: React.FC<CatalogItemModalProps> = ({
  open,
  onClose,
  initialItem,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [unit, setUnit] = useState<ServiceUnit>('FIXED');
  const [unitPrice, setUnitPrice] = useState('50');
  const [costPrice, setCostPrice] = useState('15');
  const [vatRate, setVatRate] = useState('23');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(initialItem?.name ?? '');
    setDescription(initialItem?.description ?? '');
    setUnit(initialItem?.unit ?? 'FIXED');
    setUnitPrice(initialItem ? String(initialItem.unit_price) : '50');
    setCostPrice(initialItem ? String(initialItem.cost_price) : '15');
    setVatRate(initialItem ? String(initialItem.vat_rate) : '23');
    setError('');
  }, [initialItem, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Indique o nome do serviço.');
      return;
    }
    onSave({
      id: initialItem?.id,
      name: name.trim(),
      description: description.trim() || null,
      unit,
      unit_price: Math.max(0, Number(unitPrice) || 0),
      cost_price: Math.max(0, Number(costPrice) || 0),
      vat_rate: Math.max(0, Number(vatRate) || 0),
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initialItem ? 'Editar Serviço do Catálogo' : 'Novo Serviço no Catálogo'}
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        {error && (
          <div className="p-3 rounded-lg bg-[#FEE2E2] text-[#B91C1C] text-[14px] font-medium">
            {error}
          </div>
        )}
        <div>
          <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
            Nome do Serviço *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Corte de Relva e Bordaduras"
            className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px]"
          />
        </div>
        <div>
          <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
            Descrição
          </label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full p-3 rounded-[10px] border border-[#CBD5E1] text-[16px]"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
              Unidade
            </label>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as ServiceUnit)}
              className="w-full min-h-12 px-3 rounded-[10px] border border-[#CBD5E1] bg-white text-[16px]"
            >
              {(Object.keys(SERVICE_UNIT_LABELS) as ServiceUnit[]).map((u) => (
                <option key={u} value={u}>
                  {SERVICE_UNIT_LABELS[u]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
              Taxa de IVA (%)
            </label>
            <select
              value={vatRate}
              onChange={(e) => setVatRate(e.target.value)}
              className="w-full min-h-12 px-3 rounded-[10px] border border-[#CBD5E1] bg-white text-[16px] tabular-nums"
            >
              <option value="23">23% (Normal)</option>
              <option value="13">13% (Intermédia)</option>
              <option value="6">6% (Reduzida)</option>
              <option value="0">0% (Isento)</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
              Preço Unitário (€) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px] tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
              Custo Estimado (€)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px] tabular-nums"
            />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <PrimaryButton type="button" variant="secondary" fullWidth onClick={onClose}>
            Cancelar
          </PrimaryButton>
          <PrimaryButton type="submit" fullWidth>
            Guardar Serviço
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
};

/* --- Quote Builder Modal (TC-07 exact VAT calculation) --- */
interface QuoteBuilderModalProps {
  open: boolean;
  onClose: () => void;
  initialLeadId?: string | null;
  catalog: ServiceCatalogItem[];
  onSave: (payload: {
    lead_id?: string | null;
    client_id?: string | null;
    items: Array<Omit<QuoteItem, 'total'>>;
    valid_until: string | null;
    status: 'DRAFT' | 'SENT';
  }) => void;
}

const QuoteBuilderModal: React.FC<QuoteBuilderModalProps> = ({
  open,
  onClose,
  initialLeadId,
  catalog,
  onSave,
}) => {
  const { db } = useZelvo();
  const [targetType, setTargetType] = useState<'lead' | 'client'>('lead');
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [validUntil, setValidUntil] = useState(() =>
    format(addDays(new Date(), 15), 'yyyy-MM-dd')
  );
  const [items, setItems] = useState<Array<Omit<QuoteItem, 'total'>>>([]);
  const [error, setError] = useState('');

  const availableLeads = useMemo(
    () => db.leads.filter((l) => !l.deleted_at && l.status !== 'LOST'),
    [db.leads]
  );
  const availableClients = useMemo(
    () => db.clients.filter((c) => !c.deleted_at && !c.is_anonymized),
    [db.clients]
  );

  useEffect(() => {
    if (!open) return;
    if (initialLeadId) {
      setTargetType('lead');
      setSelectedLeadId(initialLeadId);
    } else if (availableLeads.length > 0) {
      setTargetType('lead');
      setSelectedLeadId(availableLeads[0].id);
    } else if (availableClients.length > 0) {
      setTargetType('client');
      setSelectedClientId(availableClients[0].id);
    }
    setValidUntil(format(addDays(new Date(), 15), 'yyyy-MM-dd'));
    setItems(
      catalog[0]
        ? [
            {
              id: generateId('qi'),
              name: catalog[0].name,
              unit: catalog[0].unit,
              qty: 1,
              unit_price: catalog[0].unit_price,
              vat_rate: catalog[0].vat_rate,
            },
          ]
        : [
            {
              id: generateId('qi'),
              name: 'Serviço Técnico',
              unit: 'FIXED',
              qty: 1,
              unit_price: 75,
              vat_rate: 23,
            },
          ]
    );
    setError('');
  }, [availableClients, availableLeads, catalog, initialLeadId, open]);

  const totals = useMemo(() => calculateQuoteTotals(items), [items]);

  const handleAddFromCatalog = (catalogId: string) => {
    const svc = catalog.find((c) => c.id === catalogId);
    if (!svc) return;
    setItems((prev) => [
      ...prev,
      {
        id: generateId('qi'),
        name: svc.name,
        unit: svc.unit,
        qty: 1,
        unit_price: svc.unit_price,
        vat_rate: svc.vat_rate,
      },
    ]);
  };

  const handleAddCustom = () => {
    setItems((prev) => [
      ...prev,
      {
        id: generateId('qi'),
        name: '',
        unit: 'FIXED',
        qty: 1,
        unit_price: 0,
        vat_rate: 23,
      },
    ]);
  };

  const updateItem = (id: string, patch: Partial<Omit<QuoteItem, 'total'>>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleSave = (status: 'DRAFT' | 'SENT') => {
    if (items.length === 0 || items.some((it) => !it.name.trim() || it.qty <= 0)) {
      setError('Adicione pelo menos um serviço com descrição e quantidade válida.');
      return;
    }
    onSave({
      lead_id: targetType === 'lead' ? selectedLeadId || null : null,
      client_id: targetType === 'client' ? selectedClientId || null : null,
      items,
      valid_until: validUntil || null,
      status,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Criar Orçamento"
      subtitle="Cálculo automático de Subtotal, IVA (23%, 13%, 6%, 0%) e Total"
      size="lg"
    >
      <div className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-[#FEE2E2] text-[#B91C1C] text-[14px] font-medium">
            {error}
          </div>
        )}

        {/* Destinatário */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
              Destinatário
            </label>
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 border border-[#CBD5E1]">
              <button
                type="button"
                onClick={() => setTargetType('lead')}
                className={`min-h-[40px] rounded-lg text-[14px] font-semibold cursor-pointer ${
                  targetType === 'lead' ? 'bg-white text-[#0F172A] shadow-xs' : 'text-[#475569]'
                }`}
              >
                Lead
              </button>
              <button
                type="button"
                onClick={() => setTargetType('client')}
                className={`min-h-[40px] rounded-lg text-[14px] font-semibold cursor-pointer ${
                  targetType === 'client' ? 'bg-white text-[#0F172A] shadow-xs' : 'text-[#475569]'
                }`}
              >
                Cliente
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
              {targetType === 'lead' ? 'Selecionar Lead' : 'Selecionar Cliente'}
            </label>
            {targetType === 'lead' ? (
              <select
                value={selectedLeadId}
                onChange={(e) => setSelectedLeadId(e.target.value)}
                className="w-full min-h-12 px-3 rounded-[10px] border border-[#CBD5E1] bg-white text-[15px]"
              >
                {availableLeads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.phone})
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full min-h-12 px-3 rounded-[10px] border border-[#CBD5E1] bg-white text-[15px]"
              >
                {availableClients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Validade & Quick Add from Catalog */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
              Válido até
            </label>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="w-full min-h-12 px-3 rounded-[10px] border border-[#CBD5E1] text-[15px] tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
              Adicionar do Catálogo
            </label>
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  handleAddFromCatalog(e.target.value);
                  e.target.value = '';
                }
              }}
              className="w-full min-h-12 px-3 rounded-[10px] border border-[#CBD5E1] bg-white text-[15px]"
            >
              <option value="">+ Escolher serviço padrão…</option>
              {catalog.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({formatEUR(c.unit_price)} · IVA {c.vat_rate}%)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Line items */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-[15px] font-bold text-[#0F172A]">Linhas do Orçamento</h4>
            <button
              type="button"
              onClick={handleAddCustom}
              className="text-[14px] font-semibold text-[#059669] hover:underline cursor-pointer"
            >
              + Adicionar linha avulsa
            </button>
          </div>

          {items.map((item, idx) => (
            <div
              key={item.id}
              className="p-3 rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] space-y-2.5"
            >
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={item.name}
                  onChange={(e) => updateItem(item.id, { name: e.target.value })}
                  placeholder={`Serviço #${idx + 1}`}
                  className="flex-1 min-h-[44px] px-3 rounded-lg border border-[#CBD5E1] bg-white text-[15px]"
                />
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  aria-label="Remover linha"
                  className="min-h-[44px] min-w-[44px] rounded-lg border border-[#FECACA] bg-white text-[#B91C1C] flex items-center justify-center cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[12px] font-medium text-[#475569] mb-0.5">
                    Qtd.
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.1"
                    value={item.qty}
                    onChange={(e) =>
                      updateItem(item.id, { qty: Math.max(0, Number(e.target.value)) })
                    }
                    className="w-full min-h-[44px] px-2.5 rounded-lg border border-[#CBD5E1] bg-white text-[15px] tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[#475569] mb-0.5">
                    Preço Unit. (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={item.unit_price}
                    onChange={(e) =>
                      updateItem(item.id, {
                        unit_price: Math.max(0, Number(e.target.value)),
                      })
                    }
                    className="w-full min-h-[44px] px-2.5 rounded-lg border border-[#CBD5E1] bg-white text-[15px] tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[#475569] mb-0.5">
                    IVA (%)
                  </label>
                  <select
                    value={item.vat_rate}
                    onChange={(e) =>
                      updateItem(item.id, { vat_rate: Number(e.target.value) })
                    }
                    className="w-full min-h-[44px] px-2 rounded-lg border border-[#CBD5E1] bg-white text-[15px] tabular-nums"
                  >
                    <option value={23}>23%</option>
                    <option value={13}>13%</option>
                    <option value={6}>6%</option>
                    <option value={0}>0% (Isento)</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Live Totals Box */}
        <div className="bg-[#1E293B] text-white rounded-xl p-4 space-y-1.5 tabular-nums">
          <div className="flex justify-between text-[14px] text-slate-300">
            <span>Subtotal (s/ IVA)</span>
            <span>{formatEUR(totals.subtotal)}</span>
          </div>
          {totals.vatBreakdown.map((v) => (
            <div key={v.rate} className="flex justify-between text-[14px] text-slate-300">
              <span>IVA ({v.rate}%)</span>
              <span>{formatEUR(v.tax)}</span>
            </div>
          ))}
          <div className="flex justify-between text-[20px] font-bold pt-2 border-t border-slate-700 text-[#10B981]">
            <span>TOTAL</span>
            <span>{formatEUR(totals.total)}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          <PrimaryButton
            variant="secondary"
            fullWidth
            onClick={() => handleSave('DRAFT')}
          >
            Guardar Rascunho
          </PrimaryButton>
          <PrimaryButton fullWidth onClick={() => handleSave('SENT')}>
            Guardar e Marcar Enviado
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
};
