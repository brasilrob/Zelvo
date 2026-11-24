/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  CalendarDays,
  Euro,
  ExternalLink,
  FileText,
  Inbox,
  RefreshCw,
  Settings,
  Users,
  WifiOff,
} from 'lucide-react';
import { SyncStatusBanner, ToastContainer } from './components/common/UIPrimitives';
import { ZelvoLogo } from './components/common/ZelvoLogo';
import { ClientPortalView } from './components/portal/ClientPortalView';
import { SettingsModal } from './components/settings/SettingsModal';
import { ClientsTab } from './components/tabs/ClientsTab';
import { FinanceTab } from './components/tabs/FinanceTab';
import { LeadsTab } from './components/tabs/LeadsTab';
import { QuotesTab } from './components/tabs/QuotesTab';
import { TodayTab } from './components/tabs/TodayTab';
import { APP_TABS, type AppTabId, formatWeekdayHeaderPT } from './i18n/pt-PT';
import { useZelvo, ZelvoProvider } from './store/ZelvoContext';

const TAB_ICONS: Record<AppTabId, React.ComponentType<{ className?: string }>> = {
  today: CalendarDays,
  leads: Inbox,
  clients: Users,
  quotes: FileText,
  finance: Euro,
};

const ZelvoShell: React.FC = () => {
  const {
    db,
    organization,
    activeVertical,
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [portalState, setPortalState] = useState<{
    open: boolean;
    mode: 'lead_form' | 'quote_approval';
    quoteToken: string | null;
  }>({ open: false, mode: 'quote_approval', quoteToken: null });

  // Cross-tab workflow shortcuts
  const [preselectedLeadForQuote, setPreselectedLeadForQuote] = useState<string | null>(null);
  const [preselectedSchedule, setPreselectedSchedule] = useState<{
    clientId: string;
    assetId: string;
  } | null>(null);

  const newLeadsCount = useMemo(
    () => db.leads.filter((l) => !l.deleted_at && l.status === 'NEW').length,
    [db.leads]
  );

  const todayHeaderLabel = useMemo(() => formatWeekdayHeaderPT(new Date()), []);

  if (portalState.open) {
    return (
      <>
        <ClientPortalView
          initialMode={portalState.mode}
          initialQuoteToken={portalState.quoteToken}
          onExit={() =>
            setPortalState((prev) => ({ ...prev, open: false, quoteToken: null }))
          }
        />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col">
      {/* Global Slate Dark Header (#1E293B) */}
      <header className="sticky top-0 z-40 bg-[#1E293B] text-white border-b border-slate-700/80 no-print">
        <div className="max-w-5xl mx-auto px-3.5 sm:px-4 h-[60px] flex items-center justify-between gap-2">
          {/* Left: Brand + Date */}
          <div className="flex items-center gap-3 min-w-0">
            <ZelvoLogo variant="dark" size="sm" />
            <div className="hidden md:flex items-center gap-2 text-[14px] text-slate-300 border-l border-slate-700 pl-3 whitespace-nowrap">
              <span className="font-medium text-white">{todayHeaderLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="truncate max-w-[200px]">{organization.name}</span>
            </div>
          </div>

          {/* Right: Offline Simulator, Client Portal, Settings */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleOffline}
              disabled={isSyncing}
              title={
                isOffline
                  ? 'Voltar a ficar online e sincronizar fila local'
                  : 'Simular Modo Offline (sem rede móvel)'
              }
              className={`min-h-[40px] px-2.5 sm:px-3 rounded-lg text-[13px] font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isOffline
                  ? 'bg-[#FEF3C7] text-[#92400E] hover:bg-[#FDE68A]'
                  : 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700'
              }`}
            >
              {isSyncing ? (
                <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
              ) : isOffline ? (
                <RefreshCw className="w-4 h-4 shrink-0" />
              ) : (
                <WifiOff className="w-4 h-4 shrink-0 text-slate-300" />
              )}
              <span className="hidden sm:inline">
                {isOffline ? `Sincronizar (${syncQueue.length})` : 'Simular Offline'}
              </span>
              <span className="sm:hidden tabular-nums">
                {isOffline ? `Sync (${syncQueue.length})` : 'Offline'}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                setPortalState({
                  open: true,
                  mode: 'quote_approval',
                  quoteToken: null,
                })
              }
              className="min-h-[40px] px-2.5 sm:px-3 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-[13px] font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ExternalLink className="w-4 h-4 shrink-0" />
              <span>Portal Cliente</span>
            </button>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Definições da empresa"
              className="min-h-[40px] min-w-[40px] rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Non-blocking Offline / Sync Status Banner */}
      <SyncStatusBanner
        isOffline={isOffline}
        isSyncing={isSyncing}
        syncJustCompleted={syncJustCompleted}
        pendingCount={syncQueue.length}
        onSyncNow={() => void syncNow()}
      />

      {/* Main Responsive Content Container */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 pt-4 pb-24">
        {/* Compact workspace context strip on mobile */}
        <div className="flex items-center justify-between gap-2 text-[13px] text-[#475569] mb-3.5 md:hidden">
          <span className="font-semibold text-[#0F172A] truncate">{organization.name}</span>
          <span className="shrink-0">{todayHeaderLabel}</span>
        </div>

        {/* Active Vertical indicator (subtle unboxed typography) */}
        <div className="hidden md:flex items-center justify-between text-[13px] text-[#475569] mb-4">
          <span>
            Vertical ativa: <strong className="text-[#0F172A]">{activeVertical.name}</strong> ·{' '}
            Braga, Portugal
          </span>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="text-[#059669] font-semibold hover:underline cursor-pointer"
          >
            Trocar vertical / marca
          </button>
        </div>

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
              })
            }
          />
        )}

        {activeTab === 'finance' && <FinanceTab />}
      </main>

      {/* Fixed 64px Bottom Navigation Bar (5 Tabs) */}
      <nav
        aria-label="Navegação principal"
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E2E8F0] pb-safe no-print"
      >
        <div className="max-w-5xl mx-auto grid grid-cols-5 h-16">
          {APP_TABS.map((tab) => {
            const Icon = TAB_ICONS[tab.id];
            const isActive = activeTab === tab.id;
            const showLeadBadge = tab.id === 'leads' && newLeadsCount > 0;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
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

      {/* Settings Modal */}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

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
