/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { format, isBefore, parseISO, startOfDay } from 'date-fns';
import {
  ArrowLeft,
  CalendarDays,
  Euro,
  FileText,
  Inbox,
  Menu,
  RefreshCw,
  UserCheck,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { SyncStatusBanner, ToastContainer } from './components/common/UIPrimitives';
import { ZelvoLogo } from './components/common/ZelvoLogo';
import {
  getUserInitials,
  MenuDrawer,
  type SecondaryViewId,
} from './components/layout/MenuDrawer';
import { OnboardingFlow } from './components/onboarding/OnboardingFlow';
import {
  ClientPortalView,
  type PortalRouteMode,
} from './components/portal/ClientPortalView';
import { SettingsModal } from './components/settings/SettingsModal';
import { ClientsTab } from './components/tabs/ClientsTab';
import { FinanceTab } from './components/tabs/FinanceTab';
import { LeadsTab } from './components/tabs/LeadsTab';
import { MarketingView } from './components/tabs/MarketingView';
import { QuotesTab } from './components/tabs/QuotesTab';
import { StockEquipmentView } from './components/tabs/StockEquipmentView';
import { TeamView } from './components/tabs/TeamView';
import { TodayTab } from './components/tabs/TodayTab';
import { APP_TABS, type AppTabId, formatWeekdayHeaderPT } from './i18n/pt-PT';
import {
  buildDailyVisitsAlertContent,
  buildPendingPaymentsAlertContent,
  dispatchServiceWorkerNotification,
  loadPushPreferences,
  savePushPreferences,
} from './services/pushNotifications';
import { useZelvo, ZelvoProvider } from './store/ZelvoContext';

const TAB_ICONS: Record<AppTabId, React.ComponentType<{ className?: string }>> = {
  today: CalendarDays,
  leads: Inbox,
  clients: Users,
  quotes: FileText,
  finance: Euro,
};

const SECONDARY_VIEW_META: Record<SecondaryViewId, { title: string; subtitle: string }> = {
  team: {
    title: 'Equipa & Convites',
    subtitle: 'Membros ativos, convites de técnicos e limites do plano',
  },
  stock: {
    title: 'Stock & Máquinas',
    subtitle: 'Inventário, lista de compras e revisões da frota',
  },
  marketing: {
    title: 'Marketing & Fidelização',
    subtitle: 'Avaliações Google, campanhas sazonais e antes/depois',
  },
  settings: {
    title: 'Definições da Empresa & Plano',
    subtitle: 'Marca, NIF, vertical de negócio, notificações e subscrição',
  },
};

const ZelvoShell: React.FC = () => {
  const {
    db,
    organization,
    currentUser,
    isTechnicianMode,
    setCurrentUserId,
    isOffline,
    isSyncing,
    syncJustCompleted,
    syncQueue,
    toasts,
    dismissToast,
    toggleOffline,
    syncNow,
  } = useZelvo();

  const [activeTab, setActiveTab] = useState<AppTabId>('today');
  const [secondaryView, setSecondaryView] = useState<SecondaryViewId | null>(null);
  const [previousTab, setPreviousTab] = useState<AppTabId>('today');
  const [menuOpen, setMenuOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  const [portalState, setPortalState] = useState<{
    open: boolean;
    mode: PortalRouteMode;
    quoteToken: string | null;
    jobId: string | null;
    inviteToken: string | null;
  }>(() => {
    if (typeof window !== 'undefined') {
      const match = window.location.pathname.match(/^\/invite\/([^/]+)/);
      if (match?.[1]) {
        return {
          open: true,
          mode: 'invite_accept',
          quoteToken: null,
          jobId: null,
          inviteToken: decodeURIComponent(match[1]),
        };
      }
    }
    return {
      open: false,
      mode: 'quote_approval',
      quoteToken: null,
      jobId: null,
      inviteToken: null,
    };
  });

  // Cross-tab workflow shortcuts
  const [preselectedLeadForQuote, setPreselectedLeadForQuote] = useState<string | null>(null);
  const [preselectedSchedule, setPreselectedSchedule] = useState<{
    clientId: string;
    assetId: string;
  } | null>(null);

  // If switching into Field Technician Mode while on Admin-only tabs or screens, return safely to Hoje
  useEffect(() => {
    if (isTechnicianMode) {
      if (activeTab === 'leads' || activeTab === 'quotes' || activeTab === 'finance') {
        setActiveTab('today');
      }
      if (secondaryView !== null) {
        setSecondaryView(null);
      }
    }
  }, [activeTab, isTechnicianMode, secondaryView]);

  // Listen for Service Worker notification clicks to navigate directly to the relevant tab
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handleSwMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; tab?: AppTabId } | null;
      if (data?.type === 'NAVIGATE_TAB' && data.tab) {
        setSecondaryView(null);
        if (
          isTechnicianMode &&
          (data.tab === 'leads' || data.tab === 'quotes' || data.tab === 'finance')
        ) {
          setActiveTab('today');
        } else {
          setActiveTab(data.tab);
        }
      }
    };
    navigator.serviceWorker.addEventListener('message', handleSwMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSwMessage);
    };
  }, [isTechnicianMode]);

  // Once-per-day automatic Push Notification check for scheduled visits & pending payments
  useEffect(() => {
    const prefs = loadPushPreferences();
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    if (!prefs.enabled || prefs.lastAutoAlertDate === todayStr) return;

    const dispatchDailyAlerts = async () => {
      if (prefs.dailyVisitsAlert) {
        const visits = buildDailyVisitsAlertContent(db.jobs, db.clients);
        if (visits.count > 0) {
          await dispatchServiceWorkerNotification({
            title: visits.title,
            body: visits.body,
            tag: `zelvo-daily-visits-${todayStr}`,
            tab: 'today',
          });
        }
      }
      if (prefs.pendingPaymentsAlert) {
        const pending = buildPendingPaymentsAlertContent(db.jobs);
        if (pending.count > 0) {
          await dispatchServiceWorkerNotification({
            title: pending.title,
            body: pending.body,
            tag: `zelvo-pending-payments-${todayStr}`,
            tab: 'finance',
          });
        }
      }
      savePushPreferences({ ...prefs, lastAutoAlertDate: todayStr });
    };

    void dispatchDailyAlerts();
  }, [db.clients, db.jobs]);

  const newLeadsCount = useMemo(
    () => db.leads.filter((l) => !l.deleted_at && l.status === 'NEW').length,
    [db.leads]
  );

  // Stock low + Equipment overdue alert counter for Menu & Stock
  const moreAlertsCount = useMemo(() => {
    const todayStart = startOfDay(new Date());
    const lowStock = db.inventory_items.filter(
      (i) => !i.deleted_at && i.quantity <= i.min_stock
    ).length;
    const overdueEquip = db.equipment.filter((e) => {
      if (e.deleted_at) return false;
      const byDate = isBefore(parseISO(e.next_service_date), todayStart);
      const byHours = e.next_service_hours != null && e.hours_used >= e.next_service_hours;
      return e.status !== 'OK' || byDate || byHours;
    }).length;
    return lowStock + overdueEquip;
  }, [db.equipment, db.inventory_items]);

  const pendingInvitesCount = useMemo(() => {
    const now = new Date();
    return db.team_invitations.filter(
      (inv) => inv.status === 'PENDING' && !isBefore(parseISO(inv.expires_at), now)
    ).length;
  }, [db.team_invitations]);

  const visibleTabs = useMemo(
    () =>
      isTechnicianMode
        ? APP_TABS.filter(
            (t) => t.id !== 'leads' && t.id !== 'quotes' && t.id !== 'finance'
          )
        : APP_TABS,
    [isTechnicianMode]
  );

  const todayHeaderLabel = useMemo(() => formatWeekdayHeaderPT(new Date()), []);

  const handleOpenSecondaryView = (view: SecondaryViewId) => {
    if (secondaryView === null) {
      setPreviousTab(activeTab);
    }
    setSecondaryView(view);
  };

  const handleBackFromSecondary = () => {
    setSecondaryView(null);
    if (
      isTechnicianMode &&
      (previousTab === 'leads' || previousTab === 'quotes' || previousTab === 'finance')
    ) {
      setActiveTab('today');
    } else {
      setActiveTab(previousTab);
    }
  };

  const handleSelectBottomTab = (tabId: AppTabId) => {
    setSecondaryView(null);
    setActiveTab(tabId);
  };

  const showNetworkAmber = isOffline || syncQueue.length > 0;
  const userInitial = getUserInitials(currentUser.full_name).charAt(0);
  const showMenuAlertDot = !isTechnicianMode && moreAlertsCount > 0;

  if (onboardingOpen) {
    return (
      <>
        <OnboardingFlow
          onExit={() => {
            setOnboardingOpen(false);
            setSecondaryView(null);
            setActiveTab('today');
          }}
        />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  if (portalState.open) {
    return (
      <>
        <ClientPortalView
          initialMode={portalState.mode}
          initialQuoteToken={portalState.quoteToken}
          initialJobId={portalState.jobId}
          initialInviteToken={portalState.inviteToken}
          onExit={() =>
            setPortalState((prev) => ({
              ...prev,
              open: false,
              quoteToken: null,
              jobId: null,
              inviteToken: null,
            }))
          }
        />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col">
      {/* Minimalist Top Header (#1E293B, 58px, px-4): Brand Left + 2 Discreet Controls Right */}
      <header className="sticky top-0 z-40 bg-[#1E293B] text-white border-b border-slate-700/70 no-print">
        <div className="max-w-5xl mx-auto px-4 h-[58px] flex items-center justify-between gap-4">
          {/* Left: Only the Zelvo Brand Logo */}
          <button
            type="button"
            onClick={() => {
              setSecondaryView(null);
              setActiveTab('today');
            }}
            aria-label="Zelvo — Ir para Hoje"
            className="min-h-12 flex items-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10B981] rounded-lg"
          >
            <ZelvoLogo variant="dark" size="sm" />
          </button>

          {/* Right: Exactly 2 discreet controls (Network/Sync + Menu/Profile) */}
          <div className="flex items-center gap-2 shrink-0">
            {/* 1. Discreet Network / Sync Indicator */}
            <button
              type="button"
              onClick={toggleOffline}
              disabled={isSyncing}
              aria-label={
                isSyncing
                  ? 'A sincronizar alterações locais'
                  : isOffline
                    ? `Modo Offline ativo (${syncQueue.length} pendentes). Toque para sincronizar.`
                    : 'Ligação Online. Toque para simular Modo Offline.'
              }
              title={
                isOffline
                  ? `Modo Offline (${syncQueue.length} pendentes) — toque para voltar a ligar`
                  : 'Online — toque para simular Modo Offline'
              }
              className={`min-h-12 min-w-12 px-2.5 rounded-xl inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60 ${
                showNetworkAmber
                  ? 'bg-[#FEF3C7] text-[#92400E] hover:bg-[#FDE68A]'
                  : 'bg-white/10 text-slate-200 hover:bg-white/15'
              }`}
            >
              {isSyncing ? (
                <RefreshCw className="w-[18px] h-[18px] animate-spin shrink-0" />
              ) : isOffline ? (
                <WifiOff className="w-[18px] h-[18px] shrink-0" />
              ) : (
                <Wifi className="w-[18px] h-[18px] shrink-0" />
              )}
              {showNetworkAmber && syncQueue.length > 0 && (
                <span className="text-[12px] font-bold tabular-nums leading-none">
                  {syncQueue.length}
                </span>
              )}
            </button>

            {/* 2. Menu / Profile Button with User Initial & Discreet Red Alert Dot */}
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Abrir Menu e Ferramentas"
              aria-expanded={menuOpen}
              className="relative min-h-12 px-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-100 inline-flex items-center gap-2 transition-colors cursor-pointer"
            >
              <span
                aria-hidden="true"
                className={`w-7 h-7 rounded-full text-[13px] font-bold flex items-center justify-center shrink-0 ${
                  isTechnicianMode
                    ? 'bg-[#14B8A6] text-white'
                    : 'bg-white/15 text-white border border-white/20'
                }`}
              >
                {userInitial}
              </span>
              <Menu className="w-5 h-5 text-slate-200 shrink-0" />
              {showMenuAlertDot && (
                <span
                  aria-label={`${moreAlertsCount} alertas em Stock e Máquinas`}
                  className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-[#EF4444] ring-2 ring-[#1E293B]"
                />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Passive Amber Offline / Sync Status Banner */}
      <SyncStatusBanner
        isOffline={isOffline}
        isSyncing={isSyncing}
        syncJustCompleted={syncJustCompleted}
        pendingCount={syncQueue.length}
        onSyncNow={() => void syncNow()}
      />

      {/* Field Technician Mode Indicator Banner */}
      {isTechnicianMode && (
        <div className="bg-[#CCFBF1] border-b border-[#99F6E4] px-4 py-2 text-[13px] text-[#0F766E] no-print">
          <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <UserCheck className="w-4 h-4 shrink-0" />
              <span>
                Modo Técnico de Campo: <strong>{currentUser.full_name}</strong> · Valores
                ocultos e agenda filtrada
              </span>
            </span>
            <button
              type="button"
              onClick={() => {
                const admin = db.users.find((u) => u.role === 'ADMIN');
                if (admin) setCurrentUserId(admin.id);
              }}
              className="font-bold underline text-[#0F172A] cursor-pointer"
            >
              Voltar a Admin
            </button>
          </div>
        </div>
      )}

      {/* Main Responsive Content Container */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 pt-4 pb-24">
        {/* Context Sub-header ONLY on the primary 'Hoje' tab */}
        {secondaryView === null && activeTab === 'today' && (
          <div className="flex items-center justify-between gap-3 text-[13px] text-[#475569] mb-3.5 pb-2.5 border-b border-[#E2E8F0]">
            <span className="font-semibold text-[#0F172A] truncate">{organization.name}</span>
            <span className="shrink-0 tabular-nums">{todayHeaderLabel}</span>
          </div>
        )}

        {/* Secondary Screens Opened from Menu Drawer with Clean '< Voltar' Navigation Bar */}
        {secondaryView !== null ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-[#E2E8F0]">
              <button
                type="button"
                onClick={handleBackFromSecondary}
                className="min-h-12 px-3 -ml-1 rounded-xl bg-white border border-[#CBD5E1] hover:bg-slate-50 active:bg-slate-100 text-[#0F172A] text-[15px] font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 shrink-0" />
                <span>Voltar</span>
              </button>
              <div className="min-w-0">
                <h1 className="text-[19px] sm:text-[21px] font-bold text-[#0F172A] leading-tight truncate">
                  {SECONDARY_VIEW_META[secondaryView].title}
                </h1>
                <p className="text-[13px] text-[#475569] truncate">
                  {SECONDARY_VIEW_META[secondaryView].subtitle}
                </p>
              </div>
            </div>

            {secondaryView === 'team' && (
              <TeamView
                onOpenPlanSettings={() => setSecondaryView('settings')}
                onOpenInvitePage={(token) =>
                  setPortalState({
                    open: true,
                    mode: 'invite_accept',
                    quoteToken: null,
                    jobId: null,
                    inviteToken: token,
                  })
                }
              />
            )}
            {secondaryView === 'stock' && <StockEquipmentView />}
            {secondaryView === 'marketing' && <MarketingView />}
            {secondaryView === 'settings' && (
              <SettingsModal
                open={true}
                mode="page"
                onClose={handleBackFromSecondary}
                onOpenOnboarding={() => setOnboardingOpen(true)}
              />
            )}
          </div>
        ) : (
          <>
            {activeTab === 'today' && (
              <TodayTab
                preselectedSchedule={preselectedSchedule}
                onClearPreselectedSchedule={() => setPreselectedSchedule(null)}
              />
            )}

            {activeTab === 'leads' && (
              <LeadsTab
                onCreateQuoteForLead={(leadId) => {
                  setPreselectedLeadForQuote(leadId);
                  setActiveTab('quotes');
                }}
                onScheduleFirstVisit={(clientId, assetId) => {
                  setPreselectedSchedule({ clientId, assetId });
                  setActiveTab('today');
                }}
              />
            )}

            {activeTab === 'clients' && (
              <ClientsTab
                onScheduleVisit={(clientId, assetId) => {
                  setPreselectedSchedule({ clientId, assetId });
                  setActiveTab('today');
                }}
              />
            )}

            {activeTab === 'quotes' && (
              <QuotesTab
                preselectedLeadId={preselectedLeadForQuote}
                onClearPreselectedLead={() => setPreselectedLeadForQuote(null)}
                onOpenQuoteInPortal={(token) =>
                  setPortalState({
                    open: true,
                    mode: 'quote_approval',
                    quoteToken: token,
                    jobId: null,
                    inviteToken: null,
                  })
                }
              />
            )}

            {activeTab === 'finance' && !isTechnicianMode && (
              <FinanceTab
                onOpenPaymentPortal={(jobId) =>
                  setPortalState({
                    open: true,
                    mode: 'service_payment',
                    quoteToken: null,
                    jobId,
                    inviteToken: null,
                  })
                }
              />
            )}
          </>
        )}
      </main>

      {/* Fixed 64px Bottom Navigation Bar (2 Tabs in Technician Mode, 5 Tabs in Admin Mode) */}
      <nav
        aria-label="Navegação principal"
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E2E8F0] pb-safe no-print"
      >
        <div
          className={`max-w-5xl mx-auto grid h-16 ${
            visibleTabs.length === 2
              ? 'grid-cols-2'
              : visibleTabs.length === 4
                ? 'grid-cols-4'
                : 'grid-cols-5'
          }`}
        >
          {visibleTabs.map((tab) => {
            const Icon = TAB_ICONS[tab.id];
            const isActive = secondaryView === null && activeTab === tab.id;
            const showLeadBadge = tab.id === 'leads' && newLeadsCount > 0;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSelectBottomTab(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
                  isActive ? 'text-[#059669]' : 'text-[#475569] hover:text-[#0F172A]'
                }`}
              >
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-[3px] rounded-b-full bg-[#10B981]"
                  />
                )}
                <span className="relative">
                  <Icon className={`w-[22px] h-[22px] ${isActive ? 'stroke-[2.4]' : ''}`} />
                  {showLeadBadge && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#DC2626] text-white text-[11px] font-bold flex items-center justify-center tabular-nums">
                      {newLeadsCount}
                    </span>
                  )}
                </span>
                <span
                  className={`text-[11px] leading-none whitespace-nowrap ${
                    isActive ? 'font-bold' : 'font-medium'
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Organized Slide-Over Menu & Tools Drawer */}
      <MenuDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        organization={organization}
        users={db.users}
        currentUser={currentUser}
        isTechnicianMode={isTechnicianMode}
        onSelectUser={setCurrentUserId}
        moreAlertsCount={moreAlertsCount}
        pendingInvitesCount={pendingInvitesCount}
        isOffline={isOffline}
        isSyncing={isSyncing}
        pendingSyncCount={syncQueue.length}
        onToggleOffline={toggleOffline}
        onOpenSecondaryView={handleOpenSecondaryView}
        onOpenClientPortal={() =>
          setPortalState({
            open: true,
            mode: 'quote_approval',
            quoteToken: null,
            jobId: null,
            inviteToken: null,
          })
        }
        activeSecondaryView={secondaryView}
      />

      {/* Global Toasts */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};

export default function App() {
  return (
    <ZelvoProvider>
      <ZelvoShell />
    </ZelvoProvider>
  );
}
