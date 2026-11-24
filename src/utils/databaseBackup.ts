import { format } from 'date-fns';
import {
  loadPushPreferences,
  type PushNotificationPreferences,
} from '../services/pushNotifications';
import type { Organization, SyncQueueItem, ZelvoDatabase } from '../types/database';

const LAST_BACKUP_KEY = 'zelvo_last_backup_at';

export interface ZelvoBackupSummary {
  vertical_templates: number;
  organizations: number;
  users: number;
  team_invitations: number;
  leads: number;
  clients: number;
  service_assets: number;
  service_catalog: number;
  quotes: number;
  jobs: number;
  job_media: number;
  transactions: number;
  inventory_items: number;
  equipment: number;
  pending_sync_items: number;
}

export interface ZelvoBackupPayload {
  format: 'zelvo-local-backup';
  version: '1.0';
  exported_at: string;
  organization_name: string;
  organization_slug: string;
  summary: ZelvoBackupSummary;
  database: ZelvoDatabase;
  sync_queue: SyncQueueItem[];
  push_preferences: PushNotificationPreferences;
}

export interface BackupExportResult {
  filename: string;
  exportedAt: string;
  totalRecords: number;
  sizeKb: number;
}

export function getLastBackupTimestamp(): string | null {
  try {
    return localStorage.getItem(LAST_BACKUP_KEY);
  } catch {
    return null;
  }
}

export function saveLastBackupTimestamp(isoTimestamp: string): void {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, isoTimestamp);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Exports all 11 local database entities, pending sync queue, and notification
 * preferences into a portable, formatted JSON backup file.
 */
export function exportDatabaseBackupJSON(params: {
  db: ZelvoDatabase;
  organization: Organization;
  syncQueue: SyncQueueItem[];
}): BackupExportResult {
  const { db, organization, syncQueue } = params;
  const exportedAt = new Date().toISOString();

  const summary: ZelvoBackupSummary = {
    vertical_templates: db.vertical_templates.length,
    organizations: db.organizations.length,
    users: db.users.length,
    team_invitations: db.team_invitations.length,
    leads: db.leads.length,
    clients: db.clients.length,
    service_assets: db.service_assets.length,
    service_catalog: db.service_catalog.length,
    quotes: db.quotes.length,
    jobs: db.jobs.length,
    job_media: db.job_media.length,
    transactions: db.transactions.length,
    inventory_items: db.inventory_items.length,
    equipment: db.equipment.length,
    pending_sync_items: syncQueue.length,
  };

  const payload: ZelvoBackupPayload = {
    format: 'zelvo-local-backup',
    version: '1.0',
    exported_at: exportedAt,
    organization_name: organization.name,
    organization_slug: organization.slug,
    summary,
    database: db,
    sync_queue: syncQueue,
    push_preferences: loadPushPreferences(),
  };

  const jsonContent = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
  const dateStamp = format(new Date(), 'yyyy-MM-dd-HHmm');
  const safeSlug = organization.slug.replace(/[^a-z0-9-]+/gi, '-').toLowerCase() || 'empresa';
  const filename = `zelvo-backup-${safeSlug}-${dateStamp}.json`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);

  saveLastBackupTimestamp(exportedAt);

  const totalRecords =
    summary.vertical_templates +
    summary.organizations +
    summary.users +
    summary.team_invitations +
    summary.leads +
    summary.clients +
    summary.service_assets +
    summary.service_catalog +
    summary.quotes +
    summary.jobs +
    summary.job_media +
    summary.transactions +
    summary.inventory_items +
    summary.equipment;

  return {
    filename,
    exportedAt,
    totalRecords,
    sizeKb: Math.max(1, Math.round(blob.size / 1024)),
  };
}
