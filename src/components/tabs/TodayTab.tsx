import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDays,
  differenceInSeconds,
  format,
  isSameDay,
  isWithinInterval,
  parseISO,
  startOfDay,
} from 'date-fns';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  MapPin,
  Navigation,
  Play,
  Plus,
  Repeat,
  Trash2,
} from 'lucide-react';
import {
  formatDatePT,
  formatElapsedTimer,
  formatEUR,
  formatTimePT,
  getRecurrenceShortLabel,
  JOB_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  RECURRENCE_OPTIONS,
} from '../../i18n/pt-PT';
import { useZelvo } from '../../store/ZelvoContext';
import type { Job, MediaType, PaymentMethod } from '../../types/database';
import {
  buildMapsUrl,
  compressImageFile,
  generateRecurrenceOccurrences,
} from '../../utils/calculations';
import {
  BottomSheet,
  EmptyState,
  Modal,
  PhotoLightbox,
  PrimaryButton,
  StatusBadge,
  type SemanticTone,
} from '../common/UIPrimitives';

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
    activeVertical,
    createJob,
    startJob,
    updateJobExecution,
    completeJob,
    addJobMedia,
    softDeleteJobMedia,
    recordPaymentForJob,
    showToast,
  } = useZelvo();

  const [rangeFilter, setRangeFilter] = useState<'today' | 'week'>('today');
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [paymentSheetJobId, setPaymentSheetJobId] = useState<string | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<{ src: string; caption: string } | null>(
    null
  );

  // Pre-open New Job modal if redirected from Leads/Clients
  useEffect(() => {
    if (preselectedSchedule) {
      setNewJobOpen(true);
    }
  }, [preselectedSchedule]);

  const activeJobs = useMemo(
    () =>
      db.jobs
        .filter((j) => !j.deleted_at)
        .sort(
          (a, b) =>
            parseISO(a.scheduled_start).getTime() - parseISO(b.scheduled_start).getTime()
        ),
    [db.jobs]
  );

  const today = startOfDay(new Date());
  const weekEnd = addDays(today, 7);

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

  const displayedJobs = rangeFilter === 'today' ? todayJobs : weekJobs;

  const activeJob = useMemo(
    () => activeJobs.find((j) => j.id === activeJobId) ?? null,
    [activeJobs, activeJobId]
  );

  const paymentSheetJob = useMemo(
    () => activeJobs.find((j) => j.id === paymentSheetJobId) ?? null,
    [activeJobs, paymentSheetJobId]
  );

  const clientsById = useMemo(
    () => new Map(db.clients.map((c) => [c.id, c])),
    [db.clients]
  );
  const assetsById = useMemo(
    () => new Map(db.service_assets.map((a) => [a.id, a])),
    [db.service_assets]
  );

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
          assetName={asset?.name ?? 'Local'}
          assetAddress={asset?.address ?? ''}
          accessNotes={asset?.access_notes ?? null}
          verticalName={activeVertical.name}
          mediaList={mediaList}
          onBack={() => setActiveJobId(null)}
          onStart={() => startJob(activeJob.id)}
          onUpdateChecklist={(checklist) => updateJobExecution(activeJob.id, { checklist })}
          onUpdateNotes={(next_visit_notes) =>
            updateJobExecution(activeJob.id, { next_visit_notes })
          }
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
            setPaymentSheetJobId(activeJob.id);
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
            className={`min-h-[42px] px-4 rounded-lg text-[15px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              rangeFilter === 'week'
                ? 'bg-white text-[#0F172A] shadow-xs'
                : 'text-[#475569] hover:text-[#0F172A]'
            }`}
          >
            Semana (<span className="tabular-nums">{weekJobs.length}</span>)
          </button>
        </div>

        <PrimaryButton
          onClick={() => setNewJobOpen(true)}
          icon={<Plus className="w-5 h-5" />}
        >
          Nova Visita
        </PrimaryButton>
      </div>

      {/* Job cards grid */}
      {displayedJobs.length === 0 ? (
        <EmptyState
          icon={<Calendar className="w-6 h-6" />}
          title={
            rangeFilter === 'today'
              ? 'Ainda não tem visitas agendadas para hoje'
              : 'Sem visitas previstas para os próximos 7 dias'
          }
          description="Agende uma visita pontual ou recorrente (semanal, quinzenal ou mensal) para organizar a sua rota no terreno."
          actionLabel="+ Agendar Visita"
          onAction={() => setNewJobOpen(true)}
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
                      <span className="text-[16px] font-bold text-[#0F172A] tabular-nums shrink-0">
                        {formatEUR(job.price)}
                      </span>
                    </div>
                    <p className="text-[15px] font-medium text-[#0F172A] mt-0.5">
                      {job.title}
                    </p>
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
  assetName: string;
  assetAddress: string;
  accessNotes: string | null;
  verticalName: string;
  mediaList: Array<{
    id: string;
    media_type: MediaType;
    data_url: string;
    storage_path: string;
    size_kb: number;
  }>;
  onBack: () => void;
  onStart: () => void;
  onUpdateChecklist: (checklist: Job['checklist']) => void;
  onUpdateNotes: (notes: string) => void;
  onUploadPhoto: (type: MediaType, file: File) => Promise<void>;
  onDeletePhoto: (mediaId: string) => void;
  onPreviewPhoto: (src: string, caption: string) => void;
  onComplete: (notes: string) => void;
  onOpenPayment: () => void;
}

const JobExecutionView: React.FC<JobExecutionViewProps> = ({
  job,
  clientName,
  assetName,
  assetAddress,
  accessNotes,
  verticalName,
  mediaList,
  onBack,
  onStart,
  onUpdateChecklist,
  onUpdateNotes,
  onUploadPhoto,
  onDeletePhoto,
  onPreviewPhoto,
  onComplete,
  onOpenPayment,
}) => {
  const [notes, setNotes] = useState(job.next_visit_notes ?? '');
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
      <div className="bg-[#1E293B] text-white rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
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
        </div>

        <div className="flex items-center gap-2">
          {job.status === 'SCHEDULED' && (
            <PrimaryButton onClick={onStart} icon={<Play className="w-5 h-5" />}>
              Fazer Check-in
            </PrimaryButton>
          )}
          {job.status === 'COMPLETED' && job.payment_status !== 'PAID' && (
            <PrimaryButton
              onClick={onOpenPayment}
              icon={<CreditCard className="w-5 h-5" />}
            >
              Registar Pagamento ({formatEUR(job.price)})
            </PrimaryButton>
          )}
          {job.status === 'COMPLETED' && job.payment_status === 'PAID' && (
            <StatusBadge tone="success" label={`Pago · ${formatEUR(job.price)}`} />
          )}
        </div>
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
              Concluir Serviço (Check-out) · {formatEUR(job.price)}
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

/* --- New Job Modal (with 90-day RRULE Recurrence) --- */
interface NewJobModalProps {
  open: boolean;
  onClose: () => void;
  initialClientId?: string;
  initialAssetId?: string;
  onCreate: (payload: {
    client_id: string;
    asset_id: string;
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
  const { db, activeVertical } = useZelvo();
  const activeClients = useMemo(
    () => db.clients.filter((c) => !c.deleted_at && !c.is_anonymized),
    [db.clients]
  );

  const [clientId, setClientId] = useState('');
  const [assetId, setAssetId] = useState('');
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
  }, [activeClients, activeVertical.slug, db.service_assets, initialAssetId, initialClientId, open]);

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
