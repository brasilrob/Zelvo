import React, { useMemo, useState } from 'react';
import {
  CalendarPlus,
  CheckCircle2,
  FileText,
  MapPin,
  Phone,
  Plus,
  UserPlus,
  XCircle,
} from 'lucide-react';
import {
  formatDatePT,
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
  LOST_REASONS,
} from '../../i18n/pt-PT';
import { useZelvo } from '../../store/ZelvoContext';
import type { Lead, LeadStatus } from '../../types/database';
import {
  BottomSheet,
  EmptyState,
  Modal,
  PhotoLightbox,
  PrimaryButton,
  StatusBadge,
  type SemanticTone,
} from '../common/UIPrimitives';

interface LeadsTabProps {
  onCreateQuoteForLead: (leadId: string) => void;
  onScheduleFirstVisit: (clientId: string, assetId: string) => void;
}

const LEAD_STATUS_ORDER: LeadStatus[] = [
  'NEW',
  'VISIT_SCHEDULED',
  'QUOTE_SENT',
  'WON',
  'LOST',
];

const LEAD_STATUS_TONE: Record<LeadStatus, SemanticTone> = {
  NEW: 'info',
  VISIT_SCHEDULED: 'teal',
  QUOTE_SENT: 'warning',
  WON: 'success',
  LOST: 'danger',
};

