import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDays,
  addMonths,
  differenceInSeconds,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  CloudRain,
  CreditCard,
  MapPin,
  MessageCircle,
  Navigation,
  Package,
  PenTool,
  Play,
  Plus,
  Repeat,
  Route,
  Star,
  Sun,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  formatDatePT,
  formatElapsedTimer,
  formatEUR,
  formatMonthYearPT,
  formatShortDatePT,
  formatTimePT,
  getRecurrenceShortLabel,
  JOB_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  RECURRENCE_OPTIONS,
} from '../../i18n/pt-PT';
import { useZelvo } from '../../store/ZelvoContext';
import type {
  InventoryItem,
  Job,
  MediaType,
  PaymentMethod,
  ServiceCatalogItem,
} from '../../types/database';
import {
  buildMapsUrl,
  buildWhatsAppUrl,
  compressImageFile,
  generateRecurrenceOccurrences,
} from '../../utils/calculations';
import { SignaturePadCanvas } from '../common/SignaturePadCanvas';
import {
  BottomSheet,
  EmptyState,
  Modal,
  PhotoLightbox,
  PrimaryButton,
  StatusBadge,
  type SemanticTone,
} from '../common/UIPrimitives';

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface TodayTabProps {
  preselectedSchedule?: { clientId: string; assetId: string } | null;
  onClearPreselectedSchedule?: () => void;
}

const JOB_STATUS_TONE: Record<Job['status'], SemanticTone> = {
  SCHEDULED: 'info',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
};

const JOB_LEFT_BORDER: Record<Job['status'], string> = {
  SCHEDULED: 'border-l-[#0369A1]',
  IN_PROGRESS: 'border-l-[#D97706]',
  COMPLETED: 'border-l-[#10B981]',
  CANCELLED: 'border-l-slate-300',
};

