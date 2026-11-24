import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  addDays,
  addHours,
  addMonths,
  addWeeks,
  format,
  isBefore,
  isSameDay,
  isWeekend,
  parseISO,
  startOfDay,
} from 'date-fns';
import {
  createDemoEquipment,
  createDemoInventoryItems,
  createDemoTeamInvitations,
  createHistoricalDemoTransactions,
  createInitialSeedDatabase,
  VERTICAL_TEMPLATES,
} from '../data/seedData';
import { SAAS_PLANS } from '../i18n/pt-PT';
import {
  dispatchServiceWorkerNotification,
  loadPushPreferences,
} from '../services/pushNotifications';
import type {
  ChecklistItem,
  Client,
  CustomAttributeValue,
  DunningStage,
  EntityTableName,
  EquipmentItem,
  EquipmentStatus,
  InventoryItem,
  Job,
  JobMedia,
  Lead,
  LeadSource,
  LeadStatus,
  MediaType,
  Organization,
  PaymentMethod,
  Quote,
  QuoteItem,
  QuotePackage,
  QuoteStatus,
  RecurrenceBillingFrequency,
  ServiceAsset,
  ServiceCatalogItem,
  ServiceUnit,
  SyncQueueItem,
  TeamInvitation,
  Transaction,
  TransactionType,
  User,
  UserRole,
  VerticalTemplate,
  ZelvoDatabase,
} from '../types/database';
import {
  calculateQuoteTotals,
  generateId,
  generatePublicToken,
  generateRecurrenceOccurrences,
  isQuoteExpired,
} from '../utils/calculations';

const DB_STORAGE_KEY = 'zelvo_db_v1';
const QUEUE_STORAGE_KEY = 'zelvo_sync_queue_v1';
const OFFLINE_STORAGE_KEY = 'zelvo_offline_mode_v1';
const ACTIVE_USER_STORAGE_KEY = 'zelvo_active_user_v1';

export interface ToastMessage {
  id: string;
  message: string;
  tone: 'success' | 'info' | 'warning' | 'danger';
  undoLabel?: string;
  onUndo?: () => void;
}

export interface CreateLeadInput {
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  description?: string | null;
  source: LeadSource;
  photo_urls?: string[];
  gdpr_consent: boolean;
}

export interface CreateClientInput {
  name: string;
  phone: string;
  email?: string | null;
  nif?: string | null;
  billing_address?: string | null;
  notes?: string | null;
}

export interface UpsertAssetInput {
  id?: string;
  client_id: string;
  name: string;
  address: string;
  access_notes?: string | null;
  custom_attributes: Record<string, CustomAttributeValue>;
}

export interface UpsertCatalogInput {
  id?: string;
  name: string;
  description?: string | null;
  unit: ServiceUnit;
  unit_price: number;
  cost_price: number;
  vat_rate: number;
}

export interface CreateQuoteInput {
  lead_id?: string | null;
  client_id?: string | null;
  items: Array<Omit<QuoteItem, 'total'>>;
  valid_until: string | null;
  status?: QuoteStatus;
  packages?: QuotePackage[];
  selected_package_id?: string | null;
  deposit_pct?: number | null;
  is_recurring?: boolean;
  recurrence_frequency?: RecurrenceBillingFrequency | null;
  next_billing_date?: string | null;
  auto_invoice_active?: boolean;
}

export interface CreateJobInput {
  client_id: string;
  asset_id: string;
  quote_id?: string | null;
  assigned_user_id?: string | null;
  title: string;
  scheduled_start: string;
  scheduled_end: string | null;
  recurrence_rule: string | null;
  price: number;
  next_visit_notes?: string | null;
}

export interface CreateTransactionInput {
  job_id?: string | null;
  client_id?: string | null;
  type: TransactionType;
  category: string;
  amount: number;
  payment_method: PaymentMethod;
  transaction_date: string;
  description?: string | null;
  receipt_path?: string | null;
  external_payment_id?: string | null;
}

export interface UpsertInventoryInput {
  id?: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  min_stock: number;
  unit_cost: number;
}

export interface UpsertEquipmentInput {
  id?: string;
  name: string;
  brand_model: string;
  serial_or_plate?: string | null;
  hours_used: number;
  next_service_hours?: number | null;
  next_service_date: string;
  status: EquipmentStatus;
  notes?: string | null;
}

export interface CreateTeamInvitationInput {
  full_name: string;
  phone: string;
  email: string;
  role?: UserRole;
  hourly_cost?: number | null;
}

export interface CompleteOnboardingInput {
  verticalId: string;
  companyName: string;
  nif: string | null;
  primaryColor: string;
  logoUrl: string | null;
  adminName?: string;
  adminEmail?: string;
  mode: 'demo' | 'blank';
}

interface ZelvoContextValue {
  db: ZelvoDatabase;
  organization: Organization;
  activeVertical: VerticalTemplate;
  currentUser: User;
  isTechnicianMode: boolean;
  setCurrentUserId: (userId: string) => void;
  isOffline: boolean;
  isSyncing: boolean;
  syncJustCompleted: boolean;
  syncQueue: SyncQueueItem[];
  lastSyncedAt: string | null;
  toasts: ToastMessage[];
  showToast: (
    message: string,
    tone?: ToastMessage['tone'],
    undoAction?: { label: string; onUndo: () => void }
  ) => void;
  dismissToast: (id: string) => void;
  toggleOffline: () => void;
  syncNow: () => Promise<void>;
  resetDemoData: () => void;

  // Organization & Vertical
  updateOrganization: (patch: Partial<Organization>) => void;
  switchVertical: (verticalId: string, loadDefaultServices: boolean) => void;
  completeOnboarding: (input: CompleteOnboardingInput) => void;

  // Leads
  createLead: (input: CreateLeadInput) => Lead;
  updateLeadStatus: (
    leadId: string,
    status: LeadStatus,
    lostReason?: string | null
  ) => { ok: boolean; error?: string };
  logLeadFollowupSent: (leadId: string) => void;
  convertLeadToClient: (leadId: string) => { client: Client; asset: ServiceAsset } | null;

  // Clients & Assets
  createClient: (input: CreateClientInput) => Client;
  updateClient: (clientId: string, patch: Partial<CreateClientInput>) => void;
  anonymizeClient: (clientId: string) => void;
  upsertServiceAsset: (input: UpsertAssetInput) => ServiceAsset;
  softDeleteAsset: (assetId: string) => void;

  // Catalog & Quotes
  upsertCatalogItem: (input: UpsertCatalogInput) => ServiceCatalogItem;
  softDeleteCatalogItem: (itemId: string) => void;
  createQuote: (input: CreateQuoteInput) => Quote;
  updateQuoteStatus: (quoteId: string, status: QuoteStatus) => void;
  approveQuoteByToken: (
    token: string,
    selectedPackageId?: string | null
  ) => { ok: boolean; error?: string; quote?: Quote };
  configureQuoteRecurrence: (
    quoteId: string,
    frequency: RecurrenceBillingFrequency,
    nextBillingDate: string
  ) => void;
  toggleQuoteAutoInvoice: (quoteId: string, active: boolean) => void;
  generateAutoInvoiceFromQuote: (quoteId: string) => {
    invoiceNumber: string;
    issueDate: string;
    transaction: Transaction;
    quote: Quote;
  } | null;

  // Jobs & Media
  createJob: (input: CreateJobInput) => { parent: Job; createdCount: number };
  startJob: (jobId: string) => void;
  updateJobExecution: (
    jobId: string,
    patch: {
      checklist?: ChecklistItem[];
      next_visit_notes?: string | null;
      assigned_user_id?: string | null;
    }
  ) => void;
  completeJob: (jobId: string, nextVisitNotes?: string | null) => void;
  addJobExtra: (
    jobId: string,
    extra: { name: string; qty: number; unit_price: number }
  ) => void;
  removeJobExtra: (jobId: string, extraId: string) => void;
  saveJobSignature: (jobId: string, dataUrl: string | null) => void;
  consumeInventoryInJob: (jobId: string, inventoryItemId: string, qty: number) => void;
  rescheduleTodayJobsToNextBusinessDay: () => {
    movedCount: number;
    targetDateIso: string;
    messages: Array<{ clientName: string; phone: string; text: string }>;
  };
  addJobMedia: (
    jobId: string,
    mediaType: MediaType,
    dataUrl: string,
    sizeKb: number
  ) => JobMedia;
  softDeleteJobMedia: (mediaId: string) => void;
  recordPaymentForJob: (
    jobId: string,
    amount: number,
    method: PaymentMethod,
    description?: string
  ) => Transaction | null;

  // Payments, Dunning, Retainers & AT Certified Invoicing
  simulatePaymentWebhook: (params: {
    jobId?: string | null;
    quoteId?: string | null;
    amount: number;
    method: PaymentMethod;
    reference?: string;
    selectedPackageId?: string | null;
  }) => Transaction | null;
  issueATInvoice: (transactionId: string) => Transaction | null;
  advanceDunningStage: (jobId: string, stage: DunningStage) => void;
  togglePauseJobDunning: (jobId: string, paused: boolean) => void;
  updateClientRetainer: (
    clientId: string,
    isRetainer: boolean,
    amount: number | null,
    billingDay: number | null
  ) => void;

  // Stock & Equipment
  upsertInventoryItem: (input: UpsertInventoryInput) => InventoryItem;
  adjustInventoryStock: (itemId: string, delta: number) => void;
  purchaseInventoryItem: (itemId: string, restockQty: number) => Transaction | null;
  upsertEquipment: (input: UpsertEquipmentInput) => EquipmentItem;
  logEquipmentService: (equipmentId: string) => void;

  // Marketing Referrals
  registerClientReferral: (
    referrerClientId: string,
    neighborName: string,
    neighborPhone: string
  ) => Lead | null;

  // Team & Invitations
  createTeamInvitation: (
    input: CreateTeamInvitationInput
  ) => { ok: boolean; error?: string; invitation?: TeamInvitation };
  acceptTeamInvitation: (
    invitationId: string
  ) => { ok: boolean; error?: string; user?: User };
  revokeTeamInvitation: (invitationId: string) => void;
  toggleUserActiveStatus: (
    userId: string,
    isActive: boolean
  ) => { ok: boolean; error?: string };
  updateUserHourlyCost: (userId: string, hourlyCost: number | null) => void;

  // Transactions
  createTransaction: (input: CreateTransactionInput) => Transaction;
  softDeleteTransaction: (txId: string) => void;
}

const ZelvoContext = createContext<ZelvoContextValue | null>(null);

