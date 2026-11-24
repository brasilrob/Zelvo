import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  BellRing,
  CalendarClock,
  Check,
  CreditCard,
  Crown,
  Database,
  Download,
  FileJson,
  Layers,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { formatDateTimePT, SAAS_PLANS } from '../../i18n/pt-PT';
import {
  buildDailyVisitsAlertContent,
  buildPendingPaymentsAlertContent,
  dispatchServiceWorkerNotification,
  getNotificationPermission,
  loadPushPreferences,
  requestPushPermission,
  savePushPreferences,
  type PushNotificationPreferences,
} from '../../services/pushNotifications';
import { useZelvo } from '../../store/ZelvoContext';
import { compressImageFile } from '../../utils/calculations';
import {
  exportDatabaseBackupJSON,
  getLastBackupTimestamp,
} from '../../utils/databaseBackup';
import { Modal, PrimaryButton, StatusBadge } from '../common/UIPrimitives';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  mode?: 'modal' | 'page';
  onOpenOnboarding?: () => void;
}

const BRAND_PRESETS = ['#10B981', '#0284C7', '#0F766E', '#1E293B', '#D97706', '#7C3AED'];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onClose,
  mode = 'modal',
  onOpenOnboarding,
}) => {
  const {
    db,
    organization,
    activeVertical,
    syncQueue,
    updateOrganization,
    switchVertical,
    resetDemoData,
    showToast,
  } = useZelvo();

  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  const [name, setName] = useState(organization.name);
  const [slug, setSlug] = useState(organization.slug);
  const [nif, setNif] = useState(organization.nif ?? '');
  const [phone, setPhone] = useState(organization.phone ?? '');
  const [email, setEmail] = useState(organization.email ?? '');
  const [primaryColor, setPrimaryColor] = useState(organization.primary_color);
  const [logoUrl, setLogoUrl] = useState<string | null>(organization.logo_url);
  const [selectedVerticalId, setSelectedVerticalId] = useState(organization.vertical_id);
  const [loadVerticalServices, setLoadVerticalServices] = useState(true);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const [pushPrefs, setPushPrefs] = useState<PushNotificationPreferences>(() =>
    loadPushPreferences()
  );
  const [pushPermission, setPushPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => getNotificationPermission());
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(() =>
    getLastBackupTimestamp()
  );

  useEffect(() => {
    if (!open) return;
    setName(organization.name);
    setSlug(organization.slug);
    setNif(organization.nif ?? '');
    setPhone(organization.phone ?? '');
    setEmail(organization.email ?? '');
    setPrimaryColor(organization.primary_color);
    setLogoUrl(organization.logo_url);
    setSelectedVerticalId(organization.vertical_id);
    setPushPrefs(loadPushPreferences());
    setPushPermission(getNotificationPermission());
    setLastBackupAt(getLastBackupTimestamp());
  }, [open, organization]);

  const handleDownloadJsonBackup = () => {
    const result = exportDatabaseBackupJSON({
      db,
      organization,
      syncQueue,
    });
    setLastBackupAt(result.exportedAt);
    showToast(
      `Backup JSON descarregado (${result.totalRecords} registos · ${result.sizeKb} KB).`,
      'success'
    );
  };

  const handleTogglePushEnabled = async () => {
    if (!pushPrefs.enabled) {
      const perm = await requestPushPermission();
      setPushPermission(perm);
      const next: PushNotificationPreferences = { ...pushPrefs, enabled: true };
      setPushPrefs(next);
      savePushPreferences(next);
      if (perm === 'granted') {
        showToast(
          'Notificações Push ativadas no Service Worker para visitas e pagamentos.',
          'success'
        );
      } else if (perm === 'denied') {
        showToast(
          'Alertas ativados em modo interno (notificações nativas bloqueadas pelo browser).',
          'warning'
        );
      } else {
        showToast('Preferência de alertas Push guardada com sucesso.', 'info');
      }
    } else {
      const next: PushNotificationPreferences = { ...pushPrefs, enabled: false };
      setPushPrefs(next);
      savePushPreferences(next);
      showToast('Notificações Push desativadas.', 'info');
    }
  };

  const handleUpdatePushPref = (
    key: 'dailyVisitsAlert' | 'pendingPaymentsAlert',
    value: boolean
  ) => {
    const next: PushNotificationPreferences = { ...pushPrefs, [key]: value };
    setPushPrefs(next);
    savePushPreferences(next);
  };

  const handleSendDailyVisitsAlert = async () => {
    const content = buildDailyVisitsAlertContent(db.jobs, db.clients);
    const res = await dispatchServiceWorkerNotification({
      title: content.title,
      body: content.body,
      tag: 'zelvo-daily-visits-test',
      tab: 'today',
    });
    showToast(
      res.deliveredVia === 'in_app_fallback'
        ? `${res.title}: ${res.body}`
        : `Notificação Push enviada via Service Worker (${res.title}).`,
      'info'
    );
  };

  const handleSendPendingPaymentsAlert = async () => {
    const content = buildPendingPaymentsAlertContent(db.jobs);
    const res = await dispatchServiceWorkerNotification({
      title: content.title,
      body: content.body,
      tag: 'zelvo-pending-payments-test',
      tab: 'finance',
    });
    showToast(
      res.deliveredVia === 'in_app_fallback'
        ? `${res.title}: ${res.body}`
        : `Lembrete Push enviado via Service Worker (${res.title}).`,
      content.count > 0 ? 'warning' : 'success'
    );
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const compressed = await compressImageFile(file, 480, 250 * 1024);
      setLogoUrl(compressed.dataUrl);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Não foi possível carregar o logótipo.',
        'danger'
      );
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSlug =
      slug
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-|-$/g, '') || 'minha-empresa';

    updateOrganization({
      name: name.trim() || organization.name,
      slug: cleanSlug,
      nif: nif.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      primary_color: primaryColor,
      logo_url: logoUrl,
    });

    if (selectedVerticalId !== organization.vertical_id) {
      switchVertical(selectedVerticalId, loadVerticalServices);
    }
    onClose();
  };

  if (!open) return null;

  const formContent = (
    <form onSubmit={handleSave} className="space-y-5">
        {/* Multi-Niche Vertical Switcher */}
        <section className="space-y-2.5 p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#059669]" />
            <div>
              <h3 className="text-[15px] font-bold text-[#0F172A]">
                Vertical de Negócio (Multi-Nicho)
              </h3>
              <p className="text-[13px] text-[#475569]">
                Altera automaticamente os campos dinâmicos dos ativos de serviço e listas de verificação padrão.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            {db.vertical_templates.map((vt) => {
              const active = selectedVerticalId === vt.id;
              return (
                <button
                  key={vt.id}
                  type="button"
                  onClick={() => setSelectedVerticalId(vt.id)}
                  className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#DCFCE7] border-[#10B981] text-[#0F172A]'
                      : 'bg-white border-[#CBD5E1] text-[#0F172A] hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[15px]">{vt.name}</span>
                    {active && <Check className="w-4 h-4 text-[#15803D]" />}
                  </div>
                  <p className="text-[12px] text-[#475569] mt-1">
                    Atributos:{' '}
                    {vt.asset_schema.map((f) => f.label).slice(0, 3).join(', ')}
                  </p>
                </button>
              );
            })}
          </div>

          {selectedVerticalId !== activeVertical.id && (
            <label className="flex items-center gap-2.5 pt-1 text-[14px] text-[#0F172A] cursor-pointer">
              <input
                type="checkbox"
                checked={loadVerticalServices}
                onChange={(e) => setLoadVerticalServices(e.target.checked)}
                className="w-4 h-4 accent-[#10B981]"
              />
              <span>Adicionar também os serviços padrão desta vertical ao Catálogo</span>
            </label>
          )}
        </section>

        {/* Company Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
              Nome Comercial *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px]"
            />
          </div>
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
              Slug do Portal Público (/p/[slug])
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[15px] font-mono"
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
              className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px] tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
              Telefone / WhatsApp
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px] tabular-nums"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1">
              Email Comercial
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px]"
            />
          </div>
        </div>

        {/* Brand Color & Logo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-2">
              Cor Primária (PDFs e Portal Cliente)
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {BRAND_PRESETS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setPrimaryColor(hex)}
                  aria-label={`Selecionar cor ${hex}`}
                  className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center cursor-pointer ${
                    primaryColor.toLowerCase() === hex.toLowerCase()
                      ? 'border-[#0F172A] scale-105'
                      : 'border-transparent'
                  }`}
                  style={{ backgroundColor: hex }}
                >
                  {primaryColor.toLowerCase() === hex.toLowerCase() && (
                    <Check className="w-4 h-4 text-white" />
                  )}
                </button>
              ))}
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                aria-label="Escolher cor personalizada"
                className="w-10 h-10 rounded-xl border border-[#CBD5E1] cursor-pointer p-0.5 bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-2">
              Logótipo da Empresa (PNG/JPG)
            </label>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void handleLogoUpload(e)}
            />
            {logoUrl ? (
              <div className="flex items-center gap-3 p-2.5 rounded-xl border border-[#CBD5E1] bg-white">
                <img
                  src={logoUrl}
                  alt="Logótipo da empresa"
                  className="h-11 max-w-[120px] object-contain"
                />
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => setLogoUrl(null)}
                  className="min-h-[40px] px-2.5 rounded-lg text-[#B91C1C] hover:bg-red-50 flex items-center gap-1 text-[13px] font-semibold cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Remover</span>
                </button>
              </div>
            ) : (
              <PrimaryButton
                type="button"
                variant="secondary"
                fullWidth
                onClick={() => logoInputRef.current?.click()}
                icon={<Upload className="w-4 h-4" />}
              >
                Carregar Logótipo
              </PrimaryButton>
            )}
          </div>
        </div>

        {/* Service Worker Push Notifications */}
        <section className="space-y-3 p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-start gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-[#DCFCE7] text-[#15803D] flex items-center justify-center shrink-0">
                {pushPrefs.enabled ? (
                  <BellRing className="w-5 h-5" />
                ) : (
                  <Bell className="w-5 h-5" />
                )}
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-[#0F172A]">
                  Notificações Push (Service Worker)
                </h3>
                <p className="text-[13px] text-[#475569]">
                  Alertas automáticos de novas visitas do dia e lembretes de pagamentos pendentes.
                </p>
              </div>
            </div>
            <StatusBadge
              tone={
                pushPermission === 'granted' && pushPrefs.enabled
                  ? 'success'
                  : pushPermission === 'denied'
                  ? 'warning'
                  : pushPermission === 'unsupported'
                  ? 'neutral'
                  : pushPrefs.enabled
                  ? 'info'
                  : 'neutral'
              }
              label={
                pushPermission === 'granted' && pushPrefs.enabled
                  ? 'Push Ativas'
                  : pushPermission === 'denied'
                  ? 'Bloqueadas no Browser'
                  : pushPermission === 'unsupported'
                  ? 'Modo Interno'
                  : pushPrefs.enabled
                  ? 'Ativas'
                  : 'Por Ativar'
              }
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <span className="text-[14px] font-semibold text-[#0F172A]">
              Receber alertas Push no dispositivo
            </span>
            <button
              type="button"
              onClick={() => void handleTogglePushEnabled()}
              className={`min-h-[44px] px-4 rounded-xl text-[14px] font-bold transition-colors cursor-pointer ${
                pushPrefs.enabled
                  ? 'bg-[#10B981] hover:bg-[#059669] text-white'
                  : 'bg-white border border-[#CBD5E1] text-[#0F172A] hover:bg-slate-50'
              }`}
            >
              {pushPrefs.enabled ? 'Notificações Ativas' : 'Ativar Notificações Push'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <label className="flex items-center gap-2.5 p-2.5 rounded-lg bg-white border border-[#E2E8F0] cursor-pointer">
              <input
                type="checkbox"
                checked={pushPrefs.dailyVisitsAlert}
                onChange={(e) => handleUpdatePushPref('dailyVisitsAlert', e.target.checked)}
                className="w-4 h-4 accent-[#10B981] shrink-0"
              />
              <span className="text-[13px] font-medium text-[#0F172A]">
                Alertas de visitas agendadas para hoje
              </span>
            </label>
            <label className="flex items-center gap-2.5 p-2.5 rounded-lg bg-white border border-[#E2E8F0] cursor-pointer">
              <input
                type="checkbox"
                checked={pushPrefs.pendingPaymentsAlert}
                onChange={(e) =>
                  handleUpdatePushPref('pendingPaymentsAlert', e.target.checked)
                }
                className="w-4 h-4 accent-[#10B981] shrink-0"
              />
              <span className="text-[13px] font-medium text-[#0F172A]">
                Lembretes de pagamentos pendentes
              </span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => void handleSendDailyVisitsAlert()}
              className="min-h-[44px] px-3 rounded-lg bg-white border border-[#CBD5E1] hover:bg-slate-50 text-[13px] font-semibold text-[#0F172A] inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <CalendarClock className="w-4 h-4 text-[#059669] shrink-0" />
              <span>Enviar Alerta de Visitas (Hoje)</span>
            </button>
            <button
              type="button"
              onClick={() => void handleSendPendingPaymentsAlert()}
              className="min-h-[44px] px-3 rounded-lg bg-white border border-[#CBD5E1] hover:bg-slate-50 text-[13px] font-semibold text-[#0F172A] inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <CreditCard className="w-4 h-4 text-[#B45309] shrink-0" />
              <span>Enviar Lembrete de Pagamentos</span>
            </button>
          </div>
        </section>

        {/* Phase 3: SaaS Subscription Management ("O Meu Plano") */}
        <section className="space-y-3 p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-start gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-[#FEF3C7] text-[#B45309] flex items-center justify-center shrink-0">
                <Crown className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-[#0F172A]">
                  O Meu Plano (Subscrição Zelvo SaaS)
                </h3>
                <p className="text-[13px] text-[#475569]">
                  Gerir limites da equipa, clientes ativos e funcionalidades avançadas.
                </p>
              </div>
            </div>
            <StatusBadge
              tone="teal"
              label={
                SAAS_PLANS.find((p) => p.id === organization.plan)?.name ?? organization.plan
              }
            />
          </div>

          {/* Live usage meters */}
          {(() => {
            const currentPlanMeta =
              SAAS_PLANS.find((p) => p.id === organization.plan) ?? SAAS_PLANS[0];
            const activeUsersCount = db.users.filter((u) => u.is_active).length;
            const activeClientsCount = db.clients.filter((c) => !c.deleted_at).length;
            const usersPct = Math.min(100, Math.round((activeUsersCount / currentPlanMeta.maxUsers) * 100));
            const clientsPct = Math.min(100, Math.round((activeClientsCount / currentPlanMeta.maxClients) * 100));

            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px] tabular-nums">
                <div className="bg-white border border-[#E2E8F0] rounded-lg p-3 space-y-1.5">
                  <div className="flex justify-between font-semibold text-[#0F172A]">
                    <span>Utilizadores / Equipa</span>
                    <span>
                      {activeUsersCount} / {currentPlanMeta.maxUsers}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        activeUsersCount > currentPlanMeta.maxUsers
                          ? 'bg-[#DC2626]'
                          : 'bg-[#10B981]'
                      }`}
                      style={{ width: `${usersPct}%` }}
                    />
                  </div>
                </div>
                <div className="bg-white border border-[#E2E8F0] rounded-lg p-3 space-y-1.5">
                  <div className="flex justify-between font-semibold text-[#0F172A]">
                    <span>Clientes Ativos</span>
                    <span>
                      {activeClientsCount} / {currentPlanMeta.maxClients}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#14B8A6]"
                      style={{ width: `${clientsPct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            {SAAS_PLANS.map((plan) => {
              const isCurrent = organization.plan === plan.id;
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => updateOrganization({ plan: plan.id })}
                  className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                    isCurrent
                      ? 'bg-[#DCFCE7] border-[#10B981] text-[#0F172A]'
                      : 'bg-white border-[#CBD5E1] text-[#0F172A] hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-bold text-[14px]">{plan.name}</span>
                    {isCurrent && <Check className="w-4 h-4 text-[#15803D]" />}
                  </div>
                  <p className="text-[16px] font-extrabold text-[#059669] tabular-nums mt-0.5">
                    {plan.priceLabel}
                  </p>
                  <p className="text-[11px] text-[#475569] mt-1 leading-snug">
                    {plan.description}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Manual Local Database JSON Backup */}
        <section className="space-y-3 p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-start gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-[#E0F2FE] text-[#0369A1] flex items-center justify-center shrink-0">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-[#0F172A]">
                  Backup Manual da Base de Dados (JSON)
                </h3>
                <p className="text-[13px] text-[#475569]">
                  Exporte todas as 13 entidades locais (clientes, visitas, orçamentos, stock,
                  máquinas, fotos e finanças) num ficheiro JSON portátil.
                </p>
              </div>
            </div>
            <StatusBadge
              tone={lastBackupAt ? 'success' : 'neutral'}
              label={lastBackupAt ? 'Backup Efetuado' : 'Sem Backup'}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px] tabular-nums">
            <div className="bg-white border border-[#E2E8F0] rounded-lg px-2.5 py-2">
              <span className="text-[#475569] block">Clientes</span>
              <strong className="text-[15px] text-[#0F172A]">
                {db.clients.filter((c) => !c.deleted_at).length}
              </strong>
            </div>
            <div className="bg-white border border-[#E2E8F0] rounded-lg px-2.5 py-2">
              <span className="text-[#475569] block">Visitas</span>
              <strong className="text-[15px] text-[#0F172A]">
                {db.jobs.filter((j) => !j.deleted_at).length}
              </strong>
            </div>
            <div className="bg-white border border-[#E2E8F0] rounded-lg px-2.5 py-2">
              <span className="text-[#475569] block">Orçamentos</span>
              <strong className="text-[15px] text-[#0F172A]">
                {db.quotes.filter((q) => !q.deleted_at).length}
              </strong>
            </div>
            <div className="bg-white border border-[#E2E8F0] rounded-lg px-2.5 py-2">
              <span className="text-[#475569] block">Transações</span>
              <strong className="text-[15px] text-[#0F172A]">
                {db.transactions.filter((t) => !t.deleted_at).length}
              </strong>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-[12px] text-[#475569] tabular-nums">
              {lastBackupAt
                ? `Último backup manual: ${formatDateTimePT(lastBackupAt)}`
                : 'Recomendado guardar uma cópia regular num local seguro.'}
            </p>
            <button
              type="button"
              onClick={handleDownloadJsonBackup}
              className="w-full sm:w-auto min-h-12 px-4 rounded-xl bg-[#1E293B] hover:bg-slate-800 text-white text-[14px] font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <FileJson className="w-4 h-4 text-[#10B981] shrink-0" />
              <span>Descarregar Backup JSON</span>
            </button>
          </div>
        </section>

        {/* PWA Install & Demo Reset */}
        <div className="pt-3 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2.5">
          {!isInstalled && (isInstallable || isIOS) ? (
            <button
              type="button"
              onClick={() => {
                if (isInstallable) {
                  void install();
                } else {
                  setShowIOSGuide((v) => !v);
                }
              }}
              className="inline-flex items-center gap-2 min-h-[44px] px-3.5 rounded-lg border border-[#10B981] bg-[#DCFCE7] text-[#15803D] text-[14px] font-semibold cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Instalar App (PWA)</span>
            </button>
          ) : (
            <span className="text-[13px] text-[#475569]">
              {isInstalled ? 'App instalada no dispositivo (PWA)' : 'Pronto para funcionamento offline'}
            </span>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {onOpenOnboarding && (
              <button
                type="button"
                onClick={onOpenOnboarding}
                className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-lg border border-[#CBD5E1] bg-white text-[14px] font-semibold text-[#0F766E] hover:bg-[#F0FDFA] cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Testar Onboarding / 1.º Acesso</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                resetDemoData();
                onClose();
              }}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-lg border border-[#CBD5E1] text-[14px] font-semibold text-[#475569] hover:text-[#0F172A] hover:bg-slate-50 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Repor Dados Demo Completos</span>
            </button>
          </div>
        </div>

        {showIOSGuide && (
          <div className="p-3.5 rounded-xl bg-[#E0F2FE] text-[#0369A1] text-[14px]">
            No Safari (iPhone/iPad): toque no botão <strong>Partilhar</strong> e selecione{' '}
            <strong>Adicionar ao ecrã principal</strong>.
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <PrimaryButton type="button" variant="secondary" fullWidth onClick={onClose}>
            {mode === 'page' ? 'Voltar' : 'Cancelar'}
          </PrimaryButton>
          <PrimaryButton type="submit" fullWidth>
            Guardar Definições
          </PrimaryButton>
        </div>
      </form>
  );

  if (mode === 'page') {
    return (
      <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-6">
        {formContent}
      </div>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Definições da Empresa & Plano"
      subtitle="Identidade visual da empresa para PDFs e Portal do Cliente"
      size="lg"
    >
      {formContent}
    </Modal>
  );
};
