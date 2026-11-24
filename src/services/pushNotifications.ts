import { isSameDay, parseISO, startOfDay } from 'date-fns';
import { formatEUR, formatTimePT } from '../i18n/pt-PT';
import type { Client, Job } from '../types/database';

const PUSH_PREFS_KEY = 'zelvo_push_prefs_v1';

export interface PushNotificationPreferences {
  enabled: boolean;
  dailyVisitsAlert: boolean;
  pendingPaymentsAlert: boolean;
  lastAutoAlertDate: string | null;
}

export interface PushDispatchResult {
  deliveredVia: 'service_worker' | 'notification_api' | 'in_app_fallback';
  title: string;
  body: string;
}

const DEFAULT_PREFS: PushNotificationPreferences = {
  enabled: false,
  dailyVisitsAlert: true,
  pendingPaymentsAlert: true,
  lastAutoAlertDate: null,
};

export function loadPushPreferences(): PushNotificationPreferences {
  try {
    const raw = localStorage.getItem(PUSH_PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PushNotificationPreferences>;
      return { ...DEFAULT_PREFS, ...parsed };
    }
  } catch {
    // Ignore storage read errors
  }
  return DEFAULT_PREFS;
}

export function savePushPreferences(prefs: PushNotificationPreferences): void {
  try {
    localStorage.setItem(PUSH_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore quota errors
  }
}

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestPushPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isPushSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/**
 * Dispatches a Push Notification via the active Service Worker registration
 * (falling back cleanly to Notification API or in-app feedback in restricted sandboxes).
 */
export async function dispatchServiceWorkerNotification(payload: {
  title: string;
  body: string;
  tag: string;
  tab: 'today' | 'finance';
}): Promise<PushDispatchResult> {
  if (isPushSupported() && Notification.permission === 'granted') {
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          if (registration.active) {
            registration.active.postMessage({
              type: 'SHOW_NOTIFICATION',
              payload,
            });
            return {
              deliveredVia: 'service_worker',
              title: payload.title,
              body: payload.body,
            };
          }
          await registration.showNotification(payload.title, {
            body: payload.body,
            icon: '/icon.svg',
            badge: '/icon.svg',
            tag: payload.tag,
            data: { tab: payload.tab },
          });
          return {
            deliveredVia: 'service_worker',
            title: payload.title,
            body: payload.body,
          };
        }
      }

      new Notification(payload.title, {
        body: payload.body,
        icon: '/icon.svg',
        tag: payload.tag,
      });
      return {
        deliveredVia: 'notification_api',
        title: payload.title,
        body: payload.body,
      };
    } catch {
      // Fallback gracefully when preview iframe blocks native notifications
    }
  }

  return {
    deliveredVia: 'in_app_fallback',
    title: payload.title,
    body: payload.body,
  };
}

export function buildDailyVisitsAlertContent(
  jobs: Job[],
  clients: Client[]
): { title: string; body: string; count: number } {
  const today = startOfDay(new Date());
  const clientsById = new Map(clients.map((c) => [c.id, c]));
  const todayScheduled = jobs
    .filter(
      (j) =>
        !j.deleted_at &&
        (j.status === 'SCHEDULED' || j.status === 'IN_PROGRESS') &&
        isSameDay(parseISO(j.scheduled_start), today)
    )
    .sort(
      (a, b) => parseISO(a.scheduled_start).getTime() - parseISO(b.scheduled_start).getTime()
    );

  if (todayScheduled.length === 0) {
    return {
      title: 'Agenda de Hoje — Zelvo',
      body: 'Não tem visitas agendadas pendentes para hoje.',
      count: 0,
    };
  }

  const first = todayScheduled[0];
  const firstClient = clientsById.get(first.client_id)?.name ?? 'Cliente';
  const firstTime = formatTimePT(first.scheduled_start);

  return {
    title: `Agenda de Hoje: ${todayScheduled.length} ${
      todayScheduled.length === 1 ? 'visita agendada' : 'visitas agendadas'
    }`,
    body: `Próxima às ${firstTime} — ${firstClient} (${first.title}).`,
    count: todayScheduled.length,
  };
}

export function buildPendingPaymentsAlertContent(jobs: Job[]): {
  title: string;
  body: string;
  count: number;
  total: number;
} {
  const pendingJobs = jobs.filter(
    (j) => !j.deleted_at && j.status !== 'CANCELLED' && j.payment_status !== 'PAID'
  );
  const total = pendingJobs.reduce((acc, j) => acc + j.price, 0);

  if (pendingJobs.length === 0) {
    return {
      title: 'Pagamentos em Dia — Zelvo',
      body: 'Todos os serviços registados já se encontram liquidados.',
      count: 0,
      total: 0,
    };
  }

  return {
    title: `Lembrete de Cobrança: ${formatEUR(total)} pendentes`,
    body: `Existem ${pendingJobs.length} ${
      pendingJobs.length === 1 ? 'visita por cobrar' : 'visitas por cobrar'
    }. Toque para consultar nas Finanças.`,
    count: pendingJobs.length,
    total,
  };
}