function loadInitialDb(): ZelvoDatabase {
  try {
    const raw = localStorage.getItem(DB_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ZelvoDatabase>;
      if (
        parsed &&
        Array.isArray(parsed.organizations) &&
        parsed.organizations.length > 0 &&
        Array.isArray(parsed.vertical_templates) &&
        parsed.vertical_templates.length > 0
      ) {
        const loaded = parsed as ZelvoDatabase;
        const freshSeed = createInitialSeedDatabase();
        const orgId = loaded.organizations[0]?.id ?? freshSeed.organizations[0].id;
        let nextLoaded: ZelvoDatabase = {
          ...loaded,
          inventory_items:
            Array.isArray(loaded.inventory_items) && loaded.inventory_items.length > 0
              ? loaded.inventory_items
              : createDemoInventoryItems(orgId),
          equipment:
            Array.isArray(loaded.equipment) && loaded.equipment.length > 0
              ? loaded.equipment
              : createDemoEquipment(orgId),
        };

        // Ensure all 4 VerticalTemplates exist (including Limpezas & AVAC) and weather_alerts is present
        const existingVtIds = new Set(nextLoaded.vertical_templates.map((vt) => vt.id));
        const mergedVerticals = [
          ...nextLoaded.vertical_templates.map((vt) =>
            vt.slug === 'jardinagem' && vt.feature_flags.weather_alerts === undefined
              ? { ...vt, feature_flags: { ...vt.feature_flags, weather_alerts: true } }
              : vt
          ),
          ...VERTICAL_TEMPLATES.filter((vt) => !existingVtIds.has(vt.id)),
        ];
        nextLoaded = {
          ...nextLoaded,
          vertical_templates: mergedVerticals,
        };

        // Ensure 2 technicians exist for Multi-User demo and backfill User fields
        const existingUserIds = new Set(nextLoaded.users.map((u) => u.id));
        const mergedUsers =
          nextLoaded.users.length < 2
            ? [...nextLoaded.users, ...freshSeed.users.filter((u) => !existingUserIds.has(u.id))]
            : nextLoaded.users;

        const nowDate = new Date();
        const rawInvitations = Array.isArray(loaded.team_invitations)
          ? loaded.team_invitations
          : createDemoTeamInvitations(orgId, nowDate);

        nextLoaded = {
          ...nextLoaded,
          users: mergedUsers.map((u) => {
            const seedMatch = freshSeed.users.find((su) => su.id === u.id);
            return {
              ...u,
              phone: u.phone !== undefined ? u.phone : (seedMatch?.phone ?? null),
              email: u.email !== undefined ? u.email : (seedMatch?.email ?? null),
              hourly_cost:
                u.hourly_cost !== undefined ? u.hourly_cost : (seedMatch?.hourly_cost ?? null),
              is_active: typeof u.is_active === 'boolean' ? u.is_active : true,
            };
          }),
          team_invitations: rawInvitations.map((inv) =>
            inv.status === 'PENDING' && isBefore(parseISO(inv.expires_at), nowDate)
              ? { ...inv, status: 'EXPIRED' as const }
              : inv
          ),
        };

        // Backfill historical 5 months if missing
        const hasHistorical = nextLoaded.transactions.some((t) => t.id.startsWith('tx-hist-'));
        if (!hasHistorical) {
          nextLoaded = {
            ...nextLoaded,
            transactions: [
              ...nextLoaded.transactions,
              ...createHistoricalDemoTransactions(orgId),
            ],
          };
        }

        // Backfill recurring contract on quote-003 & multi-package on quote-002
        const seedQ2 = freshSeed.quotes.find((q) => q.id === 'quote-002');
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        nextLoaded = {
          ...nextLoaded,
          quotes: nextLoaded.quotes.map((q) => {
            if (q.id === 'quote-003' && !q.is_recurring) {
              return {
                ...q,
                is_recurring: true,
                recurrence_frequency: 'MONTHLY',
                next_billing_date: todayStr,
                auto_invoice_active: true,
                generated_invoices_count: 1,
              };
            }
            if (q.id === 'quote-002' && (!q.packages || q.packages.length === 0) && seedQ2) {
              return {
                ...q,
                packages: seedQ2.packages,
                selected_package_id: seedQ2.selected_package_id,
                deposit_pct: seedQ2.deposit_pct,
                deposit_paid: false,
              };
            }
            return q;
          }),
        };

        // Backfill client referral codes & retainers
        nextLoaded = {
          ...nextLoaded,
          clients: nextLoaded.clients.map((c) => {
            const seedClient = freshSeed.clients.find((sc) => sc.id === c.id);
            const fallbackCode = `ZELVO-${c.name
              .replace(/[^a-zA-Z]/g, '')
              .slice(0, 5)
              .toUpperCase()}15`;
            return {
              ...c,
              referral_code: c.referral_code ?? seedClient?.referral_code ?? fallbackCode,
              is_retainer: c.is_retainer ?? seedClient?.is_retainer ?? false,
              retainer_amount: c.retainer_amount ?? seedClient?.retainer_amount ?? null,
              retainer_billing_day:
                c.retainer_billing_day ?? seedClient?.retainer_billing_day ?? null,
              referral_discount_pct:
                c.referral_discount_pct ?? seedClient?.referral_discount_pct ?? 0,
              referrals_count: c.referrals_count ?? seedClient?.referrals_count ?? 0,
            };
          }),
        };

        // Backfill overdue payment jobs (job-005, job-006) & afternoon tech job (job-007)
        const existingJobIds = new Set(nextLoaded.jobs.map((j) => j.id));
        const extraDemoJobs = freshSeed.jobs.filter(
          (j) =>
            (j.id === 'job-005' || j.id === 'job-006' || j.id === 'job-007') &&
            !existingJobIds.has(j.id)
        );
        if (extraDemoJobs.length > 0) {
          nextLoaded = {
            ...nextLoaded,
            jobs: [
              ...nextLoaded.jobs.map((j) =>
                j.id === 'job-002' && j.assigned_user_id === 'user-tiago-001'
                  ? { ...j, assigned_user_id: 'user-diogo-002' }
                  : j
              ),
              ...extraDemoJobs,
            ],
          };
        }

        // Backfill BEFORE photo on job-003 for Before/After creator
        if (!nextLoaded.job_media.some((m) => m.id === 'media-000')) {
          const seedBefore = freshSeed.job_media.find((m) => m.id === 'media-000');
          if (seedBefore) {
            nextLoaded = {
              ...nextLoaded,
              job_media: [seedBefore, ...nextLoaded.job_media],
            };
          }
        }

        // Backfill lost leads for Seasonal Campaigns if none exist
        if (!nextLoaded.leads.some((l) => l.status === 'LOST')) {
          const seedLost = freshSeed.leads.filter((l) => l.status === 'LOST');
          nextLoaded = {
            ...nextLoaded,
            leads: [...nextLoaded.leads, ...seedLost],
          };
        }

        // Backfill overdue follow-up date on demo QUOTE_SENT lead (lead-003) if missing
        const seedLead3 = freshSeed.leads.find((l) => l.id === 'lead-003');
        if (seedLead3) {
          nextLoaded = {
            ...nextLoaded,
            leads: nextLoaded.leads.map((l) =>
              l.id === 'lead-003' && l.status === 'QUOTE_SENT' && l.next_followup_at === undefined
                ? {
                    ...l,
                    next_followup_at: seedLead3.next_followup_at,
                    updated_at: seedLead3.updated_at,
                  }
                : l
            ),
          };
        }

        return nextLoaded;
      }
    }
  } catch {
    // Fallback to seed data if storage is corrupted
  }
  return createInitialSeedDatabase();
}

function loadInitialQueue(): SyncQueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SyncQueueItem[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Ignore storage read errors
  }
  return [];
}

function loadInitialOffline(): boolean {
  try {
    return localStorage.getItem(OFFLINE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function loadInitialUserId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_USER_STORAGE_KEY);
  } catch {
    return null;
  }
}

