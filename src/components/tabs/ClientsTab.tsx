import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  ChevronRight,
  Copy,
  Edit3,
  Euro,
  FileText,
  Gift,
  History,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  Repeat,
  Search,
  ShieldAlert,
  Trees,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  formatDatePT,
  formatEUR,
  JOB_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  QUOTE_STATUS_LABELS,
} from '../../i18n/pt-PT';
import { useZelvo } from '../../store/ZelvoContext';
import { buildWhatsAppUrl } from '../../utils/calculations';
import { calculateClientProfitability } from '../../utils/profitability';
import type {
  Client,
  CustomAttributeValue,
  ServiceAsset,
} from '../../types/database';
import {
  DynamicAttributeField,
  formatDynamicAttributeSummary,
} from '../common/DynamicAttributeField';
import {
  EmptyState,
  Modal,
  PrimaryButton,
  StatusBadge,
} from '../common/UIPrimitives';

interface ClientsTabProps {
  onScheduleVisit: (clientId: string, assetId: string) => void;
}

export const ClientsTab: React.FC<ClientsTabProps> = ({ onScheduleVisit }) => {
  const {
    db,
    organization,
    activeVertical,
    isTechnicianMode,
    createClient,
    anonymizeClient,
    upsertServiceAsset,
    updateClientRetainer,
    registerClientReferral,
    showToast,
  } = useZelvo();

  const [query, setQuery] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'assets' | 'history'>('assets');
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<ServiceAsset | null>(null);
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [gdprModalOpen, setGdprModalOpen] = useState(false);

  // Retainer & Referral inline states
  const [retainerAmount, setRetainerAmount] = useState('120');
  const [retainerDay, setRetainerDay] = useState('5');
  const [refNeighborName, setRefNeighborName] = useState('');
  const [refNeighborPhone, setRefNeighborPhone] = useState('');

  const activeClients = useMemo(
    () =>
      db.clients
        .filter((c) => !c.deleted_at)
        .sort((a, b) => a.name.localeCompare(b.name, 'pt')),
    [db.clients]
  );

  const pendingByClient = useMemo(() => {
    const map = new Map<string, number>();
    for (const j of db.jobs) {
      if (j.deleted_at || j.status === 'CANCELLED' || j.payment_status === 'PAID') continue;
      if (j.status === 'COMPLETED') {
        map.set(j.client_id, (map.get(j.client_id) ?? 0) + j.price);
      }
    }
    return map;
  }, [db.jobs]);

  const assetsCountByClient = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of db.service_assets) {
      if (a.deleted_at) continue;
      map.set(a.client_id, (map.get(a.client_id) ?? 0) + 1);
    }
    return map;
  }, [db.service_assets]);

  const filteredClients = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return activeClients;
    return activeClients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        (c.billing_address ?? '').toLowerCase().includes(q) ||
        (c.nif ?? '').includes(q)
    );
  }, [activeClients, query]);

  const selectedClient = useMemo(
    () => activeClients.find((c) => c.id === selectedClientId) ?? null,
    [activeClients, selectedClientId]
  );

  React.useEffect(() => {
    if (!selectedClient) return;
    setRetainerAmount(
      selectedClient.retainer_amount ? String(selectedClient.retainer_amount) : '120'
    );
    setRetainerDay(
      selectedClient.retainer_billing_day ? String(selectedClient.retainer_billing_day) : '5'
    );
    setRefNeighborName('');
    setRefNeighborPhone('');
  }, [selectedClient?.id]);

  if (selectedClient) {
    const clientAssets = db.service_assets.filter(
      (a) => a.client_id === selectedClient.id && !a.deleted_at
    );
    const clientJobs = db.jobs.filter(
      (j) => j.client_id === selectedClient.id && !j.deleted_at
    );
    const clientQuotes = db.quotes.filter(
      (q) => q.client_id === selectedClient.id && !q.deleted_at
    );
    const clientTransactions = db.transactions.filter(
      (t) => t.client_id === selectedClient.id && !t.deleted_at
    );

    const timeline = [
      ...clientJobs.map((j) => ({
        id: `job-${j.id}`,
        date: j.scheduled_start,
        kind: 'Visita' as const,
        title: j.title,
        subtitle: isTechnicianMode
          ? JOB_STATUS_LABELS[j.status]
          : `${JOB_STATUS_LABELS[j.status]} · ${formatEUR(j.price)}`,
      })),
      ...(isTechnicianMode
        ? []
        : [
            ...clientQuotes.map((q) => ({
              id: `quote-${q.id}`,
              date: q.created_at,
              kind: 'Orçamento' as const,
              title: `${q.quote_number} (${QUOTE_STATUS_LABELS[q.status]})`,
              subtitle: `Total c/ IVA: ${formatEUR(q.total)}`,
            })),
            ...clientTransactions.map((t) => ({
              id: `tx-${t.id}`,
              date: `${t.transaction_date}T12:00:00.000Z`,
              kind: 'Pagamento' as const,
              title: t.description || 'Pagamento de Serviço',
              subtitle: `+${formatEUR(t.amount)} · ${PAYMENT_METHOD_LABELS[t.payment_method]}`,
            })),
          ]),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return (
      <div className="space-y-4">
        {/* Client Detail Header */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => {
                  setSelectedClientId(null);
                  setDetailTab('assets');
                }}
                aria-label="Voltar à lista de clientes"
                className="min-h-12 min-w-12 rounded-xl border border-[#CBD5E1] flex items-center justify-center text-[#0F172A] hover:bg-slate-50 cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[20px] font-bold text-[#0F172A] truncate">
                    {selectedClient.name}
                  </h2>
                  {selectedClient.is_anonymized && (
                    <StatusBadge tone="danger" label="Anonimizado RGPD" />
                  )}
                </div>
                <p className="text-[14px] text-[#475569] tabular-nums">
                  {selectedClient.phone}
                  {selectedClient.nif ? ` · NIF ${selectedClient.nif}` : ''}
                </p>
              </div>
            </div>
          </div>

          {!selectedClient.is_anonymized && (
            <div className="text-[14px] text-[#475569] space-y-1 pt-1 border-t border-[#E2E8F0]">
              {selectedClient.email && <p>Email: {selectedClient.email}</p>}
              {selectedClient.billing_address && (
                <p>Morada: {selectedClient.billing_address}</p>
              )}
              {selectedClient.notes && (
                <p className="text-[#0F172A] pt-1">Notas: {selectedClient.notes}</p>
              )}
            </div>
          )}

          {/* Real Net Profit Breakdown (Admin only) */}
          {!isTechnicianMode && (() => {
            const usersById = new Map(db.users.map((u) => [u.id, u]));
            const inventoryById = new Map(db.inventory_items.map((i) => [i.id, i]));
            const prof = calculateClientProfitability({
              client: selectedClient,
              jobs: db.jobs,
              transactions: db.transactions,
              usersById,
              inventoryById,
            });
            return (
              <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[12px] font-semibold text-[#475569]">
                      Lucro Líquido Real do Cliente
                    </p>
                    <p
                      className={`font-display text-[22px] font-bold tabular-nums leading-tight ${
                        prof.netProfit >= 0 ? 'text-[#15803D]' : 'text-[#B91C1C]'
                      }`}
                    >
                      {prof.netProfit >= 0 ? '+' : ''}
                      {formatEUR(prof.netProfit)}
                    </p>
                  </div>
                  <StatusBadge
                    tone={prof.marginPct >= 30 ? 'success' : prof.marginPct >= 0 ? 'info' : 'danger'}
                    label={`Margem ${prof.marginPct.toFixed(1).replace('.', ',')}%`}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#E2E8F0] text-[12px] tabular-nums">
                  <div>
                    <p className="text-[#64748B]">Receita Recebida</p>
                    <p className="font-bold text-[#15803D]">{formatEUR(prof.revenue)}</p>
                  </div>
                  <div>
                    <p className="text-[#64748B]">Insumos / Mat.</p>
                    <p className="font-bold text-[#B91C1C]">-{formatEUR(prof.materialsCost)}</p>
                  </div>
                  <div>
                    <p className="text-[#64748B]">
                      Mão-de-Obra{prof.trackedMinutes > 0 ? ` (${prof.trackedMinutes}m)` : ''}
                    </p>
                    <p className="font-bold text-[#B91C1C]">-{formatEUR(prof.laborCost)}</p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Segmented Detail Tabs */}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 border border-[#E2E8F0]">
            <button
              type="button"
              onClick={() => setDetailTab('assets')}
              className={`min-h-[44px] rounded-lg text-[15px] font-semibold transition-colors cursor-pointer flex items-center justify-center gap-2 ${
                detailTab === 'assets'
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              <Trees className="w-4 h-4" />
              <span>Locais / Ativos ({clientAssets.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setDetailTab('history')}
              className={`min-h-[44px] rounded-lg text-[15px] font-semibold transition-colors cursor-pointer flex items-center justify-center gap-2 ${
                detailTab === 'history'
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              <History className="w-4 h-4" />
              <span>Histórico ({timeline.length})</span>
            </button>
          </div>
        </div>

        {/* Assets Tab */}
        {detailTab === 'assets' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[14px] font-semibold text-[#475569]">
                Campos dinâmicos da vertical: <strong className="text-[#0F172A]">{activeVertical.name}</strong>
              </p>
              {!selectedClient.is_anonymized && (
                <PrimaryButton
                  onClick={() => {
                    setEditingAsset(null);
                    setAssetModalOpen(true);
                  }}
                  icon={<Plus className="w-4 h-4" />}
                >
                  Novo Ativo
                </PrimaryButton>
              )}
            </div>

            {clientAssets.length === 0 ? (
              <EmptyState
                icon={<Trees className="w-6 h-6" />}
                title="Sem locais/ativos registados"
                description="Adicione o jardim, piscina ou local de serviço deste cliente para guardar detalhes técnicos."
                actionLabel="+ Adicionar Ativo"
                onAction={() => {
                  setEditingAsset(null);
                  setAssetModalOpen(true);
                }}
              />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {clientAssets.map((asset) => {
                  const dynamicSummary = formatDynamicAttributeSummary(
                    activeVertical.asset_schema,
                    asset.custom_attributes
                  );
                  return (
                    <div
                      key={asset.id}
                      className="bg-white border border-[#E2E8F0] rounded-xl p-4 flex flex-col justify-between gap-3"
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="text-[17px] font-bold text-[#0F172A]">
                              {asset.name}
                            </h3>
                            <p className="text-[14px] text-[#475569] flex items-start gap-1.5 mt-0.5">
                              <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
                              <span>{asset.address}</span>
                            </p>
                          </div>
                          {!selectedClient.is_anonymized && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingAsset(asset);
                                setAssetModalOpen(true);
                              }}
                              aria-label={`Editar ${asset.name}`}
                              className="min-h-[44px] min-w-[44px] rounded-lg border border-[#CBD5E1] flex items-center justify-center text-[#0F172A] hover:bg-slate-50 cursor-pointer shrink-0"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        {asset.access_notes && (
                          <div className="rounded-lg bg-[#FEF3C7] border border-[#FDE68A] px-3 py-2 text-[14px] text-[#92400E]">
                            <strong>Notas de acesso:</strong> {asset.access_notes}
                          </div>
                        )}

                        {dynamicSummary.length > 0 ? (
                          <dl className="grid grid-cols-2 gap-2 pt-1">
                            {dynamicSummary.map((attr) => (
                              <div
                                key={attr.label}
                                className="rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-2"
                              >
                                <dt className="text-[12px] text-[#475569]">{attr.label}</dt>
                                <dd className="text-[14px] font-semibold text-[#0F172A] tabular-nums">
                                  {attr.display}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        ) : (
                          <p className="text-[13px] text-[#475569] italic">
                            Sem atributos de “{activeVertical.name}” preenchidos — toque em editar para preencher.
                          </p>
                        )}
                      </div>

                      {!selectedClient.is_anonymized && (
                        <PrimaryButton
                          variant="secondary"
                          fullWidth
                          icon={<Calendar className="w-4 h-4 text-[#10B981]" />}
                          onClick={() => onScheduleVisit(selectedClient.id, asset.id)}
                        >
                          Agendar Visita neste Local
                        </PrimaryButton>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Phase 2: Monthly Retainer (Avença Mensal) Card */}
            {!selectedClient.is_anonymized && !isTechnicianMode && (
              <div className="bg-white border border-[#99F6E4] rounded-xl p-4 space-y-3 mt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Repeat className="w-5 h-5 text-[#0F766E]" />
                    <div>
                      <h4 className="text-[15px] font-bold text-[#0F172A]">
                        Avença Mensal (Assinatura Recorrente)
                      </h4>
                      <p className="text-[13px] text-[#475569]">
                        Soma automaticamente ao MRR no painel financeiro.
                      </p>
                    </div>
                  </div>
                  <StatusBadge
                    tone={selectedClient.is_retainer ? 'success' : 'neutral'}
                    label={
                      selectedClient.is_retainer
                        ? `Ativa · ${formatEUR(selectedClient.retainer_amount ?? 0)}/mês`
                        : 'Inativa'
                    }
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                  <div>
                    <label className="block text-[12px] font-semibold text-[#475569] mb-1">
                      Valor Fixo Mensal (€)
                    </label>
                    <input
                      type="number"
                      min={1}
                      step="0.01"
                      value={retainerAmount}
                      onChange={(e) => setRetainerAmount(e.target.value)}
                      className="w-full min-h-11 px-3 rounded-lg border border-[#CBD5E1] text-[15px] font-bold tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold text-[#475569] mb-1">
                      Dia de Cobrança (1–28)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={28}
                      value={retainerDay}
                      onChange={(e) => setRetainerDay(e.target.value)}
                      className="w-full min-h-11 px-3 rounded-lg border border-[#CBD5E1] text-[15px] font-bold tabular-nums"
                    />
                  </div>
                  <div className="flex gap-2">
                    <PrimaryButton
                      type="button"
                      fullWidth
                      onClick={() =>
                        updateClientRetainer(
                          selectedClient.id,
                          true,
                          Math.max(1, Number(retainerAmount) || 0),
                          Math.min(28, Math.max(1, Number(retainerDay) || 5))
                        )
                      }
                      className="!min-h-11 !text-[14px]"
                    >
                      {selectedClient.is_retainer ? 'Atualizar Avença' : 'Ativar Avença'}
                    </PrimaryButton>
                    {selectedClient.is_retainer && (
                      <button
                        type="button"
                        onClick={() => updateClientRetainer(selectedClient.id, false, null, null)}
                        className="min-h-11 px-3 rounded-lg border border-[#CBD5E1] text-[13px] font-semibold text-[#B91C1C] hover:bg-red-50 cursor-pointer"
                      >
                        Desativar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Phase 3: "Traga um Vizinho" Referral Program Card */}
            {!selectedClient.is_anonymized && !isTechnicianMode && (
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Gift className="w-5 h-5 text-[#10B981]" />
                    <div>
                      <h4 className="text-[15px] font-bold text-[#0F172A]">
                        Programa &ldquo;Traga um Vizinho&rdquo;
                      </h4>
                      <p className="text-[13px] text-[#475569]">
                        Código único:{' '}
                        <strong className="font-mono text-[#0F172A]">
                          {selectedClient.referral_code ?? 'ZELVO15'}
                        </strong>{' '}
                        · Indicações: <strong>{selectedClient.referrals_count ?? 0}</strong>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {(selectedClient.referral_discount_pct ?? 0) > 0 && (
                      <StatusBadge
                        tone="success"
                        label={`-${selectedClient.referral_discount_pct}% próx. visita`}
                      />
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        const code = selectedClient.referral_code ?? 'ZELVO15';
                        try {
                          await navigator.clipboard.writeText(code);
                          showToast(`Código ${code} copiado.`, 'success');
                        } catch {
                          showToast(`Código: ${code}`, 'info');
                        }
                      }}
                      className="min-h-10 px-2.5 rounded-lg border border-[#CBD5E1] text-[13px] font-semibold text-[#0F172A] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar</span>
                    </button>
                    <a
                      href={buildWhatsAppUrl(
                        selectedClient.phone,
                        `Olá ${selectedClient.name}! Partilhe o código ${selectedClient.referral_code ?? 'ZELVO15'} com um vizinho. Quando ele marcar com a ${organization.name}, ambos recebem 15% de desconto na próxima visita!`
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-10 px-3 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-[13px] font-semibold inline-flex items-center gap-1"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>Partilhar</span>
                    </a>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-[#E2E8F0]">
                  <input
                    type="text"
                    value={refNeighborName}
                    onChange={(e) => setRefNeighborName(e.target.value)}
                    placeholder="Nome do vizinho indicado"
                    className="min-h-11 px-3 rounded-lg border border-[#CBD5E1] text-[14px]"
                  />
                  <input
                    type="tel"
                    value={refNeighborPhone}
                    onChange={(e) => setRefNeighborPhone(e.target.value)}
                    placeholder="Telemóvel do vizinho"
                    className="min-h-11 px-3 rounded-lg border border-[#CBD5E1] text-[14px] tabular-nums"
                  />
                  <PrimaryButton
                    type="button"
                    variant="secondary"
                    icon={<UserPlus className="w-4 h-4 text-[#10B981]" />}
                    onClick={() => {
                      if (!refNeighborName.trim() || !refNeighborPhone.trim()) return;
                      registerClientReferral(
                        selectedClient.id,
                        refNeighborName.trim(),
                        refNeighborPhone.trim()
                      );
                      setRefNeighborName('');
                      setRefNeighborPhone('');
                    }}
                    className="!min-h-11 !text-[13px]"
                  >
                    Registar (-15%)
                  </PrimaryButton>
                </div>
              </div>
            )}

            {/* GDPR Anonymization Zone */}
            {!selectedClient.is_anonymized && !isTechnicianMode && (
              <div className="bg-white border border-[#FECACA] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-[#DC2626] shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-[15px] font-bold text-[#0F172A]">
                      Privacidade e Direito ao Esquecimento (RGPD)
                    </h4>
                    <p className="text-[14px] text-[#475569]">
                      Apaga nome, telefone, email, NIF e moradas mantendo intactas as transações contabilísticas.
                    </p>
                  </div>
                </div>
                <PrimaryButton
                  variant="danger"
                  onClick={() => setGdprModalOpen(true)}
                >
                  Anonimizar RGPD
                </PrimaryButton>
              </div>
            )}
          </div>
        )}

        {/* Chronological History Tab */}
        {detailTab === 'history' && (
          <div className="bg-white border border-[#E2E8F0] rounded-xl divide-y divide-[#E2E8F0]">
            {timeline.length === 0 ? (
              <div className="p-8 text-center text-[#475569]">
                Ainda não existem visitas, orçamentos ou pagamentos registados para este cliente.
              </div>
            ) : (
              timeline.map((entry) => (
                <div
                  key={entry.id}
                  className="p-4 flex items-start justify-between gap-3"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        entry.kind === 'Pagamento'
                          ? 'bg-[#DCFCE7] text-[#15803D]'
                          : entry.kind === 'Orçamento'
                            ? 'bg-[#FEF3C7] text-[#B45309]'
                            : 'bg-[#E0F2FE] text-[#0369A1]'
                      }`}
                    >
                      {entry.kind === 'Pagamento' ? (
                        <Euro className="w-5 h-5" />
                      ) : entry.kind === 'Orçamento' ? (
                        <FileText className="w-5 h-5" />
                      ) : (
                        <Calendar className="w-5 h-5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-[#0F172A]">
                        {entry.title}
                      </p>
                      <p className="text-[14px] text-[#475569] tabular-nums">
                        {entry.kind} · {entry.subtitle}
                      </p>
                    </div>
                  </div>
                  <span className="text-[13px] text-[#475569] tabular-nums shrink-0">
                    {formatDatePT(entry.date, 'dd/MM/yyyy')}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {/* Asset Upsert Modal with DynamicAttributeField */}
        <AssetUpsertModal
          open={assetModalOpen}
          onClose={() => setAssetModalOpen(false)}
          clientId={selectedClient.id}
          initialAsset={editingAsset}
          onSave={(payload) => {
            upsertServiceAsset(payload);
            setAssetModalOpen(false);
          }}
        />

        {/* GDPR Confirmation Modal (#DC2626) (TC-14) */}
        <Modal
          open={gdprModalOpen}
          onClose={() => setGdprModalOpen(false)}
          title="Confirmar Anonimização RGPD"
          subtitle="Esta ação é irreversível"
        >
          <div className="p-4 rounded-xl bg-[#FEE2E2] border border-[#FECACA] text-[#B91C1C] flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-[15px] space-y-1">
              <p className="font-bold">
                Vai anonimizar os dados pessoais de “{selectedClient.name}”.
              </p>
              <p>
                Nome, telefone, email, NIF e moradas serão permanentemente removidos.
                As <strong>{clientTransactions.length} transação(ões) financeiras</strong>{' '}
                associadas permanecerão intactas para integridade contabilística.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <PrimaryButton
              variant="secondary"
              fullWidth
              onClick={() => setGdprModalOpen(false)}
            >
              Cancelar
            </PrimaryButton>
            <PrimaryButton
              variant="danger"
              fullWidth
              onClick={() => {
                anonymizeClient(selectedClient.id);
                setGdprModalOpen(false);
              }}
            >
              Sim, Anonimizar
            </PrimaryButton>
          </div>
        </Modal>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-bold text-[#0F172A]">Clientes & Ativos</h2>
          <p className="text-[14px] text-[#475569] tabular-nums">
            {activeClients.length} clientes · {db.service_assets.filter((a) => !a.deleted_at).length}{' '}
            locais registados
          </p>
        </div>
        <PrimaryButton
          onClick={() => setNewClientOpen(true)}
          icon={<Plus className="w-5 h-5" />}
        >
          Novo Cliente
        </PrimaryButton>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="w-5 h-5 text-[#475569] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pesquisar por nome, telefone, morada ou NIF…"
          className="w-full min-h-12 pl-11 pr-4 rounded-xl border border-[#CBD5E1] bg-white text-[16px] text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#10B981]"
        />
      </div>

      {filteredClients.length === 0 ? (
        <EmptyState
          icon={<Users className="w-6 h-6" />}
          title="Nenhum cliente encontrado"
          description="Ajuste a pesquisa ou registe um novo cliente na carteira."
          actionLabel="+ Novo Cliente"
          onAction={() => setNewClientOpen(true)}
        />
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-xl divide-y divide-[#E2E8F0] overflow-hidden">
          {filteredClients.map((client) => {
            const pending = pendingByClient.get(client.id) ?? 0;
            const assetCount = assetsCountByClient.get(client.id) ?? 0;
            return (
              <button
                key={client.id}
                type="button"
                onClick={() => setSelectedClientId(client.id)}
                className="w-full p-4 flex items-center justify-between gap-3 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[17px] font-bold text-[#0F172A]">
                      {client.name}
                    </span>
                    {client.is_anonymized && (
                      <StatusBadge tone="danger" label="RGPD" />
                    )}
                    {client.is_retainer && !isTechnicianMode && (
                      <StatusBadge
                        tone="teal"
                        label={`Avença ${formatEUR(client.retainer_amount ?? 0)}`}
                      />
                    )}
                    {pending > 0 && !isTechnicianMode && (
                      <StatusBadge
                        tone="warning"
                        label={`Pendente ${formatEUR(pending)}`}
                      />
                    )}
                  </div>
                  <p className="text-[14px] text-[#475569] flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5" />
                      {client.phone}
                    </span>
                    <span>·</span>
                    <span>
                      {assetCount} {assetCount === 1 ? 'local/ativo' : 'locais/ativos'}
                    </span>
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-[#475569] shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      {/* New Client Modal */}
      <NewClientModal
        open={newClientOpen}
        onClose={() => setNewClientOpen(false)}
        onSave={(input) => {
          const created = createClient(input);
          setNewClientOpen(false);
          setSelectedClientId(created.id);
        }}
      />
    </div>
  );
};

interface NewClientModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (input: {
    name: string;
    phone: string;
    email?: string | null;
    nif?: string | null;
    billing_address?: string | null;
    notes?: string | null;
  }) => void;
}

const NewClientModal: React.FC<NewClientModalProps> = ({ open, onClose, onSave }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [nif, setNif] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      setError('Nome e telefone são obrigatórios.');
      return;
    }
    onSave({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || null,
      nif: nif.trim() || null,
      billing_address: address.trim() || null,
      notes: notes.trim() || null,
    });
    setName('');
    setPhone('');
    setEmail('');
    setNif('');
    setAddress('');
    setNotes('');
    setError('');
  };

  return (
    <Modal open={open} onClose={onClose} title="Novo Cliente">
      <form onSubmit={handleSubmit} className="space-y-3.5">
        {error && (
          <div className="p-3 rounded-lg bg-[#FEE2E2] text-[#B91C1C] text-[14px] font-medium">
            {error}
          </div>
        )}
        <div>
          <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
            Nome Completo / Empresa *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px]"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
              Telefone *
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px] tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
              NIF
            </label>
            <input
              type="text"
              value={nif}
              onChange={(e) => setNif(e.target.value)}
              placeholder="9 dígitos"
              className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px] tabular-nums"
            />
          </div>
        </div>
        <div>
          <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px]"
          />
        </div>
        <div>
          <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
            Morada de Faturação
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px]"
          />
        </div>
        <div>
          <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
            Notas
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full p-3 rounded-[10px] border border-[#CBD5E1] text-[16px]"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <PrimaryButton type="button" variant="secondary" fullWidth onClick={onClose}>
            Cancelar
          </PrimaryButton>
          <PrimaryButton type="submit" fullWidth>
            Guardar Cliente
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
};

interface AssetUpsertModalProps {
  open: boolean;
  onClose: () => void;
  clientId: string;
  initialAsset: ServiceAsset | null;
  onSave: (payload: {
    id?: string;
    client_id: string;
    name: string;
    address: string;
    access_notes?: string | null;
    custom_attributes: Record<string, CustomAttributeValue>;
  }) => void;
}

const AssetUpsertModal: React.FC<AssetUpsertModalProps> = ({
  open,
  onClose,
  clientId,
  initialAsset,
  onSave,
}) => {
  const { activeVertical } = useZelvo();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [accessNotes, setAccessNotes] = useState('');
  const [attrs, setAttrs] = useState<Record<string, CustomAttributeValue>>({});
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (!open) return;
    setName(initialAsset?.name ?? '');
    setAddress(initialAsset?.address ?? '');
    setAccessNotes(initialAsset?.access_notes ?? '');
    setAttrs(initialAsset?.custom_attributes ?? {});
    setError('');
  }, [initialAsset, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !address.trim()) {
      setError('Nome do ativo e morada são obrigatórios.');
      return;
    }
    onSave({
      id: initialAsset?.id,
      client_id: clientId,
      name: name.trim(),
      address: address.trim(),
      access_notes: accessNotes.trim() || null,
      custom_attributes: attrs,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initialAsset ? 'Editar Local / Ativo' : 'Novo Local / Ativo'}
      subtitle={`Atributos dinâmicos: ${activeVertical.name}`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-[#FEE2E2] text-[#B91C1C] text-[14px] font-medium">
            {error}
          </div>
        )}
        <div>
          <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
            Nome do Local / Ativo *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              activeVertical.slug === 'piscinas'
                ? 'Ex.: Piscina Exterior'
                : 'Ex.: Jardim Principal'
            }
            className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px]"
          />
        </div>
        <div>
          <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
            Morada *
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Rua, número, freguesia, Braga"
            className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px]"
          />
        </div>
        <div>
          <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
            Notas de Acesso (portão, cães, torneira)
          </label>
          <input
            type="text"
            value={accessNotes}
            onChange={(e) => setAccessNotes(e.target.value)}
            placeholder="Ex.: Código portão 4321# • Torneira no anexo"
            className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px]"
          />
        </div>

        {/* Dynamic JSONB fields from active VerticalTemplate */}
        <div className="pt-2 border-t border-[#E2E8F0] space-y-3">
          <p className="text-[13px] font-bold uppercase tracking-wide text-[#0F766E]">
            Especificações — {activeVertical.name}
          </p>
          {activeVertical.asset_schema.map((field) => (
            <DynamicAttributeField
              key={field.key}
              field={field}
              value={attrs[field.key]}
              onChange={(val) =>
                setAttrs((prev) => ({
                  ...prev,
                  [field.key]: val,
                }))
              }
            />
          ))}
        </div>

        <div className="flex gap-3 pt-2">
          <PrimaryButton type="button" variant="secondary" fullWidth onClick={onClose}>
            Cancelar
          </PrimaryButton>
          <PrimaryButton type="submit" fullWidth>
            Guardar Ativo
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
};
