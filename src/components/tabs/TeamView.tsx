import React, { useMemo, useState } from 'react';
import { differenceInMinutes, isBefore, parseISO } from 'date-fns';
import {
  AlertTriangle,
  ArrowUpRight,
  Ban,
  CheckCircle2,
  Clock,
  Copy,
  Crown,
  Edit3,
  ExternalLink,
  Mail,
  MessageCircle,
  Phone,
  Shield,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { formatEUR, formatShortDatePT, SAAS_PLANS } from '../../i18n/pt-PT';
import { useZelvo } from '../../store/ZelvoContext';
import type { TeamInvitation, User } from '../../types/database';
import { buildWhatsAppUrl } from '../../utils/calculations';
import { EmptyState, Modal, PrimaryButton, StatusBadge } from '../common/UIPrimitives';
import { getUserInitials } from '../layout/MenuDrawer';

interface TeamViewProps {
  onOpenPlanSettings: () => void;
  onOpenInvitePage?: (token: string) => void;
}

type TeamSubTab = 'members' | 'invitations';

function formatRemainingValidity(expiresAtIso: string): string {
  const now = new Date();
  const expires = parseISO(expiresAtIso);
  if (isBefore(expires, now)) return 'Expirado';
  const totalMins = Math.max(1, differenceInMinutes(expires, now));
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return `Expira em ${days}d ${remHours}h`;
  }
  return `Expira em ${hours}h ${String(mins).padStart(2, '0')}m`;
}

