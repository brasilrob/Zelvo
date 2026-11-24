import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createInitialSeedDatabase } from '../data/seedData';
import type {
  ChecklistItem,
  Client,
  CustomAttributeValue,
  EntityTableName,
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
  QuoteStatus,
  ServiceAsset,
  ServiceCatalogItem,
  ServiceUnit,
  SyncQueueItem,
  Transaction,
  TransactionType,
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
}

export interface CreateJobInput {
  client_id: string;
  asset_id: string;
  quote_id?: string | null;
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
}

interface ZelvoContextValue {
  db: ZelvoDatabase;
  organization: Organization;
  activeVertical: VerticalTemplate;
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

  // Leads
  createLead: (input: CreateLeadInput) => Lead;
  updateLeadStatus: (
    leadId: string,
    status: LeadStatus,
    lostReason?: string | null
  ) => { ok: boolean; error?: string };
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
  approveQuoteByToken: (token: string) => { ok: boolean; error?: string; quote?: Quote };

  // Jobs & Media
  createJob: (input: CreateJobInput) => { parent: Job; createdCount: number };
  startJob: (jobId: string) => void;
  updateJobExecution: (
    jobId: string,
    patch: { checklist?: ChecklistItem[]; next_visit_notes?: string | null }
  ) => void;
  completeJob: (jobId: string, nextVisitNotes?: string | null) => void;
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
        return parsed as ZelvoDatabase;
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

export const ZelvoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [db, setDb] = useState<ZelvoDatabase>(loadInitialDb);
  const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>(loadInitialQueue);
  const [isOffline, setIsOffline] = useState<boolean>(loadInitialOffline);
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

  const organization = db.organizations[0];

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

      const nowIso = new Date().toISOString();
      setDb((prev) => ({
        ...prev,
        leads: prev.leads.map((lead) =>
          lead.id === leadId
            ? {
                ...lead,
                status,
                lost_reason: status === 'LOST' ? (lostReason ?? null) : null,
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
      const totals = calculateQuoteTotals(input.items);

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
        approved_at: null,
        approved_ip: null,
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
      showToast(`Orçamento ${newQuote.quote_number} guardado.`, 'success');
      return newQuote;
    },
    [db.quotes.length, enqueueSync, organization.id, showToast]
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
    (token: string): { ok: boolean; error?: string; quote?: Quote } => {
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

      const nowIso = new Date().toISOString();
      const approvedQuote: Quote = {
        ...target,
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
      const userId = db.users[0]?.id ?? null;

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

      return { parent: parentJob, createdCount: allNew.length };
    },
    [activeVertical.default_checklists, db.users, enqueueSync, organization.id, showToast]
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
      patch: { checklist?: ChecklistItem[]; next_visit_notes?: string | null }
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
        external_payment_id: null,
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

  const value: ZelvoContextValue = {
    db,
    organization,
    activeVertical,
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
    createLead,
    updateLeadStatus,
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
    createJob,
    startJob,
    updateJobExecution,
    completeJob,
    addJobMedia,
    softDeleteJobMedia,
    recordPaymentForJob,
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
