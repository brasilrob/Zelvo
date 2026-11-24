import React, { useEffect } from 'react';
import {
  ChevronRight,
  ExternalLink,
  Megaphone,
  Package,
  Settings,
  Shield,
  UserCheck,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import type { Organization, User } from '../../types/database';

export type SecondaryViewId = 'stock' | 'marketing' | 'team' | 'settings';

interface MenuDrawerProps {
  open: boolean;
  onClose: () => void;
  organization: Organization;
  users: User[];
  currentUser: User;
  isTechnicianMode: boolean;
  onSelectUser: (userId: string) => void;
  moreAlertsCount: number;
  pendingInvitesCount: number;
  isOffline: boolean;
  isSyncing: boolean;
  pendingSyncCount: number;
  onToggleOffline: () => void;
  onOpenSecondaryView: (view: SecondaryViewId) => void;
  onOpenClientPortal: () => void;
  activeSecondaryView: SecondaryViewId | null;
}

export function getUserInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Z';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

export const MenuDrawer: React.FC<MenuDrawerProps> = ({
  open,
  onClose,
  organization,
  users,
  currentUser,
  isTechnicianMode,
  onSelectUser,
  moreAlertsCount,
  pendingInvitesCount,
  isOffline,
  isSyncing,
  pendingSyncCount,
  onToggleOffline,
  onOpenSecondaryView,
  onOpenClientPortal,
  activeSecondaryView,
}) => {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const adminUser = users.find((u) => u.role === 'ADMIN' && u.is_active) ?? users[0];
  const activeTechnicians = users.filter((u) => u.role === 'TECHNICIAN' && u.is_active);
  const firstTechnician = activeTechnicians[0];
  const firstName = currentUser.full_name.split(' ')[0];

  const handleSwitchRole = (target: 'ADMIN' | 'TECHNICIAN') => {
    if (target === 'ADMIN' && adminUser) {
      onSelectUser(adminUser.id);
    } else if (target === 'TECHNICIAN' && firstTechnician) {
      if (!isTechnicianMode) {
        onSelectUser(firstTechnician.id);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/55 backdrop-blur-[2px] no-print"
      role="dialog"
      aria-modal="true"
      aria-label="Menu e Ferramentas"
      onClick={onClose}
    >
      <aside
        className="w-full max-w-[380px] h-full bg-[#F8FAFC] shadow-2xl border-l border-[#E2E8F0] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Drawer Bar */}
        <div className="bg-[#1E293B] text-white px-4 h-[60px] flex items-center justify-between shrink-0 border-b border-slate-700/80">
          <h2 className="text-[16px] font-bold tracking-tight">Menu &amp; Ferramentas</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar menu"
            className="min-h-12 min-w-12 -mr-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable 4-Block Menu Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Bloco 1: Cabeçalho do Perfil */}
          <section className="bg-white rounded-2xl border border-[#E2E8F0] p-4 space-y-4">
            <div className="flex items-center gap-3.5">
              <div
                aria-hidden="true"
                className="w-12 h-12 rounded-full bg-[#1E293B] text-white text-[16px] font-bold flex items-center justify-center shrink-0"
              >
                {getUserInitials(currentUser.full_name)}
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-[#475569] truncate">
                  {organization.name}
                </p>
                <p className="text-[17px] font-bold text-[#0F172A] truncate leading-tight">
                  {firstName}
                </p>
                <p className="text-[12px] text-[#059669] font-semibold mt-0.5">
                  {isTechnicianMode ? 'Técnico de Campo' : 'Administrador'}
                </p>
              </div>
            </div>

            {/* Segmented Control: Admin vs Técnico de Campo */}
            <div className="space-y-2">
              <p className="text-[12px] font-semibold text-[#475569]">Modo de Utilização</p>
              <div
                role="group"
                aria-label="Alternar entre Admin e Técnico de Campo"
                className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 border border-[#E2E8F0]"
              >
                <button
                  type="button"
                  onClick={() => handleSwitchRole('ADMIN')}
                  aria-pressed={!isTechnicianMode}
                  className={`min-h-12 px-2.5 rounded-lg text-[14px] font-semibold inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                    !isTechnicianMode
                      ? 'bg-white text-[#0F172A] shadow-xs border border-[#E2E8F0]'
                      : 'text-[#475569] hover:text-[#0F172A]'
                  }`}
                >
                  <Shield className="w-4 h-4 text-[#059669] shrink-0" />
                  <span>Admin</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchRole('TECHNICIAN')}
                  disabled={!firstTechnician}
                  aria-pressed={isTechnicianMode}
                  className={`min-h-12 px-2.5 rounded-lg text-[14px] font-semibold inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap disabled:opacity-40 ${
                    isTechnicianMode
                      ? 'bg-[#0F766E] text-white shadow-xs'
                      : 'text-[#475569] hover:text-[#0F172A]'
                  }`}
                >
                  <UserCheck className="w-4 h-4 shrink-0" />
                  <span>Técnico de Campo</span>
                </button>
              </div>

              {/* Active Technician selector when in Field Technician mode */}
              {isTechnicianMode && activeTechnicians.length > 0 && (
                <div className="pt-1">
                  <label
                    htmlFor="drawer-tech-select"
                    className="block text-[12px] font-medium text-[#475569] mb-1"
                  >
                    Técnico ativo no terreno ({activeTechnicians.length})
                  </label>
                  <select
                    id="drawer-tech-select"
                    value={currentUser.id}
                    onChange={(e) => onSelectUser(e.target.value)}
                    className="w-full min-h-12 px-3 rounded-xl border border-[#CBD5E1] bg-white text-[15px] font-medium text-[#0F172A]"
                  >
                    {activeTechnicians.map((tech) => (
                      <option key={tech.id} value={tech.id}>
                        {tech.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {activeTechnicians.length === 0 && (
                <p className="text-[12px] text-[#64748B]">
                  Sem técnicos ativos. Convide técnicos em Equipa &amp; Técnicos.
                </p>
              )}
            </div>
          </section>

          {/* Bloco 2: Operações & Crescimento (apenas visível para Admin) */}
          {!isTechnicianMode && (
            <section className="space-y-2">
              <h3 className="px-1 text-[13px] font-semibold text-[#475569]">
                Operações &amp; Crescimento
              </h3>
              <div className="bg-white rounded-2xl border border-[#E2E8F0] divide-y divide-[#F1F5F9] overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    onOpenSecondaryView('team');
                    onClose();
                  }}
                  className={`w-full min-h-[64px] px-4 py-3 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                    activeSecondaryView === 'team'
                      ? 'bg-[#ECFDF5]'
                      : 'hover:bg-slate-50 active:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-[#CCFBF1] text-[#0F766E] flex items-center justify-center shrink-0">
                      <Users className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[15px] font-bold text-[#0F172A] leading-snug">
                        Equipa &amp; Técnicos
                      </p>
                      <p className="text-[13px] text-[#475569] truncate">
                        Membros ativos, convites e custos/hora
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {pendingInvitesCount > 0 && (
                      <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] text-[12px] font-bold inline-flex items-center justify-center tabular-nums">
                        {pendingInvitesCount}
                      </span>
                    )}
                    <ChevronRight className="w-5 h-5 text-[#94A3B8]" />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onOpenSecondaryView('stock');
                    onClose();
                  }}
                  className={`w-full min-h-[64px] px-4 py-3 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                    activeSecondaryView === 'stock'
                      ? 'bg-[#ECFDF5]'
                      : 'hover:bg-slate-50 active:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-[#DCFCE7] text-[#15803D] flex items-center justify-center shrink-0">
                      <Package className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[15px] font-bold text-[#0F172A] leading-snug">
                        Stock &amp; Máquinas
                      </p>
                      <p className="text-[13px] text-[#475569] truncate">
                        Inventário, compras e revisões
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {moreAlertsCount > 0 && (
                      <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA] text-[12px] font-bold inline-flex items-center justify-center tabular-nums">
                        {moreAlertsCount}
                      </span>
                    )}
                    <ChevronRight className="w-5 h-5 text-[#94A3B8]" />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onOpenSecondaryView('marketing');
                    onClose();
                  }}
                  className={`w-full min-h-[64px] px-4 py-3 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                    activeSecondaryView === 'marketing'
                      ? 'bg-[#ECFDF5]'
                      : 'hover:bg-slate-50 active:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-[#E0F2FE] text-[#0369A1] flex items-center justify-center shrink-0">
                      <Megaphone className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[15px] font-bold text-[#0F172A] leading-snug">
                        Marketing &amp; Fidelização
                      </p>
                      <p className="text-[13px] text-[#475569] truncate">
                        Avaliações, campanhas e antes/depois
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-[#94A3B8] shrink-0" />
                </button>
              </div>
            </section>
          )}

          {/* Bloco 3: Ferramentas de Teste & Cliente */}
          <section className="space-y-2">
            <h3 className="px-1 text-[13px] font-semibold text-[#475569]">
              Ferramentas de Teste &amp; Cliente
            </h3>
            <div className="bg-white rounded-2xl border border-[#E2E8F0] divide-y divide-[#F1F5F9] overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  onOpenClientPortal();
                  onClose();
                }}
                className="w-full min-h-[64px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-[#CCFBF1] text-[#0F766E] flex items-center justify-center shrink-0">
                    <ExternalLink className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold text-[#0F172A] leading-snug">
                      Portal do Cliente
                    </p>
                    <p className="text-[13px] text-[#475569] truncate">
                      Ver orçamentos e pagamentos como cliente
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-[#94A3B8] shrink-0" />
              </button>

              <div className="min-h-[64px] px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isOffline
                        ? 'bg-[#FEF3C7] text-[#B45309]'
                        : 'bg-slate-100 text-[#475569]'
                    }`}
                  >
                    {isOffline ? (
                      <WifiOff className="w-5 h-5" />
                    ) : (
                      <Wifi className="w-5 h-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold text-[#0F172A] leading-snug">
                      Modo Offline (Simulador)
                    </p>
                    <p className="text-[13px] text-[#475569] truncate tabular-nums">
                      {isOffline
                        ? `${pendingSyncCount} ${
                            pendingSyncCount === 1 ? 'alteração guardada' : 'alterações guardadas'
                          } localmente`
                        : 'Simular trabalho sem rede móvel'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={isOffline}
                  aria-label="Ativar ou desativar Modo Offline"
                  disabled={isSyncing}
                  onClick={onToggleOffline}
                  className="min-h-12 min-w-12 flex items-center justify-end shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <span
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                      isOffline ? 'bg-[#D97706]' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                        isOffline ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </span>
                </button>
              </div>
            </div>
          </section>

          {/* Bloco 4: Sistema */}
          <section className="space-y-2">
            <h3 className="px-1 text-[13px] font-semibold text-[#475569]">Sistema</h3>
            <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden">
              {!isTechnicianMode ? (
                <button
                  type="button"
                  onClick={() => {
                    onOpenSecondaryView('settings');
                    onClose();
                  }}
                  className={`w-full min-h-[64px] px-4 py-3 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                    activeSecondaryView === 'settings'
                      ? 'bg-[#ECFDF5]'
                      : 'hover:bg-slate-50 active:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 text-[#1E293B] flex items-center justify-center shrink-0">
                      <Settings className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[15px] font-bold text-[#0F172A] leading-snug">
                        Definições da Empresa &amp; Plano
                      </p>
                      <p className="text-[13px] text-[#475569] truncate">
                        Marca, NIF, vertical e subscrição
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-[#94A3B8] shrink-0" />
                </button>
              ) : (
                <div className="px-4 py-3.5 flex items-center gap-3 text-[13px] text-[#475569]">
                  <Settings className="w-5 h-5 text-[#94A3B8] shrink-0" />
                  <span>
                    As definições da empresa, stock e faturação estão disponíveis no modo{' '}
                    <strong className="text-[#0F172A]">Admin</strong>.
                  </span>
                </div>
              )}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
};