export const ZelvoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [db, setDb] = useState<ZelvoDatabase>(loadInitialDb);
  const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>(loadInitialQueue);
  const [isOffline, setIsOffline] = useState<boolean>(loadInitialOffline);
  const [activeUserId, setActiveUserId] = useState<string | null>(loadInitialUserId);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncJustCompleted, setSyncJustCompleted] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => new Date().toISOString());
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Persist to localStorage automatically
  useEffect(() => {
    try {
      localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(db));
    } catch {
      // Storage quota fallback: keep running in memory without crashing field ops
    }
  }, [db]);

  useEffect(() => {
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(syncQueue));
    } catch {
      // Ignore quota error
    }
  }, [syncQueue]);

  useEffect(() => {
    try {
      localStorage.setItem(OFFLINE_STORAGE_KEY, String(isOffline));
    } catch {
      // Ignore
    }
  }, [isOffline]);

  useEffect(() => {
    try {
      if (activeUserId) {
        localStorage.setItem(ACTIVE_USER_STORAGE_KEY, activeUserId);
      }
    } catch {
      // Ignore
    }
  }, [activeUserId]);

  const organization = db.organizations[0];

  const currentUser = useMemo(() => {
    const selected = db.users.find((u) => u.id === activeUserId && u.is_active);
    if (selected) return selected;
    return db.users.find((u) => u.role === 'ADMIN' && u.is_active) ?? db.users[0];
  }, [activeUserId, db.users]);

  const isTechnicianMode = currentUser.role === 'TECHNICIAN';

  const activeVertical = useMemo(() => {
    return (
      db.vertical_templates.find((v) => v.id === organization.vertical_id) ??
      db.vertical_templates[0]
    );
  }, [db.vertical_templates, organization.vertical_id]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (
      message: string,
      tone: ToastMessage['tone'] = 'success',
      undoAction?: { label: string; onUndo: () => void }
    ) => {
      const id = generateId('toast');
      setToasts((prev) => [
        ...prev.slice(-2),
        {
          id,
          message,
          tone,
          undoLabel: undoAction?.label,
          onUndo: undoAction?.onUndo,
        },
      ]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3200);
    },
    []
  );

  const enqueueSync = useCallback(
    (
      table: EntityTableName,
      recordId: string,
      operation: SyncQueueItem['operation'],
      summary: string
    ) => {
      if (!isOffline) {
        setLastSyncedAt(new Date().toISOString());
        return;
      }
      const item: SyncQueueItem = {
        id: generateId('sync'),
        table,
        record_id: recordId,
        operation,
        summary,
        queued_at: new Date().toISOString(),
      };
      setSyncQueue((prev) => [...prev, item]);
    },
    [isOffline]
  );

  const syncNow = useCallback(async () => {
    if (isSyncing) return;
    if (isOffline) {
      setIsOffline(false);
    }
    setIsSyncing(true);
    await new Promise((resolve) => window.setTimeout(resolve, 750));

    // Promote any local:// job_media paths to synced storage:// paths (TC-12)
    let uploadedPhotos = 0;
    setDb((prev) => {
      const updatedMedia = prev.job_media.map((m) => {
        if (m.storage_path.startsWith('local://')) {
          uploadedPhotos += 1;
          return {
            ...m,
            storage_path: `storage://job-media/${m.organization_id}/${m.job_id}/${m.id}.jpg`,
            updated_at: new Date().toISOString(),
          };
        }
        return m;
      });
      return { ...prev, job_media: updatedMedia };
    });

    const syncedCount = syncQueue.length;
    setSyncQueue([]);
    setIsSyncing(false);
    setLastSyncedAt(new Date().toISOString());
    setSyncJustCompleted(true);

    if (syncedCount > 0 || uploadedPhotos > 0) {
      showToast(
        `Sincronização concluída (${syncedCount} alterações${
          uploadedPhotos > 0 ? ` • ${uploadedPhotos} foto(s) enviadas` : ''
        }).`,
        'success'
      );
    } else {
      showToast('Tudo sincronizado.', 'success');
    }

    window.setTimeout(() => {
      setSyncJustCompleted(false);
    }, 2200);
  }, [isOffline, isSyncing, showToast, syncQueue.length]);

  const toggleOffline = useCallback(() => {
    if (isOffline) {
      void syncNow();
    } else {
      setIsOffline(true);
      showToast('Modo Offline ativo — alterações guardadas localmente.', 'warning');
    }
  }, [isOffline, showToast, syncNow]);

  const resetDemoData = useCallback(() => {
    const fresh = createInitialSeedDatabase();
    setDb(fresh);
    setSyncQueue([]);
    setIsOffline(false);
    setLastSyncedAt(new Date().toISOString());
    showToast('Dados de demonstração repostos com sucesso.', 'info');
  }, [showToast]);

  // --- Organization & Vertical ---
  const updateOrganization = useCallback(
    (patch: Partial<Organization>) => {
      const nowIso = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        organizations: prev.organizations.map((org, idx) =>
          idx === 0 ? { ...org, ...patch, updated_at: nowIso } : org
        ),
      }));
      enqueueSync('organizations', organization.id, 'UPDATE', 'Definições da empresa');
      showToast('Definições da empresa guardadas.', 'success');
    },
    [enqueueSync, organization.id, showToast]
  );

  const switchVertical = useCallback(
    (verticalId: string, loadDefaultServices: boolean) => {
      const targetVertical = db.vertical_templates.find((v) => v.id === verticalId);
      if (!targetVertical) return;
      const nowIso = new Date().toISOString();

      setDb((prev) => {
        const nextOrgs = prev.organizations.map((org, idx) =>
          idx === 0 ? { ...org, vertical_id: verticalId, updated_at: nowIso } : org
        );

        let nextCatalog = prev.service_catalog;
        if (loadDefaultServices) {
          const existingNames = new Set(
            prev.service_catalog.filter((c) => !c.deleted_at).map((c) => c.name.toLowerCase())
          );
          const additions: ServiceCatalogItem[] = targetVertical.default_services
            .filter((s) => !existingNames.has(s.name.toLowerCase()))
            .map((s) => ({
              id: generateId('cat'),
              organization_id: organization.id,
              name: s.name,
              description: s.description,
              unit: s.unit,
              unit_price: s.unit_price,
              cost_price: s.cost_price,
              vat_rate: s.vat_rate,
              created_at: nowIso,
              updated_at: nowIso,
              deleted_at: null,
            }));
          nextCatalog = [...prev.service_catalog, ...additions];
        }

        return {
          ...prev,
          organizations: nextOrgs,
          service_catalog: nextCatalog,
        };
      });

      enqueueSync('organizations', organization.id, 'UPDATE', `Vertical: ${targetVertical.name}`);
      showToast(`Vertical alterada para ${targetVertical.name}.`, 'success');
    },
    [db.vertical_templates, enqueueSync, organization.id, showToast]
  );

  // --- Leads ---
  const createLead = useCallback(
    (input: CreateLeadInput): Lead => {
      const nowIso = new Date().toISOString();
      const newLead: Lead = {
        id: generateId('lead'),
        organization_id: organization.id,
        name: input.name.trim(),
        phone: input.phone.trim(),
        email: input.email?.trim() || null,
        address: input.address?.trim() || null,
        description: input.description?.trim() || null,
        source: input.source,
        status: 'NEW',
        lost_reason: null,
        photo_urls: input.photo_urls ?? [],
        gdpr_consent: input.gdpr_consent,
        gdpr_consent_at: input.gdpr_consent ? nowIso : null,
        created_at: nowIso,
        updated_at: nowIso,
        deleted_at: null,
      };

      setDb((prev) => ({
        ...prev,
        leads: [newLead, ...prev.leads],
      }));
      enqueueSync('leads', newLead.id, 'CREATE', `Novo lead: ${newLead.name}`);
      return newLead;
    },
    [enqueueSync, organization.id]
  );

  const updateLeadStatus = useCallback(
    (
      leadId: string,
      status: LeadStatus,
      lostReason?: string | null
    ): { ok: boolean; error?: string } => {
      // TC-05: Block marking lead as LOST without a lost_reason
      if (status === 'LOST' && (!lostReason || lostReason.trim().length === 0)) {
        return {
          ok: false,
          error: 'É obrigatório selecionar um motivo de perda antes de guardar.',
        };
      }

      const now = new Date();
      const nowIso = now.toISOString();
      setDb((prev) => ({
        ...prev,
        leads: prev.leads.map((lead) =>
          lead.id === leadId
            ? {
                ...lead,
                status,
                lost_reason: status === 'LOST' ? (lostReason ?? null) : null,
                next_followup_at:
                  status === 'QUOTE_SENT'
                    ? addDays(now, 3).toISOString()
                    : status === 'WON' || status === 'LOST'
                      ? null
                      : lead.next_followup_at ?? null,
                updated_at: nowIso,
              }
            : lead
        ),
      }));
      enqueueSync('leads', leadId, 'UPDATE', `Estado do lead → ${status}`);
      return { ok: true };
    },
    [enqueueSync]
  );

  const logLeadFollowupSent = useCallback(
    (leadId: string) => {
      const now = new Date();
      const nowIso = now.toISOString();
      const nextFollowupIso = addDays(now, 3).toISOString();
      setDb((prev) => ({
        ...prev,
        leads: prev.leads.map((lead) =>
          lead.id === leadId
            ? {
                ...lead,
                next_followup_at: nextFollowupIso,
                updated_at: nowIso,
              }
            : lead
        ),
      }));
      enqueueSync('leads', leadId, 'UPDATE', 'Follow-up enviado (+3 dias)');
      showToast(
        'Lembrete enviado! Próximo acompanhamento agendado para daqui a 3 dias.',
        'success'
      );
    },
    [enqueueSync, showToast]
  );

  const convertLeadToClient = useCallback(
    (leadId: string): { client: Client; asset: ServiceAsset } | null => {
      const lead = db.leads.find((l) => l.id === leadId && !l.deleted_at);
      if (!lead) return null;

      // Return existing client & asset if already converted
      const existingClient = db.clients.find((c) => c.lead_id === leadId && !c.deleted_at);
      if (existingClient) {
        const existingAsset = db.service_assets.find(
          (a) => a.client_id === existingClient.id && !a.deleted_at
        );
        if (existingAsset) {
          if (lead.status !== 'WON') {
            updateLeadStatus(leadId, 'WON');
          }
          return { client: existingClient, asset: existingAsset };
        }
      }

      const nowIso = new Date().toISOString();
      const newClient: Client = {
        id: generateId('cli'),
        organization_id: organization.id,
        lead_id: lead.id,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        nif: null,
        billing_address: lead.address,
        notes: lead.description,
        is_anonymized: false,
        created_at: nowIso,
        updated_at: nowIso,
        deleted_at: null,
      };

      const defaultAssetName =
        activeVertical.slug === 'piscinas' ? 'Piscina Principal' : 'Jardim Principal';

      const newAsset: ServiceAsset = {
        id: generateId('asset'),
        organization_id: organization.id,
        client_id: newClient.id,
        name: defaultAssetName,
        address: lead.address || 'Braga, Portugal',
        latitude: null,
        longitude: null,
        access_notes: null,
        custom_attributes: {},
        created_at: nowIso,
        updated_at: nowIso,
        deleted_at: null,
      };

      setDb((prev) => ({
        ...prev,
        leads: prev.leads.map((l) =>
          l.id === leadId ? { ...l, status: 'WON', updated_at: nowIso } : l
        ),
        clients: [newClient, ...prev.clients],
        service_assets: [newAsset, ...prev.service_assets],
        quotes: prev.quotes.map((q) =>
          q.lead_id === leadId && !q.client_id
            ? { ...q, client_id: newClient.id, updated_at: nowIso }
            : q
        ),
      }));

      enqueueSync('clients', newClient.id, 'CREATE', `Lead convertido: ${newClient.name}`);
      enqueueSync('service_assets', newAsset.id, 'CREATE', `Ativo criado: ${newAsset.name}`);
      showToast(`${newClient.name} convertido em Cliente + Ativo.`, 'success');
      return { client: newClient, asset: newAsset };
    },
    [
      activeVertical.slug,
      db.clients,
      db.leads,
      db.service_assets,
      enqueueSync,
      organization.id,
      showToast,
      updateLeadStatus,
    ]
  );

  // --- Clients & Service Assets ---
  const createClient = useCallback(
    (input: CreateClientInput): Client => {
      const nowIso = new Date().toISOString();
      const newClient: Client = {
        id: generateId('cli'),
        organization_id: organization.id,
        lead_id: null,
        name: input.name.trim(),
        phone: input.phone.trim(),
        email: input.email?.trim() || null,
        nif: input.nif?.trim() || null,
        billing_address: input.billing_address?.trim() || null,
        notes: input.notes?.trim() || null,
        is_anonymized: false,
        created_at: nowIso,
        updated_at: nowIso,
        deleted_at: null,
      };
      setDb((prev) => ({
        ...prev,
        clients: [newClient, ...prev.clients],
      }));
      enqueueSync('clients', newClient.id, 'CREATE', `Novo cliente: ${newClient.name}`);
      showToast('Cliente adicionado com sucesso.', 'success');
      return newClient;
    },
    [enqueueSync, organization.id, showToast]
  );

  const updateClient = useCallback(
    (clientId: string, patch: Partial<CreateClientInput>) => {
      const nowIso = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        clients: prev.clients.map((c) =>
          c.id === clientId ? { ...c, ...patch, updated_at: nowIso } : c
        ),
      }));
      enqueueSync('clients', clientId, 'UPDATE', 'Ficha de cliente atualizada');
      showToast('Dados do cliente atualizados.', 'success');
    },
    [enqueueSync, showToast]
  );

  const anonymizeClient = useCallback(
    (clientId: string) => {
      // TC-14: Wipe PII while preserving all transactions for accounting integrity
      const nowIso = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        clients: prev.clients.map((c) =>
          c.id === clientId
            ? {
                ...c,
                name: 'Cliente Anonimizado',
                phone: '000000000',
                email: null,
                nif: null,
                billing_address: null,
                notes: null,
                is_anonymized: true,
                updated_at: nowIso,
              }
            : c
        ),
        service_assets: prev.service_assets.map((a) =>
          a.client_id === clientId
            ? {
                ...a,
                address: 'Morada Anonimizada (RGPD)',
                access_notes: null,
                latitude: null,
                longitude: null,
                updated_at: nowIso,
              }
            : a
        ),
      }));
      enqueueSync('clients', clientId, 'UPDATE', 'Anonimização RGPD executada');
      showToast('Cliente anonimizado (RGPD). Histórico financeiro preservado.', 'warning');
    },
    [enqueueSync, showToast]
  );

  const upsertServiceAsset = useCallback(
    (input: UpsertAssetInput): ServiceAsset => {
      const nowIso = new Date().toISOString();
      if (input.id) {
        let updatedAsset: ServiceAsset | null = null;
        setDb((prev) => ({
          ...prev,
          service_assets: prev.service_assets.map((a) => {
            if (a.id === input.id) {
              updatedAsset = {
                ...a,
                name: input.name.trim(),
                address: input.address.trim(),
                access_notes: input.access_notes?.trim() || null,
                custom_attributes: input.custom_attributes,
                updated_at: nowIso,
              };
              return updatedAsset;
            }
            return a;
          }),
        }));
        enqueueSync('service_assets', input.id, 'UPDATE', `Ativo atualizado: ${input.name}`);
        showToast('Ativo / local atualizado.', 'success');
        return (
          updatedAsset ?? {
            id: input.id,
            organization_id: organization.id,
            client_id: input.client_id,
            name: input.name,
            address: input.address,
            latitude: null,
            longitude: null,
            access_notes: input.access_notes ?? null,
            custom_attributes: input.custom_attributes,
            created_at: nowIso,
            updated_at: nowIso,
            deleted_at: null,
          }
        );
      }

      const created: ServiceAsset = {
        id: generateId('asset'),
        organization_id: organization.id,
        client_id: input.client_id,
        name: input.name.trim(),
        address: input.address.trim(),
        latitude: null,
        longitude: null,
        access_notes: input.access_notes?.trim() || null,
        custom_attributes: input.custom_attributes,
        created_at: nowIso,
        updated_at: nowIso,
        deleted_at: null,
      };
      setDb((prev) => ({
        ...prev,
        service_assets: [created, ...prev.service_assets],
      }));
      enqueueSync('service_assets', created.id, 'CREATE', `Novo ativo: ${created.name}`);
      showToast('Ativo / local adicionado.', 'success');
      return created;
    },
    [enqueueSync, organization.id, showToast]
  );

  const softDeleteAsset = useCallback(
    (assetId: string) => {
      const nowIso = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        service_assets: prev.service_assets.map((a) =>
          a.id === assetId ? { ...a, deleted_at: nowIso, updated_at: nowIso } : a
        ),
      }));
      enqueueSync('service_assets', assetId, 'DELETE', 'Ativo removido');
      showToast('Ativo removido.', 'info', {
        label: 'Desfazer',
        onUndo: () => {
          setDb((prev) => ({
            ...prev,
            service_assets: prev.service_assets.map((a) =>
              a.id === assetId
                ? { ...a, deleted_at: null, updated_at: new Date().toISOString() }
                : a
            ),
          }));
        },
      });
    },
    [enqueueSync, showToast]
  );

  // --- Catalog & Quotes ---
  const upsertCatalogItem = useCallback(
    (input: UpsertCatalogInput): ServiceCatalogItem => {
      const nowIso = new Date().toISOString();
      if (input.id) {
        const updated: ServiceCatalogItem = {
          id: input.id,
          organization_id: organization.id,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          unit: input.unit,
          unit_price: input.unit_price,
          cost_price: input.cost_price,
          vat_rate: input.vat_rate,
          created_at: nowIso,
          updated_at: nowIso,
          deleted_at: null,
        };
        setDb((prev) => ({
          ...prev,
          service_catalog: prev.service_catalog.map((c) =>
            c.id === input.id ? { ...updated, created_at: c.created_at } : c
          ),
        }));
        enqueueSync('service_catalog', input.id, 'UPDATE', `Catálogo: ${input.name}`);
        showToast('Serviço atualizado no catálogo.', 'success');
        return updated;
      }

      const created: ServiceCatalogItem = {
        id: generateId('cat'),
        organization_id: organization.id,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        unit: input.unit,
        unit_price: input.unit_price,
        cost_price: input.cost_price,
        vat_rate: input.vat_rate,
        created_at: nowIso,
        updated_at: nowIso,
        deleted_at: null,
      };
      setDb((prev) => ({
        ...prev,
        service_catalog: [created, ...prev.service_catalog],
      }));
      enqueueSync('service_catalog', created.id, 'CREATE', `Novo serviço: ${created.name}`);
      showToast('Serviço adicionado ao catálogo.', 'success');
      return created;
    },
    [enqueueSync, organization.id, showToast]
  );

  const softDeleteCatalogItem = useCallback(
    (itemId: string) => {
      const nowIso = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        service_catalog: prev.service_catalog.map((c) =>
          c.id === itemId ? { ...c, deleted_at: nowIso, updated_at: nowIso } : c
        ),
      }));
      enqueueSync('service_catalog', itemId, 'DELETE', 'Serviço removido do catálogo');
      showToast('Serviço removido do catálogo.', 'info', {
        label: 'Desfazer',
        onUndo: () => {
          setDb((prev) => ({
            ...prev,
            service_catalog: prev.service_catalog.map((c) =>
              c.id === itemId
                ? { ...c, deleted_at: null, updated_at: new Date().toISOString() }
                : c
            ),
          }));
        },
      });
    },
    [enqueueSync, showToast]
  );

  const createQuote = useCallback(
    (input: CreateQuoteInput): Quote => {
      const nowIso = new Date().toISOString();
      const year = new Date().getFullYear();
      const seq = String(db.quotes.length + 12).padStart(3, '0');
      const selectedPkg =
        input.packages && input.packages.length > 0
          ? input.packages.find((p) => p.id === input.selected_package_id) ??
            input.packages.find((p) => p.recommended) ??
            input.packages[0]
          : null;

      const totals = selectedPkg
        ? {
            items: selectedPkg.items,
            subtotal: selectedPkg.subtotal,
            vat_total: selectedPkg.vat_total,
            total: selectedPkg.total,
          }
        : calculateQuoteTotals(input.items);

      const newQuote: Quote = {
        id: generateId('quote'),
        organization_id: organization.id,
        lead_id: input.lead_id ?? null,
        client_id: input.client_id ?? null,
        public_token: generatePublicToken(),
        quote_number: `ORC-${year}-${seq}`,
        status: input.status ?? 'DRAFT',
        items: totals.items,
        subtotal: totals.subtotal,
        vat_total: totals.vat_total,
        total: totals.total,
        valid_until: input.valid_until,
        approved_at: input.status === 'APPROVED' ? nowIso : null,
        approved_ip: null,
        packages: input.packages && input.packages.length > 0 ? input.packages : undefined,
        selected_package_id: selectedPkg?.id ?? null,
        deposit_pct: input.deposit_pct ?? null,
        deposit_paid: false,
        is_recurring: Boolean(input.is_recurring),
        recurrence_frequency: input.is_recurring
          ? (input.recurrence_frequency ?? 'MONTHLY')
          : null,
        next_billing_date: input.is_recurring
          ? (input.next_billing_date ?? format(new Date(), 'yyyy-MM-dd'))
          : null,
        auto_invoice_active: Boolean(input.is_recurring && (input.auto_invoice_active ?? true)),
        generated_invoices_count: 0,
        last_invoiced_at: null,
        created_at: nowIso,
        updated_at: nowIso,
        deleted_at: null,
      };

      setDb((prev) => ({
        ...prev,
        quotes: [newQuote, ...prev.quotes],
        leads:
          newQuote.status === 'SENT' && newQuote.lead_id
            ? prev.leads.map((l) =>
                l.id === newQuote.lead_id
                  ? { ...l, status: 'QUOTE_SENT', updated_at: nowIso }
                  : l
              )
            : prev.leads,
      }));
      enqueueSync('quotes', newQuote.id, 'CREATE', `Orçamento ${newQuote.quote_number}`);
      showToast(
        newQuote.is_recurring
          ? `Contrato recorrente ${newQuote.quote_number} configurado.`
          : `Orçamento ${newQuote.quote_number} guardado.`,
        'success'
      );
      return newQuote;
    },
    [db.quotes.length, enqueueSync, organization.id, showToast]
  );

  const configureQuoteRecurrence = useCallback(
    (quoteId: string, frequency: RecurrenceBillingFrequency, nextBillingDate: string) => {
      const nowIso = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        quotes: prev.quotes.map((q) =>
          q.id === quoteId
            ? {
                ...q,
                is_recurring: true,
                recurrence_frequency: frequency,
                next_billing_date: nextBillingDate,
                auto_invoice_active: true,
                updated_at: nowIso,
              }
            : q
        ),
      }));
      enqueueSync('quotes', quoteId, 'UPDATE', `Recorrência configurada (${frequency})`);
      showToast('Orçamento configurado como contrato recorrente ativo.', 'success');
    },
    [enqueueSync, showToast]
  );

  const toggleQuoteAutoInvoice = useCallback(
    (quoteId: string, active: boolean) => {
      const nowIso = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        quotes: prev.quotes.map((q) =>
          q.id === quoteId ? { ...q, auto_invoice_active: active, updated_at: nowIso } : q
        ),
      }));
      enqueueSync(
        'quotes',
        quoteId,
        'UPDATE',
        active ? 'Faturação automática ativada' : 'Faturação automática pausada'
      );
      showToast(
        active
          ? 'Faturação automática ativada para este contrato.'
          : 'Faturação automática pausada.',
        'info'
      );
    },
    [enqueueSync, showToast]
  );

  const generateAutoInvoiceFromQuote = useCallback(
    (quoteId: string) => {
      const target = db.quotes.find((q) => q.id === quoteId && !q.deleted_at);
      if (!target) return null;

      const now = new Date();
      const nowIso = now.toISOString();
      const issueDate = format(now, 'yyyy-MM-dd');
      const year = now.getFullYear();
      const existingInvoices = db.transactions.filter(
        (t) => t.external_invoice_id && t.external_invoice_id.startsWith(`FAT-${year}-`)
      ).length;
      const invoiceNumber = `FAT-${year}-${String(existingInvoices + 101).padStart(3, '0')}`;

      const client = target.client_id
        ? db.clients.find((c) => c.id === target.client_id)
        : null;

      const baseDate = target.next_billing_date
        ? parseISO(target.next_billing_date)
        : now;
      const freq = target.recurrence_frequency ?? 'MONTHLY';
      const nextDateObj =
        freq === 'WEEKLY'
          ? addWeeks(baseDate, 1)
          : freq === 'BIWEEKLY'
            ? addWeeks(baseDate, 2)
            : freq === 'QUARTERLY'
              ? addMonths(baseDate, 3)
              : addMonths(baseDate, 1);
      const nextBillingDate = format(nextDateObj, 'yyyy-MM-dd');

      const tx: Transaction = {
        id: generateId('tx'),
        organization_id: organization.id,
        job_id: null,
        client_id: target.client_id,
        type: 'INCOME',
        category: 'SERVICE_PAYMENT',
        amount: target.total,
        payment_method: 'TRANSFER',
        transaction_date: issueDate,
        description: `Fatura automática ${invoiceNumber} (${target.quote_number})${
          client ? ` — ${client.name}` : ''
        }`,
        receipt_path: null,
        external_payment_id: null,
        external_invoice_id: invoiceNumber,
        created_at: nowIso,
        updated_at: nowIso,
        deleted_at: null,
      };

      const updatedQuote: Quote = {
        ...target,
        next_billing_date: nextBillingDate,
        generated_invoices_count: (target.generated_invoices_count ?? 0) + 1,
        last_invoiced_at: nowIso,
        updated_at: nowIso,
      };

      setDb((prev) => ({
        ...prev,
        quotes: prev.quotes.map((q) => (q.id === target.id ? updatedQuote : q)),
        transactions: [tx, ...prev.transactions],
      }));

      enqueueSync('transactions', tx.id, 'CREATE', `Fatura automática ${invoiceNumber}`);
      enqueueSync('quotes', target.id, 'UPDATE', `Próxima faturação: ${nextBillingDate}`);
      showToast(
        `Fatura ${invoiceNumber} gerada (${target.total.toFixed(2).replace('.', ',')} €) e lançada nas Finanças.`,
        'success'
      );

      return {
        invoiceNumber,
        issueDate,
        transaction: tx,
        quote: updatedQuote,
      };
    },
    [db.clients, db.quotes, db.transactions, enqueueSync, organization.id, showToast]
  );

  const updateQuoteStatus = useCallback(
    (quoteId: string, status: QuoteStatus) => {
      const nowIso = new Date().toISOString();
      setDb((prev) => {
        const target = prev.quotes.find((q) => q.id === quoteId);
        return {
          ...prev,
          quotes: prev.quotes.map((q) =>
            q.id === quoteId ? { ...q, status, updated_at: nowIso } : q
          ),
          leads:
            status === 'SENT' && target?.lead_id
              ? prev.leads.map((l) =>
                  l.id === target.lead_id && (l.status === 'NEW' || l.status === 'VISIT_SCHEDULED')
                    ? { ...l, status: 'QUOTE_SENT', updated_at: nowIso }
                    : l
                )
              : prev.leads,
        };
      });
      enqueueSync('quotes', quoteId, 'UPDATE', `Orçamento → ${status}`);
    },
    [enqueueSync]
  );

  const approveQuoteByToken = useCallback(
    (
      token: string,
      selectedPackageId?: string | null
    ): { ok: boolean; error?: string; quote?: Quote } => {
      const target = db.quotes.find((q) => q.public_token === token && !q.deleted_at);
      if (!target) {
        return { ok: false, error: 'Orçamento não encontrado.' };
      }
      // TC-09: Reject if already approved/rejected or expired
      if (target.status !== 'SENT') {
        return {
          ok: false,
          error:
            target.status === 'APPROVED'
              ? 'Este orçamento já foi aprovado anteriormente.'
              : 'Este orçamento não está disponível para aprovação.',
        };
      }
      if (isQuoteExpired(target.valid_until)) {
        return {
          ok: false,
          error: 'A validade deste orçamento já expirou. Contacte a empresa para renovação.',
        };
      }

      const chosenPkg =
        selectedPackageId && target.packages
          ? target.packages.find((p) => p.id === selectedPackageId)
          : null;

      const nowIso = new Date().toISOString();
      const approvedQuote: Quote = {
        ...target,
        items: chosenPkg ? chosenPkg.items : target.items,
        subtotal: chosenPkg ? chosenPkg.subtotal : target.subtotal,
        vat_total: chosenPkg ? chosenPkg.vat_total : target.vat_total,
        total: chosenPkg ? chosenPkg.total : target.total,
        selected_package_id: chosenPkg ? chosenPkg.id : (target.selected_package_id ?? null),
        status: 'APPROVED',
        approved_at: nowIso,
        approved_ip: '85.242.194.18',
        updated_at: nowIso,
      };

      // TC-08: Update quote to APPROVED and linked lead to WON
      setDb((prev) => ({
        ...prev,
        quotes: prev.quotes.map((q) => (q.id === target.id ? approvedQuote : q)),
        leads: target.lead_id
          ? prev.leads.map((l) =>
              l.id === target.lead_id ? { ...l, status: 'WON', updated_at: nowIso } : l
            )
          : prev.leads,
      }));
      enqueueSync('quotes', target.id, 'UPDATE', `Aprovado pelo cliente: ${target.quote_number}`);
      return { ok: true, quote: approvedQuote };
    },
    [db.quotes, enqueueSync]
  );

  // --- Jobs & Media ---
  const createJob = useCallback(
    (input: CreateJobInput): { parent: Job; createdCount: number } => {
      const nowIso = new Date().toISOString();
      const parentId = generateId('job');
      const userId = input.assigned_user_id ?? currentUser.id ?? db.users[0]?.id ?? null;

      const buildChecklist = (prefix: string): ChecklistItem[] =>
        activeVertical.default_checklists.map((label, idx) => ({
          id: `${prefix}-chk-${idx}`,
          label,
          done: false,
        }));

      const parentJob: Job = {
        id: parentId,
        organization_id: organization.id,
        client_id: input.client_id,
        asset_id: input.asset_id,
        quote_id: input.quote_id ?? null,
        assigned_user_id: userId,
        title: input.title.trim(),
        status: 'SCHEDULED',
        scheduled_start: input.scheduled_start,
        scheduled_end: input.scheduled_end,
        recurrence_rule: input.recurrence_rule || null,
        parent_job_id: null,
        checkin_at: null,
        checkout_at: null,
        checklist: buildChecklist(parentId),
        next_visit_notes: input.next_visit_notes?.trim() || null,
        price: input.price,
        payment_status: 'PENDING',
        created_at: nowIso,
        updated_at: nowIso,
        deleted_at: null,
      };

      // TC-10: Materialize 90-day recurring occurrences linked to parent_job_id
      const childJobs: Job[] = input.recurrence_rule
        ? generateRecurrenceOccurrences(
            input.scheduled_start,
            input.scheduled_end,
            input.recurrence_rule,
            90
          ).map((occ, idx) => {
            const childId = generateId('job');
            return {
              ...parentJob,
              id: childId,
              scheduled_start: occ.scheduled_start,
              scheduled_end: occ.scheduled_end,
              parent_job_id: parentId,
              checklist: buildChecklist(`${childId}-${idx}`),
            };
          })
        : [];

      const allNew = [parentJob, ...childJobs];

      setDb((prev) => ({
        ...prev,
        jobs: [...prev.jobs, ...allNew],
      }));
      enqueueSync(
        'jobs',
        parentId,
        'CREATE',
        childJobs.length > 0
          ? `Visita recorrente (${allNew.length} ocorrências / 90 dias)`
          : `Nova visita: ${parentJob.title}`
      );
      showToast(
        childJobs.length > 0
          ? `Agendadas ${allNew.length} visitas recorrentes para os próximos 90 dias.`
          : 'Visita agendada com sucesso.',
        'success'
      );

      // Dispatch Service Worker Push Notification if the new visit is scheduled for today
      const pushPrefs = loadPushPreferences();
      if (
        pushPrefs.enabled &&
        pushPrefs.dailyVisitsAlert &&
        isSameDay(parseISO(parentJob.scheduled_start), startOfDay(new Date()))
      ) {
        const clientName =
          db.clients.find((c) => c.id === parentJob.client_id)?.name ?? 'Cliente';
        void dispatchServiceWorkerNotification({
          title: 'Nova visita agendada para hoje',
          body: `${clientName} — ${parentJob.title} às ${format(
            parseISO(parentJob.scheduled_start),
            'HH:mm'
          )}.`,
          tag: `zelvo-job-${parentJob.id}`,
          tab: 'today',
        });
      }

      return { parent: parentJob, createdCount: allNew.length };
    },
    [
      activeVertical.default_checklists,
      db.clients,
      db.users,
      enqueueSync,
      organization.id,
      showToast,
    ]
  );

  const startJob = useCallback(
    (jobId: string) => {
      const nowIso = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        jobs: prev.jobs.map((j) =>
          j.id === jobId
            ? {
                ...j,
                status: 'IN_PROGRESS',
                checkin_at: j.checkin_at ?? nowIso,
                updated_at: nowIso,
              }
            : j
        ),
      }));
      enqueueSync('jobs', jobId, 'UPDATE', 'Check-in de visita');
    },
    [enqueueSync]
  );

  const updateJobExecution = useCallback(
    (
      jobId: string,
      patch: {
        checklist?: ChecklistItem[];
        next_visit_notes?: string | null;
        assigned_user_id?: string | null;
      }
    ) => {
      const nowIso = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        jobs: prev.jobs.map((j) =>
          j.id === jobId ? { ...j, ...patch, updated_at: nowIso } : j
        ),
      }));
      enqueueSync('jobs', jobId, 'UPDATE', 'Progresso de visita guardado');
    },
    [enqueueSync]
  );

  const completeJob = useCallback(
    (jobId: string, nextVisitNotes?: string | null) => {
      const nowIso = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        jobs: prev.jobs.map((j) =>
          j.id === jobId
            ? {
                ...j,
                status: 'COMPLETED',
                checkout_at: nowIso,
                next_visit_notes:
                  nextVisitNotes !== undefined ? nextVisitNotes : j.next_visit_notes,
                updated_at: nowIso,
              }
            : j
        ),
      }));
      enqueueSync('jobs', jobId, 'UPDATE', 'Check-out de visita concluído');
      showToast('Serviço concluído (Check-out registado).', 'success');
    },
    [enqueueSync, showToast]
  );

  const addJobMedia = useCallback(
    (jobId: string, mediaType: MediaType, dataUrl: string, sizeKb: number): JobMedia => {
      const nowIso = new Date().toISOString();
      const id = generateId('media');
      // TC-11: Local path when offline, remote path when online
      const storagePath = isOffline
        ? `local://job-media/${jobId}/${id}.jpg`
        : `storage://job-media/${organization.id}/${jobId}/${id}.jpg`;

      const media: JobMedia = {
        id,
        organization_id: organization.id,
        job_id: jobId,
        media_type: mediaType,
        storage_path: storagePath,
        data_url: dataUrl,
        size_kb: sizeKb,
        taken_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
        deleted_at: null,
      };

      setDb((prev) => ({
        ...prev,
        job_media: [...prev.job_media, media],
      }));
      enqueueSync('job_media', id, 'CREATE', `Foto ${mediaType} (${sizeKb} KB)`);
      showToast(`Foto guardada e comprimida (${sizeKb} KB).`, 'success');
      return media;
    },
    [enqueueSync, isOffline, organization.id, showToast]
  );

  const softDeleteJobMedia = useCallback(
    (mediaId: string) => {
      const nowIso = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        job_media: prev.job_media.map((m) =>
          m.id === mediaId ? { ...m, deleted_at: nowIso, updated_at: nowIso } : m
        ),
      }));
      enqueueSync('job_media', mediaId, 'DELETE', 'Foto removida');
    },
    [enqueueSync]
  );

  // --- Transactions ---
  const createTransaction = useCallback(
    (input: CreateTransactionInput): Transaction => {
      const nowIso = new Date().toISOString();
      const tx: Transaction = {
        id: generateId('tx'),
        organization_id: organization.id,
        job_id: input.job_id ?? null,
        client_id: input.client_id ?? null,
        type: input.type,
        category: input.category,
        amount: input.amount,
        payment_method: input.payment_method,
        transaction_date: input.transaction_date,
        description: input.description?.trim() || null,
        receipt_path: input.receipt_path ?? null,
        external_payment_id: input.external_payment_id ?? null,
        external_invoice_id: null,
        created_at: nowIso,
        updated_at: nowIso,
        deleted_at: null,
      };

      setDb((prev) => ({
        ...prev,
        transactions: [tx, ...prev.transactions],
        jobs: input.job_id
          ? prev.jobs.map((j) =>
              j.id === input.job_id
                ? {
                    ...j,
                    payment_status: input.amount >= j.price ? 'PAID' : 'PARTIAL',
                    updated_at: nowIso,
                  }
                : j
            )
          : prev.jobs,
      }));
      enqueueSync(
        'transactions',
        tx.id,
        'CREATE',
        `${input.type === 'INCOME' ? 'Entrada' : 'Despesa'} €${input.amount.toFixed(2)}`
      );
      showToast(
        input.type === 'INCOME' ? 'Recebimento registado.' : 'Despesa registada.',
        'success'
      );
      return tx;
    },
    [enqueueSync, organization.id, showToast]
  );

  const recordPaymentForJob = useCallback(
    (
      jobId: string,
      amount: number,
      method: PaymentMethod,
      description?: string
    ): Transaction | null => {
      const job = db.jobs.find((j) => j.id === jobId);
      if (!job) return null;
      const client = db.clients.find((c) => c.id === job.client_id);
      const todayStr = new Date().toISOString().slice(0, 10);

      return createTransaction({
        job_id: job.id,
        client_id: job.client_id,
        type: 'INCOME',
        category: 'SERVICE_PAYMENT',
        amount,
        payment_method: method,
        transaction_date: todayStr,
        description: description || `${job.title}${client ? ` — ${client.name}` : ''}`,
      });
    },
    [createTransaction, db.clients, db.jobs]
  );

  // --- Phase 2 & 3: Payment Webhook Simulator, AT Invoice, Dunning & Retainers ---
  const simulatePaymentWebhook = useCallback(
    (params: {
      jobId?: string | null;
      quoteId?: string | null;
      amount: number;
      method: PaymentMethod;
      reference?: string;
      selectedPackageId?: string | null;
    }): Transaction | null => {
      const nowIso = new Date().toISOString();
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const prefix =
        params.method === 'MBWAY'
          ? 'MBW'
          : params.method === 'MULTIBANCO'
            ? 'MB11249'
            : 'CARD';
      const externalPaymentId =
        params.reference || `${prefix}-${Date.now().toString().slice(-6)}`;

      const job = params.jobId ? db.jobs.find((j) => j.id === params.jobId) : null;
      const quote = params.quoteId ? db.quotes.find((q) => q.id === params.quoteId) : null;
      const clientId = job?.client_id ?? quote?.client_id ?? null;
      const client = clientId ? db.clients.find((c) => c.id === clientId) : null;

      const tx: Transaction = {
        id: generateId('tx'),
        organization_id: organization.id,
        job_id: job?.id ?? null,
        client_id: clientId,
        type: 'INCOME',
        category: quote ? 'ADVANCE_PAYMENT' : 'SERVICE_PAYMENT',
        amount: Math.round(params.amount * 100) / 100,
        payment_method: params.method,
        transaction_date: todayStr,
        description: quote
          ? `Sinal ${quote.deposit_pct ?? 30}% — ${quote.quote_number}${client ? ` (${client.name})` : ''}`
          : `${job?.title ?? 'Pagamento Online'}${client ? ` — ${client.name}` : ''}`,
        receipt_path: null,
        external_payment_id: externalPaymentId,
        external_invoice_id: null,
        created_at: nowIso,
        updated_at: nowIso,
        deleted_at: null,
      };

      setDb((prev) => ({
        ...prev,
        transactions: [tx, ...prev.transactions],
        jobs: job
          ? prev.jobs.map((j) =>
              j.id === job.id
                ? {
                    ...j,
                    payment_status: 'PAID',
                    dunning_paused: false,
                    updated_at: nowIso,
                  }
                : j
            )
          : prev.jobs,
        quotes: quote
          ? prev.quotes.map((q) => {
              if (q.id !== quote.id) return q;
              const chosenPkg =
                params.selectedPackageId && q.packages
                  ? q.packages.find((p) => p.id === params.selectedPackageId)
                  : null;
              return {
                ...q,
                items: chosenPkg ? chosenPkg.items : q.items,
                subtotal: chosenPkg ? chosenPkg.subtotal : q.subtotal,
                vat_total: chosenPkg ? chosenPkg.vat_total : q.vat_total,
                total: chosenPkg ? chosenPkg.total : q.total,
                selected_package_id: chosenPkg
                  ? chosenPkg.id
                  : (q.selected_package_id ?? null),
                status: 'APPROVED',
                approved_at: q.approved_at ?? nowIso,
                approved_ip: q.approved_ip ?? '85.242.194.18',
                deposit_paid: true,
                updated_at: nowIso,
              };
            })
          : prev.quotes,
        leads:
          quote?.lead_id
            ? prev.leads.map((l) =>
                l.id === quote.lead_id ? { ...l, status: 'WON', updated_at: nowIso } : l
              )
            : prev.leads,
      }));

      enqueueSync('transactions', tx.id, 'CREATE', `Webhook pago ${externalPaymentId}`);
      showToast(
        `Webhook confirmado! Pagamento ${externalPaymentId} (${tx.amount.toFixed(2).replace('.', ',')} €) registado.`,
        'success'
      );

      const prefs = loadPushPreferences();
      if (prefs.enabled) {
        void dispatchServiceWorkerNotification({
          title: `Pagamento Confirmado (${tx.amount.toFixed(2).replace('.', ',')} €)`,
          body: `${tx.description ?? 'Recebimento confirmado'} · Ref. ${externalPaymentId}`,
          tag: `zelvo-pay-${tx.id}`,
          tab: 'finance',
        });
      }

      return tx;
    },
    [db.clients, db.jobs, db.quotes, enqueueSync, organization.id, showToast]
  );

  const issueATInvoice = useCallback(
    (transactionId: string): Transaction | null => {
      const target = db.transactions.find((t) => t.id === transactionId && !t.deleted_at);
      if (!target) return null;
      if (target.external_invoice_id && target.atcud) return target;

      const year = new Date().getFullYear();
      const existingCount = db.transactions.filter(
        (t) => t.external_invoice_id && t.external_invoice_id.startsWith(`FR ${year}/`)
      ).length;
      const seqNum = existingCount + 42;
      const invoiceId = `FR ${year}/${String(seqNum).padStart(3, '0')}`;
      const atcud = `JJ7M4K2P-${seqNum}`;
      const nowIso = new Date().toISOString();

      const updated: Transaction = {
        ...target,
        external_invoice_id: invoiceId,
        atcud,
        invoice_issued_at: nowIso,
        updated_at: nowIso,
      };

      setDb((prev) => ({
        ...prev,
        transactions: prev.transactions.map((t) => (t.id === transactionId ? updated : t)),
      }));
      enqueueSync('transactions', transactionId, 'UPDATE', `Fatura-Recibo AT ${invoiceId}`);
      showToast(`Fatura-Recibo certificada ${invoiceId} (ATCUD ${atcud}) emitida.`, 'success');
      return updated;
    },
    [db.transactions, enqueueSync, showToast]
  );

  const advanceDunningStage = useCallback(
    (jobId: string, stage: DunningStage) => {
      const nowIso = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        jobs: prev.jobs.map((j) =>
          j.id === jobId
            ? {
                ...j,
                dunning_stage: stage,
                dunning_last_sent_at: nowIso,
                updated_at: nowIso,
              }
            : j
        ),
      }));
      enqueueSync('jobs', jobId, 'UPDATE', `Régua cobrança → ${stage}`);
    },
    [enqueueSync]
  );

  const togglePauseJobDunning = useCallback(
    (jobId: string, paused: boolean) => {
      const nowIso = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        jobs: prev.jobs.map((j) =>
          j.id === jobId ? { ...j, dunning_paused: paused, updated_at: nowIso } : j
        ),
      }));
      enqueueSync('jobs', jobId, 'UPDATE', paused ? 'Próxima visita pausada' : 'Visitas reativadas');
      showToast(
        paused
          ? 'Próxima visita recorrente deste cliente marcada em pausa por pagamento em atraso.'
          : 'Pausa de cobrança removida.',
        paused ? 'warning' : 'info'
      );
    },
    [enqueueSync, showToast]
  );

  const updateClientRetainer = useCallback(
    (
      clientId: string,
      isRetainer: boolean,
      amount: number | null,
      billingDay: number | null
    ) => {
      const nowIso = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        clients: prev.clients.map((c) =>
          c.id === clientId
            ? {
                ...c,
                is_retainer: isRetainer,
                retainer_amount: isRetainer ? (amount ?? 120) : null,
                retainer_billing_day: isRetainer ? (billingDay ?? 5) : null,
                updated_at: nowIso,
              }
            : c
        ),
      }));
      enqueueSync('clients', clientId, 'UPDATE', isRetainer ? 'Avença mensal ativada' : 'Avença removida');
      showToast(
        isRetainer
          ? 'Avença mensal ativada e somada ao MRR.'
          : 'Avença mensal desativada.',
        'success'
      );
    },
    [enqueueSync, showToast]
  );

  // --- Phase 2: Field Extras, Digital Signature, Material Consumption & Weather Reschedule ---
  const addJobExtra = useCallback(
    (jobId: string, extra: { name: string; qty: number; unit_price: number }) => {
      const nowIso = new Date().toISOString();
      const extraTotal = Math.round(extra.qty * extra.unit_price * 100) / 100;
      const newExtra = {
        id: generateId('ext'),
        name: extra.name.trim(),
        qty: extra.qty,
        unit_price: extra.unit_price,
        total: extraTotal,
      };
      setDb((prev) => ({
        ...prev,
        jobs: prev.jobs.map((j) =>
          j.id === jobId
            ? {
                ...j,
                extras: [...(j.extras ?? []), newExtra],
                price: Math.round((j.price + extraTotal) * 100) / 100,
                updated_at: nowIso,
              }
            : j
        ),
      }));
      enqueueSync('jobs', jobId, 'UPDATE', `Extra adicionado: ${newExtra.name}`);
      showToast(`Extra "${newExtra.name}" (+${extraTotal.toFixed(2).replace('.', ',')} €) adicionado.`, 'success');
    },
    [enqueueSync, showToast]
  );

  const removeJobExtra = useCallback(
    (jobId: string, extraId: string) => {
      const nowIso = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        jobs: prev.jobs.map((j) => {
          if (j.id !== jobId) return j;
          const target = (j.extras ?? []).find((e) => e.id === extraId);
          if (!target) return j;
          return {
            ...j,
            extras: (j.extras ?? []).filter((e) => e.id !== extraId),
            price: Math.max(0, Math.round((j.price - target.total) * 100) / 100),
            updated_at: nowIso,
          };
        }),
      }));
      enqueueSync('jobs', jobId, 'UPDATE', 'Extra removido');
    },
    [enqueueSync]
  );

  const saveJobSignature = useCallback(
    (jobId: string, dataUrl: string | null) => {
      const nowIso = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        jobs: prev.jobs.map((j) =>
          j.id === jobId ? { ...j, signature_data_url: dataUrl, updated_at: nowIso } : j
        ),
      }));
      enqueueSync('jobs', jobId, 'UPDATE', dataUrl ? 'Assinatura digital recolhida' : 'Assinatura limpa');
      if (dataUrl) {
        showToast('Assinatura digital do cliente guardada na visita.', 'success');
      }
    },
    [enqueueSync, showToast]
  );

  const consumeInventoryInJob = useCallback(
    (jobId: string, inventoryItemId: string, qty: number) => {
      const item = db.inventory_items.find((i) => i.id === inventoryItemId && !i.deleted_at);
      if (!item || qty <= 0) return;
      const nowIso = new Date().toISOString();
      const consumedRecord = {
        id: generateId('mat'),
        inventory_item_id: item.id,
        name: item.name,
        qty,
        unit: item.unit,
      };
      const newQty = Math.max(0, Math.round((item.quantity - qty) * 100) / 100);

      setDb((prev) => ({
        ...prev,
        inventory_items: prev.inventory_items.map((i) =>
          i.id === inventoryItemId ? { ...i, quantity: newQty, updated_at: nowIso } : i
        ),
        jobs: prev.jobs.map((j) =>
          j.id === jobId
            ? {
                ...j,
                consumed_materials: [...(j.consumed_materials ?? []), consumedRecord],
                updated_at: nowIso,
              }
            : j
        ),
      }));
      enqueueSync('inventory_items', inventoryItemId, 'UPDATE', `Consumo: -${qty} ${item.unit}`);
      showToast(
        newQty <= item.min_stock
          ? `Baixa de stock (${qty} ${item.unit} de ${item.name}). Atenção: abaixo do stock mínimo!`
          : `Registado consumo de ${qty} ${item.unit} de ${item.name} (stock atualizado).`,
        newQty <= item.min_stock ? 'warning' : 'success'
      );
    },
    [db.inventory_items, enqueueSync, showToast]
  );

  const rescheduleTodayJobsToNextBusinessDay = useCallback(() => {
    const today = startOfDay(new Date());
    let nextBusiness = addDays(today, 1);
    while (isWeekend(nextBusiness)) {
      nextBusiness = addDays(nextBusiness, 1);
    }
    const dayShift = Math.round(
      (nextBusiness.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    const nowIso = new Date().toISOString();
    const targetDateLabel = format(nextBusiness, 'dd/MM/yyyy');

    const todayScheduled = db.jobs.filter(
      (j) =>
        !j.deleted_at &&
        j.status === 'SCHEDULED' &&
        isSameDay(parseISO(j.scheduled_start), today)
    );
    const affectedIds = new Set(todayScheduled.map((j) => j.id));

    const messages = todayScheduled.map((j) => {
      const client = db.clients.find((c) => c.id === j.client_id);
      const timeStr = format(parseISO(j.scheduled_start), 'HH:mm');
      return {
        clientName: client?.name ?? 'Cliente',
        phone: client?.phone ?? organization.phone ?? '914820351',
        text: `Olá ${client?.name ?? ''}, devido ao aviso de chuva intensa hoje, reagendámos a sua visita "${j.title}" para o próximo dia útil (${targetDateLabel}) às ${timeStr}. Obrigado pela compreensão — ${organization.name}.`,
      };
    });

    if (todayScheduled.length > 0) {
      setDb((prev) => ({
        ...prev,
        jobs: prev.jobs.map((j) => {
          if (!affectedIds.has(j.id)) return j;
          const shiftedStart = addDays(parseISO(j.scheduled_start), dayShift).toISOString();
          const shiftedEnd = j.scheduled_end
            ? addDays(parseISO(j.scheduled_end), dayShift).toISOString()
            : null;
          return {
            ...j,
            scheduled_start: shiftedStart,
            scheduled_end: shiftedEnd,
            updated_at: nowIso,
          };
        }),
      }));
      enqueueSync(
        'jobs',
        todayScheduled[0].id,
        'UPDATE',
        `Reagendamento em lote (${todayScheduled.length} visitas → ${targetDateLabel})`
      );
      showToast(
        `${todayScheduled.length} visita(s) reagendada(s) para ${targetDateLabel} devido a chuva intensa.`,
        'warning'
      );
    }

    return {
      movedCount: todayScheduled.length,
      targetDateIso: nextBusiness.toISOString(),
      messages,
    };
  }, [db.clients, db.jobs, enqueueSync, organization.name, organization.phone, showToast]);

  // --- Phase 3: Stock & Equipment ---
  const upsertInventoryItem = useCallback(
    (input: UpsertInventoryInput): InventoryItem => {
      const nowIso = new Date().toISOString();
      if (input.id) {
        const updated: InventoryItem = {
          id: input.id,
          organization_id: organization.id,
          name: input.name.trim(),
          category: input.category,
          quantity: Math.max(0, input.quantity),
          unit: input.unit.trim() || 'un.',
          min_stock: Math.max(0, input.min_stock),
          unit_cost: Math.max(0, input.unit_cost),
          created_at: nowIso,
          updated_at: nowIso,
          deleted_at: null,
        };
        setDb((prev) => ({
          ...prev,
          inventory_items: prev.inventory_items.map((i) =>
            i.id === input.id ? { ...updated, created_at: i.created_at } : i
          ),
        }));
        enqueueSync('inventory_items', input.id, 'UPDATE', `Stock: ${updated.name}`);
        showToast('Item de stock atualizado.', 'success');
        return updated;
      }

      const created: InventoryItem = {
        id: generateId('inv'),
        organization_id: organization.id,
        name: input.name.trim(),
        category: input.category,
        quantity: Math.max(0, input.quantity),
        unit: input.unit.trim() || 'un.',
        min_stock: Math.max(0, input.min_stock),
        unit_cost: Math.max(0, input.unit_cost),
        created_at: nowIso,
        updated_at: nowIso,
        deleted_at: null,
      };
      setDb((prev) => ({
        ...prev,
        inventory_items: [created, ...prev.inventory_items],
      }));
      enqueueSync('inventory_items', created.id, 'CREATE', `Novo insumo: ${created.name}`);
      showToast('Insumo adicionado ao inventário.', 'success');
      return created;
    },
    [enqueueSync, organization.id, showToast]
  );

  const adjustInventoryStock = useCallback(
    (itemId: string, delta: number) => {
      const nowIso = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        inventory_items: prev.inventory_items.map((i) =>
          i.id === itemId
            ? {
                ...i,
                quantity: Math.max(0, Math.round((i.quantity + delta) * 100) / 100),
                updated_at: nowIso,
              }
            : i
        ),
      }));
      enqueueSync('inventory_items', itemId, 'UPDATE', `Ajuste stock (${delta >= 0 ? '+' : ''}${delta})`);
    },
    [enqueueSync]
  );

  const purchaseInventoryItem = useCallback(
    (itemId: string, restockQty: number): Transaction | null => {
      const item = db.inventory_items.find((i) => i.id === itemId && !i.deleted_at);
      if (!item || restockQty <= 0) return null;
      const nowIso = new Date().toISOString();
      const totalCost = Math.round(restockQty * item.unit_cost * 100) / 100;
      const todayStr = format(new Date(), 'yyyy-MM-dd');

      const normalizedCat = item.category.trim().toUpperCase();
      const expenseCategory =
        normalizedCat === 'FUEL' ||
        normalizedCat === 'MAINTENANCE' ||
        normalizedCat === 'EQUIPMENT' ||
        normalizedCat === 'OTHER'
          ? normalizedCat
          : 'MATERIALS';

      const tx: Transaction = {
        id: generateId('tx'),
        organization_id: organization.id,
        job_id: null,
        client_id: null,
        type: 'EXPENSE',
        category: expenseCategory,
        amount: totalCost,
        payment_method: 'CARD',
        transaction_date: todayStr,
        description: `Compra de stock: ${restockQty} ${item.unit} × ${item.name}`,
        receipt_path: null,
        external_payment_id: null,
        external_invoice_id: null,
        created_at: nowIso,
        updated_at: nowIso,
        deleted_at: null,
      };

      setDb((prev) => ({
        ...prev,
        inventory_items: prev.inventory_items.map((i) =>
          i.id === itemId
            ? {
                ...i,
                quantity: Math.round((i.quantity + restockQty) * 100) / 100,
                updated_at: nowIso,
              }
            : i
        ),
        transactions: [tx, ...prev.transactions],
      }));
      enqueueSync('inventory_items', itemId, 'UPDATE', `Reposição +${restockQty} ${item.unit}`);
      enqueueSync('transactions', tx.id, 'CREATE', `Despesa compra stock €${totalCost.toFixed(2)}`);
      showToast(
        `Compra registada! +${restockQty} ${item.unit} em stock e despesa de ${totalCost.toFixed(2).replace('.', ',')} € criada nas Finanças.`,
        'success'
      );
      return tx;
    },
    [db.inventory_items, enqueueSync, organization.id, showToast]
  );

  const upsertEquipment = useCallback(
    (input: UpsertEquipmentInput): EquipmentItem => {
      const nowIso = new Date().toISOString();
      if (input.id) {
        const updated: EquipmentItem = {
          id: input.id,
          organization_id: organization.id,
          name: input.name.trim(),
          brand_model: input.brand_model.trim(),
          serial_or_plate: input.serial_or_plate?.trim() || null,
          hours_used: Math.max(0, input.hours_used),
          next_service_hours: input.next_service_hours ?? null,
          next_service_date: input.next_service_date,
          status: input.status,
          notes: input.notes?.trim() || null,
          created_at: nowIso,
          updated_at: nowIso,
          deleted_at: null,
        };
        setDb((prev) => ({
          ...prev,
          equipment: prev.equipment.map((e) =>
            e.id === input.id ? { ...updated, created_at: e.created_at } : e
          ),
        }));
        enqueueSync('equipment', input.id, 'UPDATE', `Equipamento: ${updated.name}`);
        showToast('Equipamento atualizado.', 'success');
        return updated;
      }

      const created: EquipmentItem = {
        id: generateId('eq'),
        organization_id: organization.id,
        name: input.name.trim(),
        brand_model: input.brand_model.trim(),
        serial_or_plate: input.serial_or_plate?.trim() || null,
        hours_used: Math.max(0, input.hours_used),
        next_service_hours: input.next_service_hours ?? null,
        next_service_date: input.next_service_date,
        status: input.status,
        notes: input.notes?.trim() || null,
        created_at: nowIso,
        updated_at: nowIso,
        deleted_at: null,
      };
      setDb((prev) => ({
        ...prev,
        equipment: [created, ...prev.equipment],
      }));
      enqueueSync('equipment', created.id, 'CREATE', `Novo equipamento: ${created.name}`);
      showToast('Equipamento adicionado à frota.', 'success');
      return created;
    },
    [enqueueSync, organization.id, showToast]
  );

  const logEquipmentService = useCallback(
    (equipmentId: string) => {
      const now = new Date();
      const nowIso = now.toISOString();
      const nextDate = format(addDays(now, 90), 'yyyy-MM-dd');
      setDb((prev) => ({
        ...prev,
        equipment: prev.equipment.map((e) =>
          e.id === equipmentId
            ? {
                ...e,
                status: 'OK',
                next_service_date: nextDate,
                next_service_hours: e.next_service_hours
                  ? e.hours_used + (e.hours_used > 1000 ? 15000 : 50)
                  : null,
                updated_at: nowIso,
              }
            : e
        ),
      }));
      enqueueSync('equipment', equipmentId, 'UPDATE', `Revisão concluída (próx. ${nextDate})`);
      showToast(`Revisão registada! Próxima inspeção agendada para ${nextDate}.`, 'success');
    },
    [enqueueSync, showToast]
  );

  // --- Phase 3: Marketing Referral ("Traga um Vizinho") ---
  const registerClientReferral = useCallback(
    (referrerClientId: string, neighborName: string, neighborPhone: string): Lead | null => {
      const referrer = db.clients.find((c) => c.id === referrerClientId && !c.deleted_at);
      if (!referrer) return null;
      const nowIso = new Date().toISOString();
      const newLead: Lead = {
        id: generateId('lead'),
        organization_id: organization.id,
        name: neighborName.trim(),
        phone: neighborPhone.trim(),
        email: null,
        address: referrer.billing_address ? `Vizinho de ${referrer.name}` : 'Braga',
        description: `Indicação "Traga um Vizinho" por ${referrer.name} (${referrer.referral_code ?? 'ZELVO15'}).`,
        source: 'WHATSAPP',
        status: 'NEW',
        lost_reason: null,
        photo_urls: [],
        gdpr_consent: true,
        gdpr_consent_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
        deleted_at: null,
      };

      setDb((prev) => ({
        ...prev,
        leads: [newLead, ...prev.leads],
        clients: prev.clients.map((c) =>
          c.id === referrerClientId
            ? {
                ...c,
                referral_discount_pct: 15,
                referrals_count: (c.referrals_count ?? 0) + 1,
                updated_at: nowIso,
              }
            : c
        ),
        jobs: prev.jobs.map((j) => {
          // Apply 15% discount automatically to the next upcoming scheduled visit of referrer
          const isNextScheduled =
            j.client_id === referrerClientId &&
            j.status === 'SCHEDULED' &&
            !j.deleted_at;
          if (!isNextScheduled) return j;
          return j;
        }),
      }));

      // Apply 15% discount to the earliest scheduled visit of the referring client if one exists
      setDb((prev) => {
        const upcoming = prev.jobs
          .filter(
            (j) =>
              j.client_id === referrerClientId &&
              j.status === 'SCHEDULED' &&
              !j.deleted_at
          )
          .sort(
            (a, b) =>
              parseISO(a.scheduled_start).getTime() - parseISO(b.scheduled_start).getTime()
          )[0];

        if (!upcoming) return prev;
        const discountedPrice = Math.round(upcoming.price * 0.85 * 100) / 100;
        return {
          ...prev,
          jobs: prev.jobs.map((j) =>
            j.id === upcoming.id
              ? {
                  ...j,
                  price: discountedPrice,
                  next_visit_notes: `${j.next_visit_notes ? `${j.next_visit_notes} · ` : ''}Desconto 15% (Traga um Vizinho: ${neighborName.trim()}) aplicado.`,
                  updated_at: nowIso,
                }
              : j
          ),
        };
      });

      enqueueSync('leads', newLead.id, 'CREATE', `Indicação vizinho: ${newLead.name}`);
      enqueueSync('clients', referrerClientId, 'UPDATE', 'Desconto 15% Traga um Vizinho');
      showToast(
        `Indicação de ${neighborName.trim()} registada! Desconto de 15% aplicado na próxima visita de ${referrer.name}.`,
        'success'
      );
      return newLead;
    },
    [db.clients, enqueueSync, organization.id, showToast]
  );

  const softDeleteTransaction = useCallback(
    (txId: string) => {
      const nowIso = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        transactions: prev.transactions.map((t) =>
          t.id === txId ? { ...t, deleted_at: nowIso, updated_at: nowIso } : t
        ),
      }));
      enqueueSync('transactions', txId, 'DELETE', 'Movimento removido');
      showToast('Movimento removido.', 'info', {
        label: 'Desfazer',
        onUndo: () => {
          setDb((prev) => ({
            ...prev,
            transactions: prev.transactions.map((t) =>
              t.id === txId
                ? { ...t, deleted_at: null, updated_at: new Date().toISOString() }
                : t
            ),
          }));
        },
      });
    },
    [enqueueSync, showToast]
  );

  const createTeamInvitation = useCallback(
    (
      input: CreateTeamInvitationInput
    ): { ok: boolean; error?: string; invitation?: TeamInvitation } => {
      const planMeta = SAAS_PLANS.find((p) => p.id === organization.plan) ?? SAAS_PLANS[0];
      const now = new Date();
      const activeUsersCount = db.users.filter((u) => u.is_active).length;
      const pendingInvitesCount = db.team_invitations.filter(
        (inv) => inv.status === 'PENDING' && !isBefore(parseISO(inv.expires_at), now)
      ).length;

      if (activeUsersCount + pendingInvitesCount >= planMeta.maxUsers) {
        const error = `Limite do plano ${planMeta.name} atingido (${activeUsersCount + pendingInvitesCount}/${planMeta.maxUsers} vagas ocupadas). Faça upgrade do plano ou revogue um convite.`;
        showToast(error, 'warning');
        return { ok: false, error };
      }

      const cleanEmail = input.email.trim().toLowerCase();
      const duplicateUser = db.users.find(
        (u) => u.is_active && u.email && u.email.trim().toLowerCase() === cleanEmail
      );
      if (duplicateUser) {
        const error = 'Já existe um membro ativo na equipa com este endereço de email.';
        showToast(error, 'warning');
        return { ok: false, error };
      }

      const nowIso = now.toISOString();
      const token = `inv-${generatePublicToken()}`;
      const invitation: TeamInvitation = {
        id: generateId('inv'),
        organization_id: organization.id,
        full_name: input.full_name.trim(),
        email: cleanEmail,
        phone: input.phone.trim(),
        role: input.role ?? 'TECHNICIAN',
        hourly_cost:
          input.hourly_cost != null && !Number.isNaN(input.hourly_cost) && input.hourly_cost > 0
            ? Math.round(input.hourly_cost * 100) / 100
            : null,
        token,
        status: 'PENDING',
        expires_at: addHours(now, 48).toISOString(),
        created_at: nowIso,
      };

      setDb((prev) => ({
        ...prev,
        team_invitations: [invitation, ...prev.team_invitations],
      }));
      enqueueSync('team_invitations', invitation.id, 'CREATE', `Convite: ${invitation.full_name}`);
      showToast(`Convite criado para ${invitation.full_name} (válido por 48h).`, 'success');
      return { ok: true, invitation };
    },
    [db.team_invitations, db.users, enqueueSync, organization.id, organization.plan, showToast]
  );

  const acceptTeamInvitation = useCallback(
    (invitationId: string): { ok: boolean; error?: string; user?: User } => {
      const inv = db.team_invitations.find((i) => i.id === invitationId);
      if (!inv) return { ok: false, error: 'Convite não encontrado.' };

      const now = new Date();
      if (inv.status !== 'PENDING') {
        return { ok: false, error: 'Este convite já não está pendente.' };
      }
      if (isBefore(parseISO(inv.expires_at), now)) {
        setDb((prev) => ({
          ...prev,
          team_invitations: prev.team_invitations.map((i) =>
            i.id === invitationId ? { ...i, status: 'EXPIRED' } : i
          ),
        }));
        showToast('Este convite expirou (prazo de 48h ultrapassado).', 'warning');
        return { ok: false, error: 'Convite expirado.' };
      }

      const planMeta = SAAS_PLANS.find((p) => p.id === organization.plan) ?? SAAS_PLANS[0];
      const activeUsersCount = db.users.filter((u) => u.is_active).length;
      if (activeUsersCount >= planMeta.maxUsers) {
        const error = `O plano ${planMeta.name} atingiu o limite de ${planMeta.maxUsers} utilizadores ativos.`;
        showToast(error, 'warning');
        return { ok: false, error };
      }

      const nowIso = now.toISOString();
      const newUser: User = {
        id: generateId('user'),
        organization_id: organization.id,
        full_name: inv.full_name,
        phone: inv.phone || null,
        email: inv.email || null,
        role: inv.role,
        hourly_cost: inv.hourly_cost,
        is_active: true,
        created_at: nowIso,
        updated_at: nowIso,
      };

      setDb((prev) => ({
        ...prev,
        users: [...prev.users, newUser],
        team_invitations: prev.team_invitations.map((i) =>
          i.id === invitationId ? { ...i, status: 'ACCEPTED' } : i
        ),
      }));
      enqueueSync('users', newUser.id, 'CREATE', `Novo técnico: ${newUser.full_name}`);
      enqueueSync('team_invitations', invitationId, 'UPDATE', `Convite aceite: ${inv.full_name}`);
      showToast(
        `${newUser.full_name} aceitou o convite e já está ativo na equipa e no seletor de perfil!`,
        'success'
      );
      return { ok: true, user: newUser };
    },
    [db.team_invitations, db.users, enqueueSync, organization.id, organization.plan, showToast]
  );

  const revokeTeamInvitation = useCallback(
    (invitationId: string) => {
      const inv = db.team_invitations.find((i) => i.id === invitationId);
      if (!inv) return;
      setDb((prev) => ({
        ...prev,
        team_invitations: prev.team_invitations.map((i) =>
          i.id === invitationId ? { ...i, status: 'REVOKED' } : i
        ),
      }));
      enqueueSync('team_invitations', invitationId, 'UPDATE', `Convite revogado: ${inv.full_name}`);
      showToast(`Convite de ${inv.full_name} revogado. A vaga no plano ficou livre.`, 'info');
    },
    [db.team_invitations, enqueueSync, showToast]
  );

  const toggleUserActiveStatus = useCallback(
    (userId: string, isActive: boolean): { ok: boolean; error?: string } => {
      const target = db.users.find((u) => u.id === userId);
      if (!target) return { ok: false, error: 'Utilizador não encontrado.' };
      if (target.role === 'ADMIN' && !isActive) {
        return { ok: false, error: 'Não é possível desativar a conta de Administrador.' };
      }

      if (isActive && !target.is_active) {
        const planMeta = SAAS_PLANS.find((p) => p.id === organization.plan) ?? SAAS_PLANS[0];
        const now = new Date();
        const activeUsersCount = db.users.filter((u) => u.is_active).length;
        const pendingInvitesCount = db.team_invitations.filter(
          (inv) => inv.status === 'PENDING' && !isBefore(parseISO(inv.expires_at), now)
        ).length;

        if (activeUsersCount + pendingInvitesCount >= planMeta.maxUsers) {
          const error = `Sem vagas livres no plano ${planMeta.name} (${activeUsersCount + pendingInvitesCount}/${planMeta.maxUsers}). Faça upgrade ou revogue um convite pendente.`;
          showToast(error, 'warning');
          return { ok: false, error };
        }
      }

      const nowIso = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        users: prev.users.map((u) =>
          u.id === userId ? { ...u, is_active: isActive, updated_at: nowIso } : u
        ),
      }));

      if (!isActive && activeUserId === userId) {
        const admin = db.users.find((u) => u.role === 'ADMIN' && u.is_active);
        if (admin) setActiveUserId(admin.id);
      }

      enqueueSync(
        'users',
        userId,
        'UPDATE',
        `${target.full_name}: ${isActive ? 'Reativado' : 'Desativado'}`
      );
      showToast(
        isActive
          ? `${target.full_name} reativado na equipa.`
          : `${target.full_name} desativado. Acesso revogado, vaga libertada e histórico preservado.`,
        isActive ? 'success' : 'info'
      );
      return { ok: true };
    },
    [
      activeUserId,
      db.team_invitations,
      db.users,
      enqueueSync,
      organization.plan,
      showToast,
    ]
  );

  const updateUserHourlyCost = useCallback(
    (userId: string, hourlyCost: number | null) => {
      const nowIso = new Date().toISOString();
      const normalized =
        hourlyCost != null && !Number.isNaN(hourlyCost) && hourlyCost > 0
          ? Math.round(hourlyCost * 100) / 100
          : null;
      setDb((prev) => ({
        ...prev,
        users: prev.users.map((u) =>
          u.id === userId ? { ...u, hourly_cost: normalized, updated_at: nowIso } : u
        ),
      }));
      enqueueSync('users', userId, 'UPDATE', 'Custo/hora atualizado');
      showToast('Custo/hora do técnico atualizado.', 'success');
    },
    [enqueueSync, showToast]
  );

  const completeOnboarding = useCallback(
    (input: CompleteOnboardingInput) => {
      const nowIso = new Date().toISOString();
      const selectedVertical =
        VERTICAL_TEMPLATES.find((vt) => vt.id === input.verticalId) ?? VERTICAL_TEMPLATES[0];
      const cleanName = input.companyName.trim() || 'A Minha Empresa';
      const cleanSlug =
        cleanName
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || 'minha-empresa';

      if (input.mode === 'demo') {
        const fresh = createInitialSeedDatabase();
        const org = fresh.organizations[0];
        const verticalServices: ServiceCatalogItem[] = selectedVertical.default_services.map(
          (ds, idx) => ({
            id: generateId(`srv-ob-${idx}`),
            organization_id: org.id,
            name: ds.name,
            description: ds.description,
            unit: ds.unit,
            unit_price: ds.unit_price,
            cost_price: ds.cost_price,
            vat_rate: ds.vat_rate,
            is_active: true,
            created_at: nowIso,
            updated_at: nowIso,
            deleted_at: null,
          })
        );

        const nextCatalog =
          selectedVertical.id === org.vertical_id ? fresh.service_catalog : verticalServices;

        const nextDb: ZelvoDatabase = {
          ...fresh,
          organizations: [
            {
              ...org,
              vertical_id: selectedVertical.id,
              name: cleanName,
              slug: cleanSlug,
              nif: input.nif?.trim() || org.nif,
              primary_color: input.primaryColor || '#10B981',
              logo_url: input.logoUrl,
              updated_at: nowIso,
            },
          ],
          service_catalog: nextCatalog,
        };

        setDb(nextDb);
        setSyncQueue([]);
        setIsOffline(false);
        setActiveUserId(nextDb.users[0]?.id ?? null);
        showToast(
          `Configuração concluída para ${cleanName} (${selectedVertical.name}) com dados de demonstração.`,
          'success'
        );
        return;
      }

      // Blank workspace with selected vertical template & base catalog ready to use
      const orgId = generateId('org');
      const adminId = generateId('user-admin');
      const blankDb: ZelvoDatabase = {
        vertical_templates: VERTICAL_TEMPLATES,
        organizations: [
          {
            id: orgId,
            vertical_id: selectedVertical.id,
            name: cleanName,
            slug: cleanSlug,
            nif: input.nif?.trim() || null,
            phone: null,
            email: input.adminEmail?.trim() || null,
            logo_url: input.logoUrl,
            primary_color: input.primaryColor || '#10B981',
            plan: 'TEAM',
            created_at: nowIso,
            updated_at: nowIso,
          },
        ],
        users: [
          {
            id: adminId,
            organization_id: orgId,
            full_name: input.adminName?.trim() || 'Administrador',
            phone: null,
            email: input.adminEmail?.trim() || null,
            role: 'ADMIN',
            hourly_cost: null,
            is_active: true,
            created_at: nowIso,
            updated_at: nowIso,
          },
        ],
        team_invitations: [],
        leads: [],
        clients: [],
        service_assets: [],
        service_catalog: selectedVertical.default_services.map((ds, idx) => ({
          id: generateId(`srv-${idx}`),
          organization_id: orgId,
          name: ds.name,
          description: ds.description,
          unit: ds.unit,
          unit_price: ds.unit_price,
          cost_price: ds.cost_price,
          vat_rate: ds.vat_rate,
          is_active: true,
          created_at: nowIso,
          updated_at: nowIso,
          deleted_at: null,
        })),
        quotes: [],
        jobs: [],
        job_media: [],
        transactions: [],
        inventory_items: [],
        equipment: [],
      };

      setDb(blankDb);
      setSyncQueue([]);
      setIsOffline(false);
      setActiveUserId(adminId);
      showToast(
        `Espaço limpo criado para ${cleanName} (${selectedVertical.name}) com catálogo base carregado.`,
        'success'
      );
    },
    [showToast]
  );

  const value: ZelvoContextValue = {
    db,
    organization,
    activeVertical,
    currentUser,
    isTechnicianMode,
    setCurrentUserId: setActiveUserId,
    isOffline,
    isSyncing,
    syncJustCompleted,
    syncQueue,
    lastSyncedAt,
    toasts,
    showToast,
    dismissToast,
    toggleOffline,
    syncNow,
    resetDemoData,
    updateOrganization,
    switchVertical,
    completeOnboarding,
    createLead,
    updateLeadStatus,
    logLeadFollowupSent,
    convertLeadToClient,
    createClient,
    updateClient,
    anonymizeClient,
    upsertServiceAsset,
    softDeleteAsset,
    upsertCatalogItem,
    softDeleteCatalogItem,
    createQuote,
    updateQuoteStatus,
    approveQuoteByToken,
    configureQuoteRecurrence,
    toggleQuoteAutoInvoice,
    generateAutoInvoiceFromQuote,
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
    simulatePaymentWebhook,
    issueATInvoice,
    advanceDunningStage,
    togglePauseJobDunning,
    updateClientRetainer,
    upsertInventoryItem,
    adjustInventoryStock,
    purchaseInventoryItem,
    upsertEquipment,
    logEquipmentService,
    registerClientReferral,
    createTeamInvitation,
    acceptTeamInvitation,
    revokeTeamInvitation,
    toggleUserActiveStatus,
    updateUserHourlyCost,
    createTransaction,
    softDeleteTransaction,
  };

  return <ZelvoContext.Provider value={value}>{children}</ZelvoContext.Provider>;
};

export function useZelvo(): ZelvoContextValue {
  const ctx = useContext(ZelvoContext);
  if (!ctx) {
    throw new Error('useZelvo deve ser utilizado dentro de ZelvoProvider.');
  }
  return ctx;
}