function buildInviteLink(token: string): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/invite/${token}`;
  }
  return `/invite/${token}`;
}

function buildInviteWhatsAppMessage(inv: TeamInvitation, orgName: string): string {
  const link = buildInviteLink(inv.token);
  return `Olá ${inv.full_name}! Foste convidado para integrar a equipa da ${orgName} na app Zelvo como Técnico de Campo. Aceita o convite nas próximas 48 horas através deste link: ${link}`;
}

export const TeamView: React.FC<TeamViewProps> = ({
  onOpenPlanSettings,
  onOpenInvitePage,
}) => {
  const {
    db,
    organization,
    createTeamInvitation,
    acceptTeamInvitation,
    revokeTeamInvitation,
    toggleUserActiveStatus,
    updateUserHourlyCost,
    showToast,
  } = useZelvo();

  const [subTab, setSubTab] = useState<TeamSubTab>('members');
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [createdInvitation, setCreatedInvitation] = useState<TeamInvitation | null>(null);

  // Invite form state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [hourlyCost, setHourlyCost] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Deactivate technician confirmation modal
  const [userToDeactivate, setUserToDeactivate] = useState<User | null>(null);

  // Inline hourly cost editing modal
  const [editingCostUser, setEditingCostUser] = useState<User | null>(null);
  const [editingCostValue, setEditingCostValue] = useState('');

  const planMeta = useMemo(
    () => SAAS_PLANS.find((p) => p.id === organization.plan) ?? SAAS_PLANS[0],
    [organization.plan]
  );

  const activeUsers = useMemo(
    () => db.users.filter((u) => u.is_active),
    [db.users]
  );

  const pendingInvitations = useMemo(() => {
    const now = new Date();
    return db.team_invitations.filter(
      (inv) => inv.status === 'PENDING' && !isBefore(parseISO(inv.expires_at), now)
    );
  }, [db.team_invitations]);

  const historicalInvitations = useMemo(() => {
    const now = new Date();
    return db.team_invitations.filter(
      (inv) => inv.status !== 'PENDING' || isBefore(parseISO(inv.expires_at), now)
    );
  }, [db.team_invitations]);

  const occupiedSeats = activeUsers.length + pendingInvitations.length;
  const maxSeats = planMeta.maxUsers;
  const seatsLimitReached = occupiedSeats >= maxSeats;
  const seatsPct = Math.min(100, Math.round((occupiedSeats / Math.max(1, maxSeats)) * 100));

  const sortedMembers = useMemo(() => {
    return [...db.users].sort((a, b) => {
      if (a.role !== b.role) return a.role === 'ADMIN' ? -1 : 1;
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      return a.full_name.localeCompare(b.full_name, 'pt');
    });
  }, [db.users]);

  const jobCountByUserId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const job of db.jobs) {
      if (job.deleted_at || !job.assigned_user_id) continue;
      counts.set(job.assigned_user_id, (counts.get(job.assigned_user_id) ?? 0) + 1);
    }
    return counts;
  }, [db.jobs]);

  const resetInviteForm = () => {
    setFullName('');
    setPhone('');
    setEmail('');
    setHourlyCost('');
    setFormError(null);
  };

  const handleOpenInviteModal = () => {
    resetInviteForm();
    setInviteModalOpen(true);
  };

  const handleCreateInvite = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (fullName.trim().length < 2) {
      setFormError('Indique o nome completo do técnico.');
      return;
    }
    if (phone.trim().length < 9) {
      setFormError('Indique um número de telemóvel (WhatsApp) válido.');
      return;
    }
    if (!email.trim().includes('@')) {
      setFormError('Indique um endereço de email válido.');
      return;
    }

    const parsedCost = hourlyCost.trim() ? Number(hourlyCost.replace(',', '.')) : null;
    if (parsedCost !== null && (Number.isNaN(parsedCost) || parsedCost < 0)) {
      setFormError('O custo/hora deve ser um valor numérico válido.');
      return;
    }

    const res = createTeamInvitation({
      full_name: fullName.trim(),
      phone: phone.trim(),
      email: email.trim(),
      role: 'TECHNICIAN',
      hourly_cost: parsedCost,
    });

    if (!res.ok || !res.invitation) {
      setFormError(res.error ?? 'Não foi possível criar o convite.');
      return;
    }

    setInviteModalOpen(false);
    setCreatedInvitation(res.invitation);
    setSubTab('invitations');
  };

  const handleCopyInviteLink = async (token: string) => {
    const link = buildInviteLink(token);
    try {
      await navigator.clipboard.writeText(link);
      showToast('Link de convite copiado para a área de transferência.', 'success');
    } catch {
      showToast(`Link de convite: /invite/${token}`, 'info');
    }
  };

  const handleToggleMember = (member: User) => {
    if (member.role === 'ADMIN') return;
    if (member.is_active) {
      setUserToDeactivate(member);
    } else {
      toggleUserActiveStatus(member.id, true);
    }
  };

  const handleConfirmDeactivate = () => {
    if (!userToDeactivate) return;
    toggleUserActiveStatus(userToDeactivate.id, false);
    setUserToDeactivate(null);
  };

  const handleSaveHourlyCost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCostUser) return;
    const parsed = editingCostValue.trim()
      ? Number(editingCostValue.replace(',', '.'))
      : null;
    updateUserHourlyCost(editingCostUser.id, parsed);
    setEditingCostUser(null);
  };

  return (
    <div className="space-y-4">
      {/* 1. Plan Limit Bar */}
      <section className="bg-white rounded-2xl border border-[#E2E8F0] p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                seatsLimitReached
                  ? 'bg-[#FEF3C7] text-[#B45309]'
                  : 'bg-[#DCFCE7] text-[#15803D]'
              }`}
            >
              <Crown className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-[#0F172A] tabular-nums">
                {activeUsers.length} / {maxSeats}{' '}
                {activeUsers.length === 1 ? 'utilizador ativo' : 'utilizadores ativos'} no plano{' '}
                <span className="text-[#059669]">{planMeta.name}</span>
              </p>
              <p className="text-[13px] text-[#475569] tabular-nums mt-0.5">
                {pendingInvitations.length > 0
                  ? `${pendingInvitations.length} ${
                      pendingInvitations.length === 1 ? 'convite pendente' : 'convites pendentes'
                    } (${occupiedSeats} / ${maxSeats} vagas reservadas)`
                  : `Vagas disponíveis para convidar: ${Math.max(0, maxSeats - occupiedSeats)}`}
              </p>
            </div>
          </div>

          <PrimaryButton
            onClick={handleOpenInviteModal}
            disabled={seatsLimitReached}
            icon={<UserPlus className="w-5 h-5" />}
            className="w-full sm:w-auto"
          >
            Convidar Técnico
          </PrimaryButton>
        </div>

        {/* Visual occupancy bar */}
        <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              seatsLimitReached
                ? 'bg-[#DC2626]'
                : occupiedSeats >= maxSeats - 1
                  ? 'bg-[#D97706]'
                  : 'bg-[#10B981]'
            }`}
            style={{ width: `${seatsPct}%` }}
          />
        </div>

        {seatsLimitReached && (
          <div className="rounded-xl bg-[#FEF3C7] border border-[#FDE68A] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-[13px] text-[#92400E]">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
              <span>
                Atingiu o limite de vagas do plano <strong>{planMeta.name}</strong> (ativos +
                convites pendentes). Para convidar mais técnicos, faça upgrade do plano ou revogue
                um convite.
              </span>
            </div>
            <button
              type="button"
              onClick={onOpenPlanSettings}
              className="min-h-11 px-3.5 rounded-lg bg-[#92400E] hover:bg-[#78350F] text-white text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>Fazer Upgrade</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </section>

      {/* 2. Segmented Tabs: Membros da Equipa vs Convites Pendentes */}
      <div
        role="tablist"
        aria-label="Secções de gestão de equipa"
        className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-200/80 border border-[#CBD5E1]"
      >
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'members'}
          onClick={() => setSubTab('members')}
          className={`min-h-12 px-3 rounded-lg text-[14px] font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer ${
            subTab === 'members'
              ? 'bg-white text-[#0F172A] shadow-xs'
              : 'text-[#475569] hover:text-[#0F172A]'
          }`}
        >
          <Users className="w-4 h-4 shrink-0" />
          <span className="truncate">Membros da Equipa</span>
          <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-[#0F172A] text-[12px] font-bold tabular-nums">
            {db.users.length}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'invitations'}
          onClick={() => setSubTab('invitations')}
          className={`min-h-12 px-3 rounded-lg text-[14px] font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer ${
            subTab === 'invitations'
              ? 'bg-white text-[#0F172A] shadow-xs'
              : 'text-[#475569] hover:text-[#0F172A]'
          }`}
        >
          <Clock className="w-4 h-4 shrink-0" />
          <span className="truncate">Convites Pendentes</span>
          {pendingInvitations.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E] text-[12px] font-bold tabular-nums">
              {pendingInvitations.length}
            </span>
          )}
        </button>
      </div>

      {/* 3. Section: Membros da Equipa */}
      {subTab === 'members' && (
        <section className="space-y-2.5">
          {sortedMembers.map((member) => {
            const isAdmin = member.role === 'ADMIN';
            const assignedCount = jobCountByUserId.get(member.id) ?? 0;

            return (
              <div
                key={member.id}
                className={`bg-white rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 transition-opacity ${
                  member.is_active
                    ? 'border-[#E2E8F0]'
                    : 'border-slate-200 bg-slate-50/70 opacity-80'
                }`}
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div
                    aria-hidden="true"
                    className={`w-11 h-11 rounded-full text-[15px] font-bold flex items-center justify-center shrink-0 ${
                      !member.is_active
                        ? 'bg-slate-200 text-slate-500'
                        : isAdmin
                          ? 'bg-[#1E293B] text-white'
                          : 'bg-[#CCFBF1] text-[#0F766E]'
                    }`}
                  >
                    {getUserInitials(member.full_name)}
                  </div>

                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[16px] font-bold text-[#0F172A] leading-tight">
                        {member.full_name}
                      </h3>
                      <StatusBadge
                        tone={isAdmin ? 'neutral' : member.is_active ? 'teal' : 'neutral'}
                        label={isAdmin ? 'Admin' : 'Técnico de Campo'}
                        icon={
                          isAdmin ? (
                            <Shield className="w-3.5 h-3.5" />
                          ) : (
                            <UserCheck className="w-3.5 h-3.5" />
                          )
                        }
                      />
                      {!member.is_active && <StatusBadge tone="danger" label="Inativo" />}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[#475569]">
                      {member.phone && (
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Phone className="w-3.5 h-3.5 text-[#64748B]" />
                          {member.phone}
                        </span>
                      )}
                      {member.email && (
                        <span className="inline-flex items-center gap-1 truncate">
                          <Mail className="w-3.5 h-3.5 text-[#64748B]" />
                          {member.email}
                        </span>
                      )}
                      <span className="tabular-nums text-[#64748B]">
                        {assignedCount} {assignedCount === 1 ? 'visita' : 'visitas'} no histórico
                      </span>
                    </div>

                    {!isAdmin && (
                      <div className="flex items-center gap-2 pt-0.5 text-[13px]">
                        <span className="text-[#475569] tabular-nums">
                          Custo/hora:{' '}
                          <strong className="text-[#0F172A]">
                            {member.hourly_cost != null
                              ? `${formatEUR(member.hourly_cost)}/h`
                              : 'Não definido'}
                          </strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCostUser(member);
                            setEditingCostValue(
                              member.hourly_cost != null ? String(member.hourly_cost) : ''
                            );
                          }}
                          className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#059669] hover:underline cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Editar</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right control: Ativo / Inativo Toggle for Technicians */}
                <div className="flex items-center justify-between sm:justify-end gap-3 pt-2.5 sm:pt-0 border-t sm:border-t-0 border-[#F1F5F9] shrink-0">
                  {isAdmin ? (
                    <span className="text-[13px] font-semibold text-[#15803D]">Conta Principal</span>
                  ) : (
                    <div className="flex items-center gap-3 w-full sm:w-auto justify-between">
                      <span
                        className={`text-[13px] font-semibold ${
                          member.is_active ? 'text-[#15803D]' : 'text-[#64748B]'
                        }`}
                      >
                        {member.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={member.is_active}
                        aria-label={`Alternar estado de ${member.full_name}`}
                        onClick={() => handleToggleMember(member)}
                        className="min-h-12 min-w-12 flex items-center justify-end cursor-pointer"
                      >
                        <span
                          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                            member.is_active ? 'bg-[#10B981]' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                              member.is_active ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* 4. Section: Convites Pendentes */}
      {subTab === 'invitations' && (
        <section className="space-y-4">
          {pendingInvitations.length === 0 ? (
            <EmptyState
              icon={<UserPlus className="w-6 h-6" />}
              title="Sem convites pendentes"
              description="Convide técnicos de campo por WhatsApp ou email para acederem apenas às suas visitas do dia."
              actionLabel={seatsLimitReached ? undefined : 'Convidar Técnico'}
              onAction={seatsLimitReached ? undefined : handleOpenInviteModal}
            />
          ) : (
            <div className="space-y-3">
              {pendingInvitations.map((inv) => {
                const whatsappHref = buildWhatsAppUrl(
                  inv.phone,
                  buildInviteWhatsAppMessage(inv, organization.name)
                );

                return (
                  <div
                    key={inv.id}
                    className="bg-white rounded-2xl border border-[#E2E8F0] p-4 space-y-3.5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2.5">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-[16px] font-bold text-[#0F172A]">{inv.full_name}</h3>
                          <StatusBadge
                            tone="warning"
                            label={formatRemainingValidity(inv.expires_at)}
                            icon={<Clock className="w-3.5 h-3.5" />}
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[#475569]">
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <Phone className="w-3.5 h-3.5 text-[#64748B]" />
                            {inv.phone}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Mail className="w-3.5 h-3.5 text-[#64748B]" />
                            {inv.email}
                          </span>
                          {inv.hourly_cost != null && (
                            <span className="tabular-nums font-medium text-[#0F172A]">
                              Custo/hora: {formatEUR(inv.hourly_cost)}/h
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] font-mono text-[#64748B] truncate">
                          Link: /invite/{inv.token}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {onOpenInvitePage && (
                          <button
                            type="button"
                            onClick={() => onOpenInvitePage(inv.token)}
                            className="min-h-11 px-3 rounded-lg border border-[#10B981] bg-[#DCFCE7] hover:bg-[#BBF7D0] text-[13px] font-semibold text-[#15803D] inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <ExternalLink className="w-4 h-4" />
                            <span>Abrir Página de Convite</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleCopyInviteLink(inv.token)}
                          className="min-h-11 px-3 rounded-lg border border-[#CBD5E1] bg-slate-50 hover:bg-slate-100 text-[13px] font-semibold text-[#0F172A] inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Copy className="w-4 h-4 text-[#475569]" />
                          <span>Copiar Link</span>
                        </button>
                      </div>
                    </div>

                    {/* 3 Quick Actions: Reenviar WhatsApp · Simular Aceitação · Revogar */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2.5 border-t border-[#F1F5F9]">
                      <a
                        href={whatsappHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-12 px-3.5 rounded-[10px] bg-[#DCFCE7] hover:bg-[#BBF7D0] text-[#15803D] text-[14px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <MessageCircle className="w-4 h-4 shrink-0" />
                        <span>Reenviar WhatsApp</span>
                      </a>

                      <button
                        type="button"
                        onClick={() => acceptTeamInvitation(inv.id)}
                        className="min-h-12 px-3.5 rounded-[10px] bg-[#10B981] hover:bg-[#059669] text-white text-[14px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>Simular Aceitação</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => revokeTeamInvitation(inv.id)}
                        className="min-h-12 px-3.5 rounded-[10px] bg-white hover:bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA] text-[14px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <Ban className="w-4 h-4 shrink-0" />
                        <span>Revogar</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Quiet Historical Invitations Audit List */}
          {historicalInvitations.length > 0 && (
            <div className="pt-2 space-y-2">
              <h4 className="text-[13px] font-semibold text-[#475569] px-1">
                Histórico de Convites ({historicalInvitations.length})
              </h4>
              <div className="bg-white rounded-2xl border border-[#E2E8F0] divide-y divide-[#F1F5F9]">
                {historicalInvitations.map((inv) => {
                  const statusLabel =
                    inv.status === 'ACCEPTED'
                      ? 'Aceite'
                      : inv.status === 'REVOKED'
                        ? 'Revogado'
                        : 'Expirado';
                  const statusTone =
                    inv.status === 'ACCEPTED'
                      ? 'success'
                      : inv.status === 'REVOKED'
                        ? 'danger'
                        : 'neutral';

                  return (
                    <div
                      key={inv.id}
                      className="px-4 py-3 flex items-center justify-between gap-3 text-[14px]"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-[#0F172A] truncate">{inv.full_name}</p>
                        <p className="text-[12px] text-[#64748B] truncate tabular-nums">
                          {inv.email} · Criado a {formatShortDatePT(inv.created_at)}
                        </p>
                      </div>
                      <StatusBadge tone={statusTone} label={statusLabel} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Modal: + Convidar Técnico */}
      <Modal
        open={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        title="Convidar Técnico de Campo"
        subtitle="O convite gera um link único válido durante 48 horas."
      >
        <form onSubmit={handleCreateInvite} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-xl bg-[#FEE2E2] text-[#B91C1C] text-[14px] font-medium">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
              Nome Completo *
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ex.: André Peixoto"
              className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
                Telemóvel (WhatsApp) *
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="912 345 678"
                className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px] tabular-nums"
              />
            </div>

            <div>
              <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
                Email *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="andre@empresa.pt"
                className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
              Custo/Hora (€ — opcional)
            </label>
            <input
              type="number"
              min={0}
              step="0.50"
              value={hourlyCost}
              onChange={(e) => setHourlyCost(e.target.value)}
              placeholder="Ex.: 14.00"
              className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px] tabular-nums"
            />
            <p className="text-[12px] text-[#64748B] mt-1">
              Visível apenas para o Administrador para estimar o custo de mão-de-obra nas visitas
              concluídas.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <PrimaryButton
              type="button"
              variant="secondary"
              fullWidth
              onClick={() => setInviteModalOpen(false)}
            >
              Cancelar
            </PrimaryButton>
            <PrimaryButton type="submit" fullWidth icon={<UserPlus className="w-5 h-5" />}>
              Criar Convite
            </PrimaryButton>
          </div>
        </form>
      </Modal>

      {/* Modal: Convite Criado com Sucesso */}
      <Modal
        open={createdInvitation !== null}
        onClose={() => setCreatedInvitation(null)}
        title="Convite Pronto a Enviar"
        subtitle="Partilhe o link com o técnico. Válido por 48 horas."
      >
        {createdInvitation && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-[#059669] shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-[#0F172A]">
                  {createdInvitation.full_name}
                </p>
                <p className="text-[13px] text-[#047857] mt-0.5">
                  Convite criado como Técnico de Campo · Expira em 48h
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[13px] font-semibold text-[#475569]">
                Link de Convite
              </label>
              <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] text-[13px] font-mono text-[#0F172A] break-all">
                /invite/{createdInvitation.token}
              </div>
            </div>

            <div className="space-y-2.5 pt-1">
              <a
                href={buildWhatsAppUrl(
                  createdInvitation.phone,
                  buildInviteWhatsAppMessage(createdInvitation, organization.name)
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full min-h-12 px-4 rounded-[10px] bg-[#10B981] hover:bg-[#059669] text-white text-[16px] font-semibold inline-flex items-center justify-center gap-2 transition-colors"
              >
                <MessageCircle className="w-5 h-5 shrink-0" />
                <span>Enviar por WhatsApp</span>
              </a>

              <PrimaryButton
                variant="secondary"
                fullWidth
                icon={<Copy className="w-5 h-5" />}
                onClick={() => void handleCopyInviteLink(createdInvitation.token)}
              >
                Copiar Link
              </PrimaryButton>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Confirmação ao Desativar Técnico */}
      <Modal
        open={userToDeactivate !== null}
        onClose={() => setUserToDeactivate(null)}
        title="Desativar Técnico de Campo?"
      >
        {userToDeactivate && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-[#FEF3C7] border border-[#FDE68A] flex items-start gap-3 text-[14px] text-[#92400E]">
              <AlertTriangle className="w-5 h-5 text-[#B45309] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-[#0F172A]">{userToDeactivate.full_name}</p>
                <p>
                  Ao desativar este técnico, o <strong>acesso é revogado de imediato</strong>, a{' '}
                  <strong>vaga no plano fica livre</strong> para novos convites e{' '}
                  <strong>todo o histórico de visitas anteriores é preservado</strong>.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <PrimaryButton
                type="button"
                variant="secondary"
                fullWidth
                onClick={() => setUserToDeactivate(null)}
              >
                Cancelar
              </PrimaryButton>
              <PrimaryButton
                type="button"
                variant="danger"
                fullWidth
                onClick={handleConfirmDeactivate}
              >
                Desativar Técnico
              </PrimaryButton>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Editar Custo/Hora */}
      <Modal
        open={editingCostUser !== null}
        onClose={() => setEditingCostUser(null)}
        title="Editar Custo/Hora"
        subtitle={editingCostUser?.full_name}
      >
        <form onSubmit={handleSaveHourlyCost} className="space-y-4">
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
              Custo/Hora (€ — opcional)
            </label>
            <input
              type="number"
              min={0}
              step="0.50"
              value={editingCostValue}
              onChange={(e) => setEditingCostValue(e.target.value)}
              placeholder="Deixe vazio para não calcular"
              className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px] tabular-nums"
            />
          </div>
          <div className="flex gap-3">
            <PrimaryButton
              type="button"
              variant="secondary"
              fullWidth
              onClick={() => setEditingCostUser(null)}
            >
              Cancelar
            </PrimaryButton>
            <PrimaryButton type="submit" fullWidth>
              Guardar Custo
            </PrimaryButton>
          </div>
        </form>
      </Modal>
    </div>
  );
};