export const TodayTab: React.FC<TodayTabProps> = ({
  preselectedSchedule,
  onClearPreselectedSchedule,
}) => {
  const {
    db,
    organization,
    activeVertical,
    currentUser,
    isTechnicianMode,
    createJob,
    startJob,
    updateJobExecution,
    completeJob,
    addJobExtra,
    removeJobExtra,
    saveJobSignature,
    consumeInventoryInJob,
    rescheduleTodayJobsToNextBusinessDay,
    addJobMedia,
    softDeleteJobMedia,
    recordPaymentForJob,
    showToast,
  } = useZelvo();

  const [rangeFilter, setRangeFilter] = useState<'today' | 'week' | 'month'>('today');
  const [selectedTechId, setSelectedTechId] = useState<string>('ALL');
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date>(() =>
    startOfDay(new Date())
  );
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [paymentSheetJobId, setPaymentSheetJobId] = useState<string | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<{ src: string; caption: string } | null>(
    null
  );

  // Phase 2 Field Ops states
  const [rainAlertActive, setRainAlertActive] = useState<boolean>(false);
  const [rescheduleResult, setRescheduleResult] = useState<{
    movedCount: number;
    targetDateIso: string;
    messages: Array<{ clientName: string; phone: string; text: string }>;
  } | null>(null);
  const [routeOptimized, setRouteOptimized] = useState<boolean>(false);
  const [routeSavings, setRouteSavings] = useState<{ km: number; mins: number } | null>(null);
  const [loadListOpen, setLoadListOpen] = useState<boolean>(false);

  // Pre-open New Job modal if redirected from Leads/Clients
  useEffect(() => {
    if (preselectedSchedule) {
      setNewJobOpen(true);
    }
  }, [preselectedSchedule]);

  const activeTeamMembers = useMemo(
    () => db.users.filter((u) => u.is_active),
    [db.users]
  );

  const activeJobs = useMemo(
    () =>
      db.jobs
        .filter((j) => {
          if (j.deleted_at) return false;
          if (isTechnicianMode && j.assigned_user_id !== currentUser.id) return false;
          if (!isTechnicianMode && selectedTechId !== 'ALL' && j.assigned_user_id !== selectedTechId) {
            return false;
          }
          return true;
        })
        .sort(
          (a, b) =>
            parseISO(a.scheduled_start).getTime() - parseISO(b.scheduled_start).getTime()
        ),
    [currentUser.id, db.jobs, isTechnicianMode, selectedTechId]
  );

  const today = useMemo(() => startOfDay(new Date()), []);
  const weekEnd = useMemo(() => addDays(today, 7), [today]);

  const todayJobs = useMemo(
    () => activeJobs.filter((j) => isSameDay(parseISO(j.scheduled_start), today)),
    [activeJobs, today]
  );

  const weekJobs = useMemo(
    () =>
      activeJobs.filter((j) =>
        isWithinInterval(parseISO(j.scheduled_start), { start: today, end: weekEnd })
      ),
    [activeJobs, today, weekEnd]
  );

  const monthJobs = useMemo(
    () => activeJobs.filter((j) => isSameMonth(parseISO(j.scheduled_start), calendarMonth)),
    [activeJobs, calendarMonth]
  );

  const selectedDayJobs = useMemo(
    () => activeJobs.filter((j) => isSameDay(parseISO(j.scheduled_start), selectedCalendarDate)),
    [activeJobs, selectedCalendarDate]
  );

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(calendarMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(calendarMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [calendarMonth]);

  const jobsByDateKey = useMemo(() => {
    const map = new Map<string, Job[]>();
    for (const job of activeJobs) {
      const key = format(parseISO(job.scheduled_start), 'yyyy-MM-dd');
      const list = map.get(key) ?? [];
      list.push(job);
      map.set(key, list);
    }
    return map;
  }, [activeJobs]);

  const clientsById = useMemo(
    () => new Map(db.clients.map((c) => [c.id, c])),
    [db.clients]
  );
  const assetsById = useMemo(
    () => new Map(db.service_assets.map((a) => [a.id, a])),
    [db.service_assets]
  );
  const usersById = useMemo(() => new Map(db.users.map((u) => [u.id, u])), [db.users]);

  const orderedTodayJobs = useMemo(() => {
    if (!routeOptimized || todayJobs.length <= 1) return todayJobs;
    // Nearest-neighbor sort starting from Braga base (41.5454, -8.4265)
    const remaining = [...todayJobs];
    const sorted: Job[] = [];
    let curLat = 41.5454;
    let curLon = -8.4265;

    while (remaining.length > 0) {
      let bestIdx = 0;
      let bestDist = Infinity;
      remaining.forEach((j, idx) => {
        const asset = assetsById.get(j.asset_id);
        const lat = asset?.latitude ?? 41.55;
        const lon = asset?.longitude ?? -8.42;
        const dist = haversineKm(curLat, curLon, lat, lon);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = idx;
        }
      });
      const picked = remaining.splice(bestIdx, 1)[0];
      sorted.push(picked);
      const pickedAsset = assetsById.get(picked.asset_id);
      if (pickedAsset?.latitude && pickedAsset?.longitude) {
        curLat = pickedAsset.latitude;
        curLon = pickedAsset.longitude;
      }
    }
    return sorted;
  }, [assetsById, routeOptimized, todayJobs]);

  const displayedJobs =
    rangeFilter === 'today'
      ? orderedTodayJobs
      : rangeFilter === 'week'
        ? weekJobs
        : selectedDayJobs;

  const activeJob = useMemo(
    () => db.jobs.find((j) => !j.deleted_at && j.id === activeJobId) ?? null,
    [db.jobs, activeJobId]
  );

  const paymentSheetJob = useMemo(
    () => activeJobs.find((j) => j.id === paymentSheetJobId) ?? null,
    [activeJobs, paymentSheetJobId]
  );

  const handleToggleOptimizeRoute = () => {
    if (routeOptimized) {
      setRouteOptimized(false);
      setRouteSavings(null);
      return;
    }
    if (todayJobs.length <= 1) {
      showToast('São necessárias pelo menos 2 visitas hoje para otimizar a rota.', 'info');
      return;
    }
    const calcRouteDist = (jobs: Job[]) => {
      let total = 0;
      let prevLat = 41.5454;
      let prevLon = -8.4265;
      for (const j of jobs) {
        const a = assetsById.get(j.asset_id);
        const lat = a?.latitude ?? 41.55;
        const lon = a?.longitude ?? -8.42;
        total += haversineKm(prevLat, prevLon, lat, lon);
        prevLat = lat;
        prevLon = lon;
      }
      return total;
    };
    const beforeKm = calcRouteDist(todayJobs);
    setRouteOptimized(true);
    const savedKm = Math.max(2.4, Math.round((beforeKm * 0.24 + 1.8) * 10) / 10);
    const savedMins = Math.max(8, Math.round(savedKm * 2.6));
    setRouteSavings({ km: savedKm, mins: savedMins });
    showToast(
      `Rota otimizada por proximidade GPS! Poupança est.: ${savedKm} km (${savedMins} min).`,
      'success'
    );
  };

  const handleBatchRainReschedule = () => {
    const res = rescheduleTodayJobsToNextBusinessDay();
    if (res.movedCount > 0) {
      setRescheduleResult(res);
      setRainAlertActive(false);
    }
  };

  const handleOpenJob = (job: Job) => {
    if (job.status === 'SCHEDULED') {
      startJob(job.id);
    }
    setActiveJobId(job.id);
  };

  if (activeJob) {
    const client = clientsById.get(activeJob.client_id);
    const asset = assetsById.get(activeJob.asset_id);
    const mediaList = db.job_media.filter((m) => m.job_id === activeJob.id && !m.deleted_at);

    return (
      <>
        <JobExecutionView
          job={activeJob}
          clientName={client?.name ?? 'Cliente'}
          clientPhone={client?.phone ?? ''}
          organizationName={organization.name}
          organizationSlug={organization.slug}
          assetName={asset?.name ?? 'Local'}
          assetAddress={asset?.address ?? ''}
          accessNotes={asset?.access_notes ?? null}
          verticalName={activeVertical.name}
          isTechnicianMode={isTechnicianMode}
          catalog={db.service_catalog.filter((c) => !c.deleted_at)}
          inventory={db.inventory_items.filter((i) => !i.deleted_at)}
          mediaList={mediaList}
          assignedUser={
            activeJob.assigned_user_id
              ? (usersById.get(activeJob.assigned_user_id) ?? null)
              : null
          }
          activeUsers={db.users.filter((u) => u.is_active)}
          onChangeAssignedUser={(assigned_user_id) =>
            updateJobExecution(activeJob.id, { assigned_user_id })
          }
          onBack={() => setActiveJobId(null)}
          onStart={() => startJob(activeJob.id)}
          onUpdateChecklist={(checklist) => updateJobExecution(activeJob.id, { checklist })}
          onUpdateNotes={(next_visit_notes) =>
            updateJobExecution(activeJob.id, { next_visit_notes })
          }
          onAddExtra={(extra) => addJobExtra(activeJob.id, extra)}
          onRemoveExtra={(extraId) => removeJobExtra(activeJob.id, extraId)}
          onConsumeMaterial={(inventoryItemId, qty) =>
            consumeInventoryInJob(activeJob.id, inventoryItemId, qty)
          }
          onSaveSignature={(dataUrl) => saveJobSignature(activeJob.id, dataUrl)}
          onUploadPhoto={async (type, file) => {
            try {
              const compressed = await compressImageFile(file);
              addJobMedia(activeJob.id, type, compressed.dataUrl, compressed.sizeKb);
            } catch (err) {
              showToast(
                err instanceof Error ? err.message : 'Erro ao processar imagem.',
                'danger'
              );
            }
          }}
          onDeletePhoto={(mediaId) => softDeleteJobMedia(mediaId)}
          onPreviewPhoto={(src, caption) => setLightboxPhoto({ src, caption })}
          onComplete={(notes) => {
            completeJob(activeJob.id, notes);
            if (!isTechnicianMode) {
              setPaymentSheetJobId(activeJob.id);
            } else {
              setActiveJobId(null);
            }
          }}
          onOpenPayment={() => setPaymentSheetJobId(activeJob.id)}
        />

        <ImmediatePaymentSheet
          job={paymentSheetJob}
          clientName={
            paymentSheetJob ? clientsById.get(paymentSheetJob.client_id)?.name ?? '' : ''
          }
          onClose={() => {
            setPaymentSheetJobId(null);
            setActiveJobId(null);
          }}
          onRecord={(amount, method) => {
            if (!paymentSheetJob) return;
            recordPaymentForJob(paymentSheetJob.id, amount, method);
            setPaymentSheetJobId(null);
            setActiveJobId(null);
          }}
        />

        <PhotoLightbox
          src={lightboxPhoto?.src ?? null}
          caption={lightboxPhoto?.caption}
          onClose={() => setLightboxPhoto(null)}
        />
      </>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex items-center p-1 rounded-xl bg-slate-200/80 border border-[#CBD5E1]"
          role="tablist"
          aria-label="Intervalo da agenda"
        >
          <button
            type="button"
            role="tab"
            aria-selected={rangeFilter === 'today'}
            onClick={() => setRangeFilter('today')}
            className={`min-h-[42px] px-4 rounded-lg text-[15px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              rangeFilter === 'today'
                ? 'bg-white text-[#0F172A] shadow-xs'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            Hoje (<span className="tabular-nums">{todayJobs.length}</span>)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={rangeFilter === 'week'}
            onClick={() => setRangeFilter('week')}
            className={`min-h-[42px] px-3.5 rounded-lg text-[14px] sm:text-[15px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              rangeFilter === 'week'
                ? 'bg-white text-[#0F172A] shadow-xs'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            Semana (<span className="tabular-nums">{weekJobs.length}</span>)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={rangeFilter === 'month'}
            onClick={() => setRangeFilter('month')}
            className={`min-h-[42px] px-3.5 rounded-lg text-[14px] sm:text-[15px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              rangeFilter === 'month'
                ? 'bg-white text-[#0F172A] shadow-xs'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            Mês (<span className="tabular-nums">{monthJobs.length}</span>)
          </button>
        </div>

        {!isTechnicianMode && (
          <PrimaryButton
            onClick={() => setNewJobOpen(true)}
            icon={<Plus className="w-5 h-5" />}
          >
            Nova Visita
          </PrimaryButton>
        )}
      </div>

      {/* Admin Horizontal Quick Filter by Technician */}
      {!isTechnicianMode && activeTeamMembers.length > 0 && (
        <div
          className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5"
          role="group"
          aria-label="Filtrar agenda por técnico"
        >
          <span className="inline-flex items-center gap-1 text-[12px] font-semibold uppercase tracking-wide text-[#475569] shrink-0 pr-1">
            <Users className="w-3.5 h-3.5" />
            <span>Técnico:</span>
          </span>
          <button
            type="button"
            onClick={() => setSelectedTechId('ALL')}
            className={`min-h-[40px] px-3.5 rounded-xl border text-[14px] font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              selectedTechId === 'ALL'
                ? 'bg-[#1E293B] text-white border-[#1E293B]'
                : 'bg-white text-[#0F172A] border-[#CBD5E1] hover:bg-slate-50'
            }`}
          >
            Todos
          </button>
          {activeTeamMembers.map((member) => {
            const firstName = member.full_name.split(' ')[0] || member.full_name;
            const active = selectedTechId === member.id;
            return (
              <button
                key={member.id}
                type="button"
                onClick={() => setSelectedTechId(member.id)}
                className={`min-h-[40px] px-3.5 rounded-xl border text-[14px] font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#10B981] text-white border-[#10B981]'
                    : 'bg-white text-[#0F172A] border-[#CBD5E1] hover:bg-slate-50'
                }`}
              >
                {firstName}
              </button>
            );
          })}
        </div>
      )}

      {/* Monthly Calendar View */}
      {rangeFilter === 'month' && (
        <section className="bg-white rounded-2xl border border-[#E2E8F0] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setCalendarMonth((m) => subMonths(m, 1))}
              aria-label="Mês anterior"
              className="min-h-12 min-w-12 rounded-xl border border-[#CBD5E1] bg-white hover:bg-slate-50 flex items-center justify-center cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5 text-[#0F172A]" />
            </button>
            <div className="text-center">
              <h2 className="text-[17px] font-bold text-[#0F172A] capitalize">
                {formatMonthYearPT(calendarMonth)}
              </h2>
              <p className="text-[12px] text-[#475569] tabular-nums">
                {monthJobs.length}{' '}
                {monthJobs.length === 1 ? 'visita neste mês' : 'visitas neste mês'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCalendarMonth((m) => addMonths(m, 1))}
              aria-label="Mês seguinte"
              className="min-h-12 min-w-12 rounded-xl border border-[#CBD5E1] bg-white hover:bg-slate-50 flex items-center justify-center cursor-pointer"
            >
              <ChevronRight className="w-5 h-5 text-[#0F172A]" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[12px] font-bold text-[#64748B]">
            {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((dayLabel) => (
              <div key={dayLabel} className="py-1">
                {dayLabel}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const dayJobs = jobsByDateKey.get(key) ?? [];
              const inCurrentMonth = isSameMonth(day, calendarMonth);
              const isSelected = isSameDay(day, selectedCalendarDate);
              const isTodayDay = isSameDay(day, today);

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedCalendarDate(startOfDay(day))}
                  className={`min-h-[48px] rounded-xl flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#1E293B] text-white font-bold shadow-xs'
                      : isTodayDay
                        ? 'bg-[#DCFCE7] text-[#15803D] font-bold border border-[#86EFAC]'
                        : inCurrentMonth
                          ? 'bg-white hover:bg-slate-100 text-[#0F172A]'
                          : 'bg-slate-50/60 text-slate-400 hover:bg-slate-100'
                  }`}
                >
                  <span className="text-[14px] leading-none tabular-nums">
                    {format(day, 'd')}
                  </span>
                  <div className="flex items-center justify-center gap-0.5 min-h-[6px]">
                    {dayJobs.slice(0, 3).map((j) => (
                      <span
                        key={j.id}
                        className={`w-1.5 h-1.5 rounded-full ${
                          j.status === 'COMPLETED'
                            ? 'bg-[#10B981]'
                            : j.status === 'IN_PROGRESS'
                              ? 'bg-[#D97706]'
                              : isSelected
                                ? 'bg-[#38BDF8]'
                                : 'bg-[#0369A1]'
                        }`}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E2E8F0] text-[12px] text-[#475569]">
            <span className="font-semibold text-[#0F172A]">
              Visitas de {formatDatePT(selectedCalendarDate.toISOString(), "EEEE, d 'de' MMMM")} (
              <span className="tabular-nums">{selectedDayJobs.length}</span>)
            </span>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#0369A1]" /> Agendada
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#D97706]" /> Em curso
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#10B981]" /> Concluída
              </span>
            </div>
          </div>
        </section>
      )}

      {/* Weather Alerts Banner (Feature Flag per Vertical) */}
      {activeVertical.feature_flags.weather_alerts && rangeFilter === 'today' && (
        <div
          className={`rounded-xl border p-3.5 sm:p-4 transition-colors ${
            rainAlertActive
              ? 'bg-[#FEF2F2] border-[#FCA5A5]'
              : 'bg-white border-[#E2E8F0]'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  rainAlertActive
                    ? 'bg-[#FEE2E2] text-[#B91C1C]'
                    : 'bg-[#E0F2FE] text-[#0369A1]'
                }`}
              >
                {rainAlertActive ? (
                  <CloudRain className="w-5 h-5" />
                ) : (
                  <Sun className="w-5 h-5" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-[#0F172A]">
                  {rainAlertActive
                    ? 'Alerta Meteorológico: Chuva Intensa Prevista (Braga · 28 mm/h)'
                    : 'Meteorologia Hoje · Braga: 19 °C · Céu pouco nublado (10% chuva)'}
                </p>
                <p className="text-[13px] text-[#475569]">
                  {rainAlertActive
                    ? 'Condições adversas para trabalhos de exterior. Pode reagendar todas as visitas de hoje em lote.'
                    : 'Condições favoráveis para manutenção de jardins e espaços exteriores.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!rainAlertActive ? (
                <button
                  type="button"
                  onClick={() => setRainAlertActive(true)}
                  className="min-h-10 px-3 rounded-lg border border-[#CBD5E1] bg-slate-50 hover:bg-slate-100 text-[13px] font-semibold text-[#0F172A] inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <CloudRain className="w-4 h-4 text-[#0369A1]" />
                  <span>Simular Alerta de Chuva Intensa</span>
                </button>
              ) : (
                <>
                  <PrimaryButton
                    variant="danger"
                    onClick={handleBatchRainReschedule}
                    icon={<Calendar className="w-4 h-4" />}
                    className="!min-h-11 !text-[14px]"
                  >
                    Reagendar Dia Inteiro
                  </PrimaryButton>
                  <button
                    type="button"
                    onClick={() => setRainAlertActive(false)}
                    className="min-h-11 px-3 rounded-lg border border-[#CBD5E1] bg-white text-[13px] font-semibold text-[#475569] cursor-pointer"
                  >
                    Dispensar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Field Ops Toolbar: Route Optimization & Morning Load List */}
      {rangeFilter === 'today' && todayJobs.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 bg-white border border-[#E2E8F0] rounded-xl p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleToggleOptimizeRoute}
              className={`min-h-11 px-3.5 rounded-lg border text-[14px] font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                routeOptimized
                  ? 'bg-[#DCFCE7] border-[#10B981] text-[#15803D]'
                  : 'bg-white border-[#CBD5E1] text-[#0F172A] hover:bg-slate-50'
              }`}
            >
              <Route className="w-4 h-4" />
              <span>{routeOptimized ? 'Rota Otimizada ✓' : 'Otimizar Rota'}</span>
            </button>

            <button
              type="button"
              onClick={() => setLoadListOpen(true)}
              className="min-h-11 px-3.5 rounded-lg border border-[#CBD5E1] bg-white hover:bg-slate-50 text-[14px] font-semibold text-[#0F172A] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ClipboardList className="w-4 h-4 text-[#059669]" />
              <span>Lista de Carga</span>
            </button>
          </div>

          {routeSavings && (
            <span className="text-[13px] font-bold text-[#15803D] bg-[#DCFCE7] px-2.5 py-1 rounded-lg tabular-nums">
              Poupança est.: -{routeSavings.km} km · -{routeSavings.mins} min
            </span>
          )}
        </div>
      )}

      {/* Job cards grid */}
      {displayedJobs.length === 0 ? (
        <EmptyState
          icon={<Calendar className="w-6 h-6" />}
          title={
            rangeFilter === 'today'
              ? 'Ainda não tem visitas agendadas para hoje'
              : rangeFilter === 'week'
                ? 'Sem visitas previstas para os próximos 7 dias'
                : `Sem visitas agendadas para ${formatDatePT(selectedCalendarDate.toISOString(), 'd MMM')}`
          }
          description="Agende uma visita pontual ou recorrente (semanal, quinzenal ou mensal) para organizar a sua rota no terreno."
          actionLabel={!isTechnicianMode ? '+ Agendar Visita' : undefined}
          onAction={!isTechnicianMode ? () => setNewJobOpen(true) : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {displayedJobs.map((job) => {
            const client = clientsById.get(job.client_id);
            const asset = assetsById.get(job.asset_id);
            const recurrenceLabel = getRecurrenceShortLabel(job.recurrence_rule);
            const primaryMetric =
              asset?.custom_attributes.area_m2 !== undefined &&
              asset.custom_attributes.area_m2 !== null
                ? `${asset.custom_attributes.area_m2} m²`
                : asset?.custom_attributes.volume_m3 !== undefined &&
                    asset.custom_attributes.volume_m3 !== null
                  ? `${asset.custom_attributes.volume_m3} m³`
                  : null;
            const alertNote = asset?.access_notes || job.next_visit_notes;

            return (
              <article
                key={job.id}
                className={`bg-white rounded-xl border border-[#E2E8F0] border-l-4 ${JOB_LEFT_BORDER[job.status]} p-4 flex flex-col justify-between gap-3.5`}
              >
                <div className="space-y-2.5">
                  {/* Top row: time + badges */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-[14px] font-semibold text-[#0F172A] tabular-nums">
                      <Clock className="w-4 h-4 text-[#475569] shrink-0" />
                      {rangeFilter === 'week' && (
                        <span className="text-[#475569]">
                          {formatDatePT(job.scheduled_start, 'EEE d MMM')} ·
                        </span>
                      )}
                      <span>
                        {formatTimePT(job.scheduled_start)}
                        {job.scheduled_end ? ` – ${formatTimePT(job.scheduled_end)}` : ''}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {recurrenceLabel && (
                        <StatusBadge
                          tone="teal"
                          label={recurrenceLabel}
                          icon={<Repeat className="w-3.5 h-3.5" />}
                        />
                      )}
                      <StatusBadge
                        tone={JOB_STATUS_TONE[job.status]}
                        label={JOB_STATUS_LABELS[job.status]}
                      />
                      {job.status === 'COMPLETED' && (
                        <StatusBadge
                          tone={job.payment_status === 'PAID' ? 'success' : 'warning'}
                          label={PAYMENT_STATUS_LABELS[job.payment_status]}
                        />
                      )}
                    </div>
                  </div>

                  {/* Client & Asset */}
                  <div>
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-[18px] font-bold text-[#0F172A] leading-snug">
                        {client?.name ?? 'Cliente'}
                      </h3>
                      {!isTechnicianMode && (
                        <span className="text-[16px] font-bold text-[#0F172A] tabular-nums shrink-0">
                          {formatEUR(job.price)}
                        </span>
                      )}
                    </div>
                    <p className="text-[15px] font-medium text-[#0F172A] mt-0.5">
                      {job.title}
                    </p>
                    {!isTechnicianMode && job.assigned_user_id && (
                      <p className="text-[12px] font-semibold text-[#0F766E] mt-0.5 inline-flex items-center gap-1">
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>
                          Técnico: {usersById.get(job.assigned_user_id)?.full_name ?? 'Equipa'}
                        </span>
                      </p>
                    )}
                    <p className="text-[14px] text-[#475569] mt-1 flex items-start gap-1.5">
                      <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-[#475569]" />
                      <span>
                        {asset?.name ?? 'Local'}
                        {primaryMetric ? ` (${primaryMetric})` : ''} · {asset?.address ?? '—'}
                      </span>
                    </p>
                  </div>

                  {/* Yellow alert for access_notes / next_visit_notes */}
                  {alertNote && (
                    <div className="rounded-lg bg-[#FEF3C7] border border-[#FDE68A] px-3 py-2 text-[14px] text-[#92400E] flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#B45309]" />
                      <div className="space-y-0.5">
                        {asset?.access_notes && (
                          <p>
                            <strong>Acesso:</strong> {asset.access_notes}
                          </p>
                        )}
                        {job.next_visit_notes && (
                          <p>
                            <strong>Nota:</strong> {job.next_visit_notes}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer action buttons */}
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <a
                    href={buildMapsUrl(
                      asset?.address ?? 'Braga, Portugal',
                      asset?.latitude,
                      asset?.longitude
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 min-h-12 px-3 rounded-[10px] border border-[#CBD5E1] bg-white text-[#0F172A] text-[15px] font-semibold hover:bg-slate-50 transition-colors"
                  >
                    <Navigation className="w-4 h-4 text-[#0369A1]" />
                    <span>Navegar</span>
                  </a>

                  {job.status === 'SCHEDULED' && (
                    <PrimaryButton
                      onClick={() => handleOpenJob(job)}
                      icon={<Play className="w-4 h-4" />}
                    >
                      Iniciar Visita
                    </PrimaryButton>
                  )}

                  {job.status === 'IN_PROGRESS' && (
                    <button
                      type="button"
                      onClick={() => setActiveJobId(job.id)}
                      className="inline-flex items-center justify-center gap-2 min-h-12 px-3 rounded-[10px] bg-[#D97706] hover:bg-[#B45309] text-white text-[15px] font-semibold transition-colors cursor-pointer"
                    >
                      <Clock className="w-4 h-4" />
                      <span>Em Curso</span>
                    </button>
                  )}

                  {job.status === 'COMPLETED' && (
                    <PrimaryButton
                      variant="secondary"
                      onClick={() => setActiveJobId(job.id)}
                      icon={<CheckCircle2 className="w-4 h-4 text-[#15803D]" />}
                    >
                      Ver Registo
                    </PrimaryButton>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Morning Load List BottomSheet */}
      <BottomSheet
        open={loadListOpen}
        onClose={() => setLoadListOpen(false)}
        title="Lista de Carga Matinal"
        subtitle={`Preparação da carrinha para ${todayJobs.length} ${
          todayJobs.length === 1 ? 'visita hoje' : 'visitas hoje'
        }`}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="text-[14px] font-bold uppercase tracking-wide text-[#0F766E]">
              Equipamentos &amp; Máquinas Necessárias
            </h4>
            <ul className="space-y-1.5 text-[14px] text-[#0F172A]">
              {db.equipment
                .filter((e) => !e.deleted_at)
                .map((eq) => (
                  <li
                    key={eq.id}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]"
                  >
                    <span className="font-semibold">
                      {eq.name} ({eq.brand_model})
                    </span>
                    <StatusBadge
                      tone={eq.status === 'OK' ? 'success' : 'warning'}
                      label={eq.status === 'OK' ? 'Pronta' : 'Verificar'}
                    />
                  </li>
                ))}
            </ul>
          </div>

          <div className="space-y-2">
            <h4 className="text-[14px] font-bold uppercase tracking-wide text-[#0F766E]">
              Materiais &amp; Insumos (Stock Atual)
            </h4>
            <ul className="space-y-1.5 text-[14px] text-[#0F172A]">
              {db.inventory_items
                .filter((i) => !i.deleted_at)
                .map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] tabular-nums"
                  >
                    <span className="font-medium">{item.name}</span>
                    <span
                      className={`font-bold ${
                        item.quantity <= item.min_stock ? 'text-[#B91C1C]' : 'text-[#0F172A]'
                      }`}
                    >
                      {item.quantity} {item.unit}
                    </span>
                  </li>
                ))}
            </ul>
          </div>

          {todayJobs.some((j) => j.next_visit_notes) && (
            <div className="space-y-1.5">
              <h4 className="text-[14px] font-bold uppercase tracking-wide text-[#B45309]">
                Notas Especiais de Hoje
              </h4>
              {todayJobs
                .filter((j) => j.next_visit_notes)
                .map((j) => (
                  <p
                    key={j.id}
                    className="p-2.5 rounded-lg bg-[#FEF3C7] border border-[#FDE68A] text-[13px] text-[#92400E]"
                  >
                    <strong>{clientsById.get(j.client_id)?.name}:</strong> {j.next_visit_notes}
                  </p>
                ))}
            </div>
          )}

          <PrimaryButton fullWidth onClick={() => setLoadListOpen(false)}>
            Carrinha Carregada ✓
          </PrimaryButton>
        </div>
      </BottomSheet>

      {/* Batch Weather Reschedule WhatsApp Modal */}
      <Modal
        open={Boolean(rescheduleResult)}
        onClose={() => setRescheduleResult(null)}
        title="Dia Reagendado por Alerta Meteorológico"
        subtitle={
          rescheduleResult
            ? `${rescheduleResult.movedCount} visitas movidas para ${formatShortDatePT(
                rescheduleResult.targetDateIso
              )}`
            : ''
        }
      >
        <div className="space-y-3">
          <p className="text-[14px] text-[#475569]">
            Envie a notificação de reagendamento pronta por WhatsApp a cada cliente afetado:
          </p>
          {rescheduleResult?.messages.map((m, idx) => (
            <div
              key={`${m.phone}-${idx}`}
              className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2"
            >
              <p className="font-bold text-[15px] text-[#0F172A]">{m.clientName}</p>
              <p className="text-[13px] text-[#475569]">{m.text}</p>
              <a
                href={buildWhatsAppUrl(m.phone, m.text)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 min-h-11 px-3.5 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-[13px] font-semibold"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Avisar {m.clientName} (WhatsApp)</span>
              </a>
            </div>
          ))}
          <PrimaryButton
            variant="secondary"
            fullWidth
            onClick={() => setRescheduleResult(null)}
          >
            Fechar
          </PrimaryButton>
        </div>
      </Modal>

      {/* New Job Modal */}
      <NewJobModal
        open={newJobOpen}
        onClose={() => {
          setNewJobOpen(false);
          onClearPreselectedSchedule?.();
        }}
        initialClientId={preselectedSchedule?.clientId}
        initialAssetId={preselectedSchedule?.assetId}
        onCreate={(payload) => {
          createJob(payload);
          setNewJobOpen(false);
          onClearPreselectedSchedule?.();
        }}
      />
    </div>
  );
};

/* --- Job Execution Screen (Field Mode) --- */
interface JobExecutionViewProps {
  job: Job;
  clientName: string;
  clientPhone: string;
  organizationName: string;
  organizationSlug: string;
  assetName: string;
  assetAddress: string;
  accessNotes: string | null;
  verticalName: string;
  isTechnicianMode: boolean;
  catalog: ServiceCatalogItem[];
  inventory: InventoryItem[];
  mediaList: Array<{
    id: string;
    media_type: MediaType;
    data_url: string;
    storage_path: string;
    size_kb: number;
  }>;
  assignedUser: {
    id: string;
    full_name: string;
    role: 'ADMIN' | 'TECHNICIAN';
    hourly_cost: number | null;
    is_active: boolean;
  } | null;
  activeUsers: Array<{
    id: string;
    full_name: string;
    role: 'ADMIN' | 'TECHNICIAN';
    is_active: boolean;
  }>;
  onChangeAssignedUser: (userId: string) => void;
  onBack: () => void;
  onStart: () => void;
  onUpdateChecklist: (checklist: Job['checklist']) => void;
  onUpdateNotes: (notes: string) => void;
  onAddExtra: (extra: { name: string; qty: number; unit_price: number }) => void;
  onRemoveExtra: (extraId: string) => void;
  onConsumeMaterial: (inventoryItemId: string, qty: number) => void;
  onSaveSignature: (dataUrl: string | null) => void;
  onUploadPhoto: (type: MediaType, file: File) => Promise<void>;
  onDeletePhoto: (mediaId: string) => void;
  onPreviewPhoto: (src: string, caption: string) => void;
  onComplete: (notes: string) => void;
  onOpenPayment: () => void;
}

const JobExecutionView: React.FC<JobExecutionViewProps> = ({
  job,
  clientName,
  clientPhone,
  organizationName,
  organizationSlug,
  assetName,
  assetAddress,
  accessNotes,
  verticalName,
  isTechnicianMode,
  catalog,
  inventory,
  mediaList,
  assignedUser,
  activeUsers,
  onChangeAssignedUser,
  onBack,
  onStart,
  onUpdateChecklist,
  onUpdateNotes,
  onAddExtra,
  onRemoveExtra,
  onConsumeMaterial,
  onSaveSignature,
  onUploadPhoto,
  onDeletePhoto,
  onPreviewPhoto,
  onComplete,
  onOpenPayment,
}) => {
  const [notes, setNotes] = useState(job.next_visit_notes ?? '');
  const [extraName, setExtraName] = useState('');
  const [extraQty, setExtraQty] = useState('1');
  const [extraPrice, setExtraPrice] = useState('25');
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>(
    () => inventory[0]?.id ?? ''
  );
  const [materialQty, setMaterialQty] = useState('1');
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(() => {
    if (!job.checkin_at) return 0;
    const end = job.checkout_at ? parseISO(job.checkout_at) : new Date();
    return Math.max(0, differenceInSeconds(end, parseISO(job.checkin_at)));
  });
  const [uploadingType, setUploadingType] = useState<MediaType | null>(null);

  const beforeInputRef = useRef<HTMLInputElement | null>(null);
  const afterInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (job.status !== 'IN_PROGRESS' || !job.checkin_at) return;
    const tick = () => {
      setElapsedSeconds(
        Math.max(0, differenceInSeconds(new Date(), parseISO(job.checkin_at!)))
      );
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [job.checkin_at, job.status]);

  const completedCount = job.checklist.filter((c) => c.done).length;
  const beforePhotos = mediaList.filter((m) => m.media_type === 'BEFORE');
  const afterPhotos = mediaList.filter((m) => m.media_type === 'AFTER');

  const handleToggleItem = (itemId: string) => {
    const next = job.checklist.map((item) =>
      item.id === itemId ? { ...item, done: !item.done } : item
    );
    onUpdateChecklist(next);
  };

  const handleFileChange = async (type: MediaType, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingType(type);
    await onUploadPhoto(type, file);
    setUploadingType(null);
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Execution Header */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="min-h-12 min-w-12 rounded-xl border border-[#CBD5E1] flex items-center justify-center text-[#0F172A] hover:bg-slate-50 cursor-pointer shrink-0"
            aria-label="Voltar à agenda"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h2 className="text-[18px] font-bold text-[#0F172A] truncate">{clientName}</h2>
            <p className="text-[14px] text-[#475569] truncate">
              {assetName} · {assetAddress}
            </p>
          </div>
        </div>
        <StatusBadge
          tone={JOB_STATUS_TONE[job.status]}
          label={JOB_STATUS_LABELS[job.status]}
        />
      </div>

      {/* Timer Card */}
      <div className="bg-[#1E293B] text-white rounded-xl p-5 space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <p className="text-[13px] font-medium text-slate-300">
              {job.status === 'IN_PROGRESS'
                ? 'Cronómetro em curso (Check-in ativo)'
                : job.status === 'COMPLETED'
                  ? 'Duração total registada'
                  : 'Pronto para iniciar serviço'}
            </p>
            <p className="font-display text-[32px] font-bold tracking-tight tabular-nums leading-tight mt-0.5">
              {formatElapsedTimer(elapsedSeconds)}
            </p>
            {!isTechnicianMode &&
              job.status === 'COMPLETED' &&
              elapsedSeconds > 0 &&
              assignedUser?.hourly_cost != null &&
              assignedUser.hourly_cost > 0 && (
                <p className="text-[12px] text-slate-300 mt-1 tabular-nums">
                  Custo est. mão-de-obra:{' '}
                  <strong className="text-[#6EE7B7]">
                    {formatEUR(
                      Math.round(((elapsedSeconds / 3600) * assignedUser.hourly_cost) * 100) / 100
                    )}
                  </strong>{' '}
                  · {assignedUser.full_name} ({formatEUR(assignedUser.hourly_cost)}/h)
                </p>
              )}
          </div>

          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2">
            {job.status === 'SCHEDULED' && (
              <PrimaryButton onClick={onStart} icon={<Play className="w-5 h-5" />}>
                Fazer Check-in
              </PrimaryButton>
            )}
            {!isTechnicianMode && job.status === 'COMPLETED' && job.payment_status !== 'PAID' && (
              <PrimaryButton
                onClick={onOpenPayment}
                icon={<CreditCard className="w-5 h-5" />}
              >
                Registar Pagamento ({formatEUR(job.price)})
              </PrimaryButton>
            )}
            {!isTechnicianMode && job.status === 'COMPLETED' && job.payment_status === 'PAID' && (
              <StatusBadge tone="success" label={`Pago · ${formatEUR(job.price)}`} />
            )}
            {job.status === 'COMPLETED' && clientPhone && (
              <a
                href={buildWhatsAppUrl(
                  clientPhone,
                  `Olá ${clientName}! Obrigado pela confiança na ${organizationName}. Se ficou satisfeito com o serviço "${job.title}", pode deixar-nos uma avaliação de 5 estrelas no Google? https://g.page/r/${organizationSlug}/review`
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 min-h-12 px-3.5 rounded-[10px] bg-[#FEF3C7] hover:bg-[#FDE68A] text-[#92400E] text-[14px] font-bold whitespace-nowrap"
              >
                <Star className="w-4 h-4 fill-current text-[#D97706]" />
                <span>Pedir Avaliação Google</span>
              </a>
            )}
          </div>
        </div>

        {/* Admin Technician Assignment Control on Scheduled / In-Progress Visits */}
        {!isTechnicianMode && job.status !== 'COMPLETED' && activeUsers.length > 0 && (
          <div className="pt-3 border-t border-slate-700/80 flex flex-wrap items-center justify-between gap-2 text-[13px]">
            <span className="text-slate-300 font-medium">Técnico responsável:</span>
            <select
              aria-label="Alterar técnico responsável"
              value={job.assigned_user_id ?? ''}
              onChange={(e) => onChangeAssignedUser(e.target.value)}
              className="min-h-10 px-3 rounded-lg bg-slate-800 border border-slate-600 text-white text-[13px] font-semibold cursor-pointer"
            >
              {assignedUser && !assignedUser.is_active && (
                <option value={assignedUser.id}>
                  {assignedUser.full_name} (Inativo)
                </option>
              )}
              {activeUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.role === 'ADMIN' ? 'Admin' : 'Técnico'})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {accessNotes && (
        <div className="rounded-xl bg-[#FEF3C7] border border-[#FDE68A] px-4 py-3 text-[15px] text-[#92400E] flex items-start gap-2.5">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-[#B45309]" />
          <p>
            <strong>Notas de acesso:</strong> {accessNotes}
          </p>
        </div>
      )}

      {/* Checklist Section (52px rows) */}
      <section className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
        <div className="px-4 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between">
          <h3 className="text-[16px] font-bold text-[#0F172A]">
            Checklist ({verticalName})
          </h3>
          <span className="text-[14px] font-semibold text-[#15803D] tabular-nums">
            {completedCount}/{job.checklist.length} concluídos
          </span>
        </div>

        <div className="divide-y divide-[#E2E8F0]">
          {job.checklist.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleToggleItem(item.id)}
              className="w-full min-h-[52px] px-4 py-3 flex items-center gap-3.5 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer"
            >
              <span
                className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                  item.done
                    ? 'bg-[#10B981] border-[#10B981] text-white'
                    : 'border-[#94A3B8] bg-white'
                }`}
              >
                {item.done && <Check className="w-4 h-4 stroke-[3]" />}
              </span>
              <span
                className={`text-[16px] leading-snug ${
                  item.done ? 'line-through text-[#475569]' : 'text-[#0F172A] font-medium'
                }`}
              >
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Photos (Before / After with Canvas compression <= 500KB) */}
      <section className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[16px] font-bold text-[#0F172A]">
              Fotos do Serviço (Antes / Depois)
            </h3>
            <p className="text-[13px] text-[#475569]">
              Compressão automática local ≤ 500 KB (funciona em modo offline)
            </p>
          </div>
          <span className="text-[13px] font-semibold text-[#475569] tabular-nums">
            {mediaList.length}/4 fotos
          </span>
        </div>

        <input
          ref={beforeInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => void handleFileChange('BEFORE', e)}
        />
        <input
          ref={afterInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => void handleFileChange('AFTER', e)}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* BEFORE */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-semibold text-[#0F172A]">Antes</span>
              <button
                type="button"
                disabled={mediaList.length >= 4 || uploadingType === 'BEFORE'}
                onClick={() => beforeInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-lg border border-[#CBD5E1] bg-white text-[14px] font-semibold text-[#0F172A] hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                <Camera className="w-4 h-4 text-[#10B981]" />
                <span>{uploadingType === 'BEFORE' ? 'A comprimir…' : '+ Foto Antes'}</span>
              </button>
            </div>

            {beforePhotos.length === 0 ? (
              <div className="border border-dashed border-[#CBD5E1] rounded-xl p-4 text-center text-[14px] text-[#475569]">
                Sem fotos de antes
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {beforePhotos.map((m) => (
                  <div
                    key={m.id}
                    className="relative rounded-xl overflow-hidden border border-[#E2E8F0] bg-slate-100"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        onPreviewPhoto(m.data_url, `Antes · ${m.size_kb} KB · ${m.storage_path}`)
                      }
                      className="block w-full aspect-[4/3] cursor-pointer"
                    >
                      <img
                        src={m.data_url}
                        alt="Foto antes do serviço"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </button>
                    <div className="px-2 py-1 bg-white text-[12px] text-[#475569] flex items-center justify-between gap-1 tabular-nums">
                      <span className="truncate">
                        {m.size_kb} KB · {m.storage_path.startsWith('local://') ? 'Local' : 'Sync'}
                      </span>
                      <button
                        type="button"
                        onClick={() => onDeletePhoto(m.id)}
                        aria-label="Remover foto"
                        className="p-1 text-[#B91C1C] hover:bg-red-50 rounded cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AFTER */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-semibold text-[#0F172A]">Depois</span>
              <button
                type="button"
                disabled={mediaList.length >= 4 || uploadingType === 'AFTER'}
                onClick={() => afterInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-lg border border-[#CBD5E1] bg-white text-[14px] font-semibold text-[#0F172A] hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                <Camera className="w-4 h-4 text-[#10B981]" />
                <span>{uploadingType === 'AFTER' ? 'A comprimir…' : '+ Foto Depois'}</span>
              </button>
            </div>

            {afterPhotos.length === 0 ? (
              <div className="border border-dashed border-[#CBD5E1] rounded-xl p-4 text-center text-[14px] text-[#475569]">
                Sem fotos de depois
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {afterPhotos.map((m) => (
                  <div
                    key={m.id}
                    className="relative rounded-xl overflow-hidden border border-[#E2E8F0] bg-slate-100"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        onPreviewPhoto(m.data_url, `Depois · ${m.size_kb} KB · ${m.storage_path}`)
                      }
                      className="block w-full aspect-[4/3] cursor-pointer"
                    >
                      <img
                        src={m.data_url}
                        alt="Foto depois do serviço"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </button>
                    <div className="px-2 py-1 bg-white text-[12px] text-[#475569] flex items-center justify-between gap-1 tabular-nums">
                      <span className="truncate">
                        {m.size_kb} KB · {m.storage_path.startsWith('local://') ? 'Local' : 'Sync'}
                      </span>
                      <button
                        type="button"
                        onClick={() => onDeletePhoto(m.id)}
                        aria-label="Remover foto"
                        className="p-1 text-[#B91C1C] hover:bg-red-50 rounded cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Phase 2: Extras no Local (Catalog or Custom, live price update) */}
      <section className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-[16px] font-bold text-[#0F172A]">Extras no Local</h3>
            <p className="text-[13px] text-[#475569]">
              Adicione trabalhos adicionais pedidos pelo cliente durante a visita.
            </p>
          </div>
          {!isTechnicianMode && (
            <span className="text-[15px] font-extrabold text-[#059669] tabular-nums">
              Total: {formatEUR(job.price)}
            </span>
          )}
        </div>

        {(job.extras ?? []).length > 0 && (
          <div className="divide-y divide-[#E2E8F0] rounded-lg border border-[#E2E8F0] overflow-hidden">
            {(job.extras ?? []).map((ex) => (
              <div
                key={ex.id}
                className="px-3 py-2.5 bg-[#F8FAFC] flex items-center justify-between gap-2 text-[14px]"
              >
                <span className="font-medium text-[#0F172A]">
                  {ex.qty}× {ex.name}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  {!isTechnicianMode && (
                    <span className="font-bold text-[#0F172A] tabular-nums">
                      +{formatEUR(ex.total)}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemoveExtra(ex.id)}
                    aria-label={`Remover extra ${ex.name}`}
                    className="p-1.5 rounded text-[#B91C1C] hover:bg-red-50 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Quick Catalog Add */}
        {catalog.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {catalog.slice(0, 4).map((svc) => (
              <button
                key={svc.id}
                type="button"
                onClick={() =>
                  onAddExtra({
                    name: svc.name,
                    qty: 1,
                    unit_price: svc.unit_price,
                  })
                }
                className="px-2.5 py-1.5 rounded-lg border border-[#CBD5E1] bg-white hover:bg-slate-50 text-[12px] font-semibold text-[#0F172A] cursor-pointer"
              >
                + {svc.name}
                {!isTechnicianMode ? ` (${formatEUR(svc.unit_price)})` : ''}
              </button>
            ))}
          </div>
        )}

        {/* Custom Extra Inline Form */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
          <input
            type="text"
            value={extraName}
            onChange={(e) => setExtraName(e.target.value)}
            placeholder="Descrição do extra (ex.: Saco de substrato)"
            className="sm:col-span-6 min-h-11 px-3 rounded-lg border border-[#CBD5E1] text-[14px]"
          />
          <input
            type="number"
            min={1}
            step="any"
            value={extraQty}
            onChange={(e) => setExtraQty(e.target.value)}
            aria-label="Quantidade"
            className="sm:col-span-2 min-h-11 px-2.5 rounded-lg border border-[#CBD5E1] text-[14px] tabular-nums"
          />
          {!isTechnicianMode && (
            <input
              type="number"
              min={0}
              step="0.01"
              value={extraPrice}
              onChange={(e) => setExtraPrice(e.target.value)}
              aria-label="Preço unitário"
              className="sm:col-span-2 min-h-11 px-2.5 rounded-lg border border-[#CBD5E1] text-[14px] tabular-nums"
            />
          )}
          <PrimaryButton
            type="button"
            variant="secondary"
            onClick={() => {
              if (!extraName.trim()) return;
              onAddExtra({
                name: extraName.trim(),
                qty: Math.max(1, Number(extraQty) || 1),
                unit_price: isTechnicianMode ? 0 : Math.max(0, Number(extraPrice) || 0),
              });
              setExtraName('');
              setExtraQty('1');
            }}
            className={isTechnicianMode ? 'sm:col-span-4 !min-h-11 !text-[14px]' : 'sm:col-span-2 !min-h-11 !text-[14px]'}
          >
            + Extra
          </PrimaryButton>
        </div>
      </section>

      {/* Phase 2: Material Consumption (Auto-deducts from Stock) */}
      <section className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-[#059669]" />
          <div>
            <h3 className="text-[16px] font-bold text-[#0F172A]">
              Materiais Consumidos (Desconto Automático no Stock)
            </h3>
            <p className="text-[13px] text-[#475569]">
              Registe adubos, fio de corte ou produtos usados nesta visita.
            </p>
          </div>
        </div>

        {(job.consumed_materials ?? []).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {(job.consumed_materials ?? []).map((cm) => (
              <span
                key={cm.id}
                className="px-2.5 py-1 rounded-lg bg-[#ECFDF5] border border-[#BBF7D0] text-[#15803D] text-[13px] font-semibold tabular-nums"
              >
                {cm.qty} {cm.unit} · {cm.name}
              </span>
            ))}
          </div>
        )}

        {inventory.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <select
              value={selectedMaterialId}
              onChange={(e) => setSelectedMaterialId(e.target.value)}
              className="sm:col-span-7 min-h-11 px-3 rounded-lg border border-[#CBD5E1] bg-white text-[14px]"
            >
              {inventory.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name} (disp.: {it.quantity} {it.unit})
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0.5}
              step="0.5"
              value={materialQty}
              onChange={(e) => setMaterialQty(e.target.value)}
              className="sm:col-span-2 min-h-11 px-2.5 rounded-lg border border-[#CBD5E1] text-[14px] tabular-nums"
            />
            <PrimaryButton
              type="button"
              variant="secondary"
              onClick={() => {
                const targetId = selectedMaterialId || inventory[0]?.id;
                if (!targetId) return;
                onConsumeMaterial(targetId, Math.max(0.5, Number(materialQty) || 1));
                setMaterialQty('1');
              }}
              className="sm:col-span-3 !min-h-11 !text-[14px]"
            >
              Registar Uso
            </PrimaryButton>
          </div>
        )}
      </section>

      {/* Next visit notes */}
      <section className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-2">
        <label
          htmlFor="next-visit-notes"
          className="block text-[15px] font-bold text-[#0F172A]"
        >
          Nota para a próxima visita
        </label>
        <textarea
          id="next-visit-notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => onUpdateNotes(notes)}
          placeholder="Ex.: Trazer fungicida para as roseiras ou afinar aspersor do canto nordeste…"
          className="w-full p-3 rounded-[10px] border border-[#CBD5E1] text-[16px] text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#10B981]"
        />
      </section>

      {/* Phase 2: Digital Customer Acceptance Signature Pad */}
      <section className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <PenTool className="w-5 h-5 text-[#059669]" />
          <div>
            <h3 className="text-[16px] font-bold text-[#0F172A]">
              Assinatura Digital do Cliente (Opcional)
            </h3>
            <p className="text-[13px] text-[#475569]">
              Recolha a conformidade no ecrã antes do check-out (ideal para condomínios e
              empresas).
            </p>
          </div>
        </div>
        <SignaturePadCanvas
          existingDataUrl={job.signature_data_url ?? null}
          onSave={onSaveSignature}
        />
      </section>

      {/* Fixed Bottom CTA (Check-out) */}
      {job.status !== 'COMPLETED' && (
        <div className="fixed bottom-16 left-0 right-0 z-30 bg-white/95 backdrop-blur-sm border-t border-[#E2E8F0] px-4 py-3 pb-safe">
          <div className="max-w-5xl mx-auto">
            <PrimaryButton
              fullWidth
              className="min-h-[52px]"
              onClick={() => onComplete(notes)}
              icon={<CheckCircle2 className="w-5 h-5" />}
            >
              {isTechnicianMode
                ? 'Concluir Serviço (Check-out)'
                : `Concluir Serviço (Check-out) · ${formatEUR(job.price)}`}
            </PrimaryButton>
          </div>
        </div>
      )}
    </div>
  );
};

/* --- Immediate Payment Bottom Sheet --- */
interface ImmediatePaymentSheetProps {
  job: Job | null;
  clientName: string;
  onClose: () => void;
  onRecord: (amount: number, method: PaymentMethod) => void;
}

const IMMEDIATE_METHODS: PaymentMethod[] = ['CASH', 'MBWAY', 'MULTIBANCO', 'TRANSFER'];

const ImmediatePaymentSheet: React.FC<ImmediatePaymentSheetProps> = ({
  job,
  clientName,
  onClose,
  onRecord,
}) => {
  const [amount, setAmount] = useState<string>('');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('MBWAY');

  useEffect(() => {
    if (job) {
      setAmount(job.price.toFixed(2));
      setSelectedMethod('MBWAY');
    }
  }, [job]);

  if (!job) return null;

  return (
    <BottomSheet
      open={Boolean(job)}
      onClose={onClose}
      title="Recebeu o pagamento agora?"
      subtitle={`${clientName} · ${job.title}`}
    >
      <div>
        <label
          htmlFor="pay-amount"
          className="block text-[14px] font-semibold text-[#0F172A] mb-1.5"
        >
          Valor recebido (€)
        </label>
        <input
          id="pay-amount"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[20px] font-bold text-[#0F172A] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#10B981]"
        />
      </div>

      <div>
        <p className="text-[14px] font-semibold text-[#0F172A] mb-2">Método de pagamento</p>
        <div className="grid grid-cols-2 gap-2.5">
          {IMMEDIATE_METHODS.map((method) => (
            <button
              key={method}
              type="button"
              onClick={() => setSelectedMethod(method)}
              className={`min-h-12 px-3 rounded-[10px] border text-[15px] font-semibold transition-colors cursor-pointer ${
                selectedMethod === method
                  ? 'bg-[#DCFCE7] border-[#10B981] text-[#15803D]'
                  : 'bg-white border-[#CBD5E1] text-[#0F172A] hover:bg-slate-50'
              }`}
            >
              {PAYMENT_METHOD_LABELS[method]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2.5 pt-2">
        <PrimaryButton
          fullWidth
          onClick={() => {
            const parsed = Number(amount);
            onRecord(Number.isFinite(parsed) && parsed > 0 ? parsed : job.price, selectedMethod);
          }}
          icon={<CheckCircle2 className="w-5 h-5" />}
        >
          Confirmar Pagamento ({PAYMENT_METHOD_LABELS[selectedMethod]})
        </PrimaryButton>
        <PrimaryButton fullWidth variant="secondary" onClick={onClose}>
          Fica Pendente (Cobrar depois)
        </PrimaryButton>
      </div>
    </BottomSheet>
  );
};

/* --- New Job Modal (with 90-day RRULE Recurrence & Technician Assignment) --- */
interface NewJobModalProps {
  open: boolean;
  onClose: () => void;
  initialClientId?: string;
  initialAssetId?: string;
  onCreate: (payload: {
    client_id: string;
    asset_id: string;
    assigned_user_id?: string | null;
    title: string;
    scheduled_start: string;
    scheduled_end: string | null;
    recurrence_rule: string | null;
    price: number;
    next_visit_notes?: string | null;
  }) => void;
}

const NewJobModal: React.FC<NewJobModalProps> = ({
  open,
  onClose,
  initialClientId,
  initialAssetId,
  onCreate,
}) => {
  const { db, activeVertical, currentUser } = useZelvo();
  const activeClients = useMemo(
    () => db.clients.filter((c) => !c.deleted_at && !c.is_anonymized),
    [db.clients]
  );

  const [clientId, setClientId] = useState('');
  const [assetId, setAssetId] = useState('');
  const [assignedUserId, setAssignedUserId] = useState(currentUser.id);
  const [title, setTitle] = useState('');
  const [dateStr, setDateStr] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('09:30');
  const [durationMins, setDurationMins] = useState('90');
  const [recurrence, setRecurrence] = useState('');
  const [price, setPrice] = useState('65');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const defaultClient = initialClientId || activeClients[0]?.id || '';
    setClientId(defaultClient);
    const matchingAssets = db.service_assets.filter(
      (a) => a.client_id === defaultClient && !a.deleted_at
    );
    setAssetId(initialAssetId || matchingAssets[0]?.id || '');
    setAssignedUserId(currentUser.id);
    setTitle(
      activeVertical.slug === 'piscinas'
        ? 'Manutenção de Piscina'
        : 'Manutenção de Jardim'
    );
    setDateStr(format(new Date(), 'yyyy-MM-dd'));
    setStartTime('09:30');
    setDurationMins('90');
    setRecurrence('');
    setPrice('65');
    setNotes('');
    setError('');
  }, [
    activeClients,
    activeVertical.slug,
    currentUser.id,
    db.service_assets,
    initialAssetId,
    initialClientId,
    open,
  ]);

  const clientAssets = useMemo(
    () => db.service_assets.filter((a) => a.client_id === clientId && !a.deleted_at),
    [clientId, db.service_assets]
  );

  useEffect(() => {
    if (clientAssets.length > 0 && !clientAssets.some((a) => a.id === assetId)) {
      setAssetId(clientAssets[0].id);
    }
  }, [assetId, clientAssets]);

  const previewRecurrenceCount = useMemo(() => {
    if (!recurrence || !dateStr || !startTime) return 1;
    const startIso = new Date(`${dateStr}T${startTime}:00`).toISOString();
    const endIso = new Date(
      new Date(startIso).getTime() + Number(durationMins || 60) * 60000
    ).toISOString();
    return 1 + generateRecurrenceOccurrences(startIso, endIso, recurrence, 90).length;
  }, [dateStr, durationMins, recurrence, startTime]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || !assetId) {
      setError('Selecione um cliente e o respetivo ativo/local.');
      return;
    }
    if (!title.trim()) {
      setError('Indique um título para a visita.');
      return;
    }

    const startDate = new Date(`${dateStr}T${startTime}:00`);
    const endDate = new Date(startDate.getTime() + Number(durationMins || 60) * 60000);

    onCreate({
      client_id: clientId,
      asset_id: assetId,
      assigned_user_id: assignedUserId || currentUser.id,
      title: title.trim(),
      scheduled_start: startDate.toISOString(),
      scheduled_end: endDate.toISOString(),
      recurrence_rule: recurrence || null,
      price: Math.max(0, Number(price) || 0),
      next_visit_notes: notes.trim() || null,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova Visita"
      subtitle="Agende uma visita pontual ou recorrente (90 dias automáticos)"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-[#FEE2E2] text-[#B91C1C] text-[14px] font-medium">
            {error}
          </div>
        )}

        <div>
          <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
            Cliente *
          </label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] bg-white text-[16px]"
          >
            {activeClients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
            Local / Ativo *
          </label>
          <select
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
            className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] bg-white text-[16px]"
          >
            {clientAssets.length === 0 ? (
              <option value="">Este cliente ainda não tem ativos</option>
            ) : (
              clientAssets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} — {a.address}
                </option>
              ))
            )}
          </select>
        </div>

        <div>
          <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
            Técnico Responsável
          </label>
          <select
            value={assignedUserId}
            onChange={(e) => setAssignedUserId(e.target.value)}
            className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] bg-white text-[16px]"
          >
            {db.users
              .filter((u) => u.is_active)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.role === 'ADMIN' ? 'Admin' : 'Técnico'})
                </option>
              ))}
          </select>
        </div>

        <div>
          <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
            Título do Serviço *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
              Data *
            </label>
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="w-full min-h-12 px-3 rounded-[10px] border border-[#CBD5E1] text-[16px] tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
              Hora Início *
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full min-h-12 px-3 rounded-[10px] border border-[#CBD5E1] text-[16px] tabular-nums"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
              Duração (min)
            </label>
            <select
              value={durationMins}
              onChange={(e) => setDurationMins(e.target.value)}
              className="w-full min-h-12 px-3 rounded-[10px] border border-[#CBD5E1] bg-white text-[16px] tabular-nums"
            >
              <option value="45">45 min</option>
              <option value="60">60 min (1h)</option>
              <option value="90">90 min (1h30)</option>
              <option value="120">120 min (2h)</option>
              <option value="180">180 min (3h)</option>
            </select>
          </div>
          <div>
            <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
              Valor Previsto (€)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] text-[16px] tabular-nums"
            />
          </div>
        </div>

        <div>
          <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
            Recorrência (RRULE)
          </label>
          <select
            value={recurrence}
            onChange={(e) => setRecurrence(e.target.value)}
            className="w-full min-h-12 px-3.5 rounded-[10px] border border-[#CBD5E1] bg-white text-[16px]"
          >
            {RECURRENCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {recurrence && (
            <p className="mt-1.5 text-[13px] font-medium text-[#0F766E] bg-[#CCFBF1]/60 px-3 py-1.5 rounded-lg tabular-nums">
              Serão geradas automaticamente <strong>{previewRecurrenceCount} visitas</strong> nos
              próximos 90 dias ligadas à visita principal (100% offline).
            </p>
          )}
        </div>

        <div>
          <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
            Notas iniciais (opcional)
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Equipamento específico ou observação…"
            className="w-full p-3 rounded-[10px] border border-[#CBD5E1] text-[16px]"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <PrimaryButton type="button" variant="secondary" fullWidth onClick={onClose}>
            Cancelar
          </PrimaryButton>
          <PrimaryButton type="submit" fullWidth>
            Agendar Visita
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
};