export const LeadsTab: React.FC<LeadsTabProps> = ({
  onCreateQuoteForLead,
  onScheduleFirstVisit,
}) => {
  const { db, createLead, updateLeadStatus, convertLeadToClient, showToast } = useZelvo();

  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'ALL'>('NEW');
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [lostLeadTarget, setLostLeadTarget] = useState<Lead | null>(null);
  const [selectedLostReason, setSelectedLostReason] = useState<string>('');
  const [lostError, setLostError] = useState<string>('');
  const [convertedModal, setConvertedModal] = useState<{
    clientId: string;
    assetId: string;
    clientName: string;
  } | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<{ src: string; caption: string } | null>(
    null
  );

  const activeLeads = useMemo(
    () =>
      db.leads
        .filter((l) => !l.deleted_at)
        .sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ),
    [db.leads]
  );

  const countsByStatus = useMemo(() => {
    const map: Record<LeadStatus, number> = {
      NEW: 0,
      VISIT_SCHEDULED: 0,
      QUOTE_SENT: 0,
      WON: 0,
      LOST: 0,
    };
    for (const l of activeLeads) {
      map[l.status] += 1;
    }
    return map;
  }, [activeLeads]);

  const filteredLeads = useMemo(
    () =>
      statusFilter === 'ALL'
        ? activeLeads
        : activeLeads.filter((l) => l.status === statusFilter),
    [activeLeads, statusFilter]
  );

  const handleStatusChange = (lead: Lead, nextStatus: LeadStatus) => {
    if (nextStatus === 'LOST') {
      setLostLeadTarget(lead);
      setSelectedLostReason('');
      setLostError('');
      return;
    }

    if (nextStatus === 'WON') {
      const converted = convertLeadToClient(lead.id);
      if (converted) {
        setConvertedModal({
          clientId: converted.client.id,
          assetId: converted.asset.id,
          clientName: converted.client.name,
        });
      }
      return;
    }

    const res = updateLeadStatus(lead.id, nextStatus);
    if (res.ok) {
      showToast(`Estado alterado para "${LEAD_STATUS_LABELS[nextStatus]}".`, 'success');
    }
  };

  const handleConfirmLost = () => {
    if (!lostLeadTarget) return;
    const res = updateLeadStatus(lostLeadTarget.id, 'LOST', selectedLostReason);
    if (!res.ok) {
      setLostError(res.error ?? 'Selecione um motivo de perda.');
      return;
    }
    showToast(`Lead marcado como perdido (${selectedLostReason}).`, 'info');
    setLostLeadTarget(null);
    setSelectedLostReason('');
    setLostError('');
  };

  return (
    <div className="space-y-4">
      {/* Top Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-bold text-[#0F172A]">Funil Comercial</h2>
          <p className="text-[14px] text-[#475569] tabular-nums">
            {activeLeads.length} pedidos registados · {countsByStatus.NEW} por triar
          </p>
        </div>
        <PrimaryButton
          onClick={() => setNewLeadOpen(true)}
          icon={<Plus className="w-5 h-5" />}
        >
          Novo Lead
        </PrimaryButton>
      </div>

      {/* Horizontal Filter Bar for the 5 states + Todos */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {LEAD_STATUS_ORDER.map((status) => {
          const isActive = statusFilter === status;
          return (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`min-h-[44px] px-3.5 rounded-xl border text-[14px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                isActive
                  ? 'bg-[#1E293B] text-white border-[#1E293B]'
                  : 'bg-white text-[#0F172A] border-[#CBD5E1] hover:bg-slate-50'
              }`}
            >
              <span>{LEAD_STATUS_LABELS[status]}</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[12px] font-bold tabular-nums ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-[#475569]'
                }`}
              >
                {countsByStatus[status]}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setStatusFilter('ALL')}
          className={`min-h-[44px] px-3.5 rounded-xl border text-[14px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            statusFilter === 'ALL'
              ? 'bg-[#1E293B] text-white border-[#1E293B]'
              : 'bg-white text-[#475569] border-[#CBD5E1] hover:bg-slate-50'
          }`}
        >
          Todos ({activeLeads.length})
        </button>
      </div>

      {/* Leads List */}
      {filteredLeads.length === 0 ? (
        <EmptyState
          icon={<UserPlus className="w-6 h-6" />}
          title="Sem leads nesta etapa"
          description="Registe um pedido manual ou teste o formulário público no Portal Cliente para receber novos pedidos."
          actionLabel="+ Novo Lead Manual"
          onAction={() => setNewLeadOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredLeads.map((lead) => {
            const linkedClient = db.clients.find(
              (c) => c.lead_id === lead.id && !c.deleted_at
            );
            const linkedAsset = linkedClient
              ? db.service_assets.find(
                  (a) => a.client_id === linkedClient.id && !a.deleted_at
                )
              : null;

            return (
              <article
                key={lead.id}
                className="bg-white rounded-xl border border-[#E2E8F0] p-4 flex flex-col justify-between gap-3.5"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-[18px] font-bold text-[#0F172A]">{lead.name}</h3>
                      <p className="text-[13px] text-[#475569] tabular-nums">
                        {LEAD_SOURCE_LABELS[lead.source]} · {formatDatePT(lead.created_at)}
                      </p>
                    </div>
                    <StatusBadge
                      tone={LEAD_STATUS_TONE[lead.status]}
                      label={LEAD_STATUS_LABELS[lead.status]}
                    />
                  </div>

                  <div className="text-[15px] text-[#0F172A] space-y-1">
                    <p className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-[#475569] shrink-0" />
                      <a
                        href={`tel:${lead.phone.replace(/\s/g, '')}`}
                        className="font-medium hover:text-[#10B981] tabular-nums"
                      >
                        {lead.phone}
                      </a>
                      {lead.email && (
                        <span className="text-[14px] text-[#475569] truncate">
                          · {lead.email}
                        </span>
                      )}
                    </p>
                    {lead.address && (
                      <p className="flex items-start gap-2 text-[14px] text-[#475569]">
                        <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{lead.address}</span>
                      </p>
                    )}
                  </div>

                  {lead.description && (
                    <p className="text-[15px] text-[#0F172A] bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2">
                      “{lead.description}”
                    </p>
                  )}

                  {lead.status === 'LOST' && lead.lost_reason && (
                    <p className="text-[14px] font-medium text-[#B91C1C] bg-[#FEE2E2] rounded-lg px-3 py-2">
                      Motivo de perda: {lead.lost_reason}
                    </p>
                  )}

                  {/* Lead photos */}
                  {lead.photo_urls.length > 0 && (
                    <div className="flex items-center gap-2 overflow-x-auto pt-1">
                      {lead.photo_urls.map((url, idx) => (
                        <button
                          key={`${lead.id}-ph-${idx}`}
                          type="button"
                          onClick={() =>
                            setLightboxPhoto({
                              src: url,
                              caption: `${lead.name} — Foto ${idx + 1}`,
                            })
                          }
                          className="w-20 h-16 rounded-lg overflow-hidden border border-[#CBD5E1] shrink-0 cursor-pointer hover:opacity-90"
                        >
                          <img
                            src={url}
                            alt={`Foto enviada por ${lead.name}`}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Stage controls */}
                <div className="space-y-2.5 pt-2 border-t border-[#E2E8F0]">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor={`lead-stage-${lead.id}`}
                      className="text-[13px] font-semibold text-[#475569]"
                    >
                      Etapa:
                    </label>
                    <select
                      id={`lead-stage-${lead.id}`}
                      value={lead.status}
                      onChange={(e) =>
                        handleStatusChange(lead, e.target.value as LeadStatus)
                      }
                      className="min-h-[44px] flex-1 max-w-[240px] px-3 rounded-lg border border-[#CBD5E1] bg-white text-[14px] font-semibold text-[#0F172A]"
                    >
                      {LEAD_STATUS_ORDER.map((st) => (
                        <option key={st} value={st}>
                          {LEAD_STATUS_LABELS[st]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {lead.status !== 'WON' && lead.status !== 'LOST' && (
                      <>
                        <PrimaryButton
                          variant="secondary"
                          onClick={() => handleStatusChange(lead, 'LOST')}
                          icon={<XCircle className="w-4 h-4 text-[#B91C1C]" />}
                        >
                          Perdido
                        </PrimaryButton>
                        <PrimaryButton
                          onClick={() => onCreateQuoteForLead(lead.id)}
                          icon={<FileText className="w-4 h-4" />}
                        >
                          Criar Orçamento
                        </PrimaryButton>
                      </>
                    )}

                    {(lead.status === 'QUOTE_SENT' || lead.status === 'VISIT_SCHEDULED') && (
                      <div className="col-span-2">
                        <PrimaryButton
                          fullWidth
                          variant="secondary"
                          onClick={() => handleStatusChange(lead, 'WON')}
                          icon={<CheckCircle2 className="w-4 h-4 text-[#15803D]" />}
                        >
                          Fechar como Ganho (Converter em Cliente)
                        </PrimaryButton>
                      </div>
                    )}

                    {lead.status === 'WON' && (
                      <div className="col-span-2">
                        {linkedClient && linkedAsset ? (
                          <PrimaryButton
                            fullWidth
                            onClick={() =>
                              onScheduleFirstVisit(linkedClient.id, linkedAsset.id)
                            }
                            icon={<CalendarPlus className="w-4 h-4" />}
                          >
                            Agendar 1.ª Visita ({linkedClient.name})
                          </PrimaryButton>
                        ) : (
                          <PrimaryButton
                            fullWidth
                            onClick={() => handleStatusChange(lead, 'WON')}
                            icon={<UserPlus className="w-4 h-4" />}
                          >
                            Converter em Cliente + Ativo
                          </PrimaryButton>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Mandatory Lost Reason Bottom Sheet (TC-05) */}
      <BottomSheet
        open={Boolean(lostLeadTarget)}
        onClose={() => setLostLeadTarget(null)}
        title="Motivo da perda do pedido"
        subtitle={
          lostLeadTarget
            ? `Indique porque ${lostLeadTarget.name} não avançou (obrigatório)`
            : undefined
        }
      >
        {lostError && (
          <div className="p-3 rounded-lg bg-[#FEE2E2] text-[#B91C1C] text-[14px] font-semibold">
            {lostError}
          </div>
        )}

        <div className="space-y-2">
          {LOST_REASONS.map((reason) => {
            const active = selectedLostReason === reason;
            return (
              <button
                key={reason}
                type="button"
                onClick={() => {
                  setSelectedLostReason(reason);
                  setLostError('');
                }}
                className={`w-full min-h-[48px] px-4 rounded-xl border text-left text-[15px] font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#FEE2E2] border-[#DC2626] text-[#B91C1C] font-semibold'
                    : 'bg-white border-[#CBD5E1] text-[#0F172A] hover:bg-slate-50'
                }`}
              >
                {reason}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <PrimaryButton
            variant="secondary"
            onClick={() => setLostLeadTarget(null)}
          >
            Cancelar
          </PrimaryButton>
          <PrimaryButton variant="danger" onClick={handleConfirmLost}>
            Confirmar Perdido
          </PrimaryButton>
        </div>
      </BottomSheet>

      {/* Post-Conversion Modal (TC-06) */}
      <Modal
        open={Boolean(convertedModal)}
        onClose={() => setConvertedModal(null)}
        title="Lead convertido com sucesso"
        subtitle="Cliente e Ativo criados automaticamente no CRM"
      >
        <p className="text-[16px] text-[#0F172A]">
          <strong>{convertedModal?.clientName}</strong> já faz parte da sua carteira de
          clientes. Pretende agendar já a primeira visita no terreno?
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <PrimaryButton
            variant="secondary"
            fullWidth
            onClick={() => setConvertedModal(null)}
          >
            Mais tarde
          </PrimaryButton>
          <PrimaryButton
            fullWidth
            icon={<CalendarPlus className="w-5 h-5" />}
            onClick={() => {
              if (!convertedModal) return;
              const { clientId, assetId } = convertedModal;
              setConvertedModal(null);
              onScheduleFirstVisit(clientId, assetId);
            }}
          >
            Agendar 1.ª Visita
          </PrimaryButton>
        </div>
      </Modal>

      {/* Manual Lead Modal */}
      <NewLeadModal
        open={newLeadOpen}
        onClose={() => setNewLeadOpen(false)}
        onSubmit={(input) => {
          createLead(input);
          showToast(`Lead "${input.name}" registado.`, 'success');
          setNewLeadOpen(false);
          setStatusFilter('NEW');
        }}
      />

      <PhotoLightbox
        src={lightboxPhoto?.src ?? null}
        caption={lightboxPhoto?.caption}
        onClose={() => setLightboxPhoto(null)}
      />
    </div>
  );
};

interface NewLeadModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    phone: string;
    email?: string | null;
    address?: string | null;
    description?: string | null;
    source: 'MANUAL' | 'WHATSAPP';
    gdpr_consent: boolean;
  }) => void;
}

const NewLeadModal: React.FC<NewLeadModalProps> = ({ open, onClose, onSubmit }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [source, setSource] = useState<'MANUAL' | 'WHATSAPP'>('MANUAL');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      setError('Nome e telefone são obrigatórios.');
      return;
    }
    onSubmit({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || null,
      address: address.trim() || null,
      description: description.trim() || null,
      source,
      gdpr_consent: true,
    });
    setName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setDescription('');
    setError('');
  };

  return (
    <Modal open={open} onClose={onClose} title="Registar Novo Lead">
      <form onSubmit={handleSubmit} className="space-y-3.5">
        {error && (
          <div className="p-3 rounded-lg bg-[#FEE2E2] text-[#B91C1C] text-[14px] font-medium">
            {error}
          </div>
        )}
        <div>
          <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
            Nome *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Miguel Carvalho"
            className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px]"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
              Telefone *
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="912 000 000"
              className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px] tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
              Origem
            </label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as 'MANUAL' | 'WHATSAPP')}
              className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] bg-white text-[16px]"
            >
              <option value="MANUAL">Chamada / Registo Manual</option>
              <option value="WHATSAPP">WhatsApp</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
            Email (opcional)
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="cliente@exemplo.pt"
            className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px]"
          />
        </div>
        <div>
          <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
            Morada / Freguesia
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Ex.: Nogueiró, Braga"
            className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px]"
          />
        </div>
        <div>
          <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
            Descrição do pedido
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detalhes do espaço ou trabalho solicitado…"
            className="w-full p-3 rounded-[10px] border border-[#CBD5E1] text-[16px]"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <PrimaryButton type="button" variant="secondary" fullWidth onClick={onClose}>
            Cancelar
          </PrimaryButton>
          <PrimaryButton type="submit" fullWidth>
            Guardar Lead
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
};
