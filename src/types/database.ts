import { z } from 'zod';

export type AssetFieldType = 'number' | 'text' | 'select' | 'boolean';

export interface AssetFieldDefinition {
  key: string;
  label: string;
  type: AssetFieldType;
  unit?: string;
  options?: string[];
  placeholder?: string;
  required?: boolean;
}

export interface DefaultServiceTemplate {
  name: string;
  description: string;
  unit: ServiceUnit;
  unit_price: number;
  cost_price: number;
  vat_rate: number;
}

export interface VerticalTemplate {
  id: string;
  slug: string;
  name: string;
  asset_schema: AssetFieldDefinition[];
  default_services: DefaultServiceTemplate[];
  default_checklists: string[];
  feature_flags: Record<string, boolean>;
  created_at: string;
}

export type OrganizationPlan = 'PILOT' | 'SOLO' | 'TEAM';

export interface Organization {
  id: string;
  vertical_id: string;
  name: string;
  slug: string;
  nif: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  primary_color: string;
  plan: OrganizationPlan;
  created_at: string;
  updated_at: string;
}

export type UserRole = 'ADMIN' | 'TECHNICIAN';

export interface User {
  id: string;
  organization_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  role: UserRole;
  hourly_cost: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type TeamInvitationStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';

export interface TeamInvitation {
  id: string;
  organization_id: string;
  full_name: string;
  email: string;
  phone: string;
  role: UserRole;
  hourly_cost: number | null;
  token: string;
  status: TeamInvitationStatus;
  expires_at: string;
  created_at: string;
}

export type LeadSource = 'WEB_FORM' | 'MANUAL' | 'WHATSAPP';
export type LeadStatus = 'NEW' | 'VISIT_SCHEDULED' | 'QUOTE_SENT' | 'WON' | 'LOST';

export interface Lead {
  id: string;
  organization_id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  description: string | null;
  source: LeadSource;
  status: LeadStatus;
  lost_reason: string | null;
  next_followup_at?: string | null;
  photo_urls: string[];
  gdpr_consent: boolean;
  gdpr_consent_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Client {
  id: string;
  organization_id: string;
  lead_id: string | null;
  name: string;
  phone: string;
  email: string | null;
  nif: string | null;
  billing_address: string | null;
  notes: string | null;
  is_anonymized: boolean;
  is_retainer?: boolean;
  retainer_amount?: number | null;
  retainer_billing_day?: number | null;
  referral_code?: string | null;
  referral_discount_pct?: number;
  referrals_count?: number;
  referred_by_client_id?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type CustomAttributeValue = string | number | boolean | null;

export interface ServiceAsset {
  id: string;
  organization_id: string;
  client_id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  access_notes: string | null;
  custom_attributes: Record<string, CustomAttributeValue>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type ServiceUnit = 'FIXED' | 'HOUR' | 'SQM' | 'UNIT';

export interface ServiceCatalogItem {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  unit: ServiceUnit;
  unit_price: number;
  cost_price: number;
  vat_rate: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type QuoteStatus = 'DRAFT' | 'SENT' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export interface QuoteItem {
  id: string;
  name: string;
  unit: ServiceUnit;
  qty: number;
  unit_price: number;
  vat_rate: number;
  total: number;
}

export type RecurrenceBillingFrequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY';

export interface QuotePackage {
  id: string;
  name: string;
  description?: string | null;
  recommended?: boolean;
  items: QuoteItem[];
  subtotal: number;
  vat_total: number;
  total: number;
}

export interface Quote {
  id: string;
  organization_id: string;
  lead_id: string | null;
  client_id: string | null;
  public_token: string;
  quote_number: string;
  status: QuoteStatus;
  items: QuoteItem[];
  subtotal: number;
  vat_total: number;
  total: number;
  valid_until: string | null;
  approved_at: string | null;
  approved_ip: string | null;
  packages?: QuotePackage[];
  selected_package_id?: string | null;
  deposit_pct?: number | null;
  deposit_paid?: boolean;
  is_recurring?: boolean;
  recurrence_frequency?: RecurrenceBillingFrequency | null;
  next_billing_date?: string | null;
  auto_invoice_active?: boolean;
  generated_invoices_count?: number;
  last_invoiced_at?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type JobStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type PaymentStatus = 'PENDING' | 'PAID' | 'PARTIAL';

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export type DunningStage = 'NONE' | 'D0_SENT' | 'D3_REMINDER' | 'D7_CRITICAL';

export interface JobExtraItem {
  id: string;
  name: string;
  qty: number;
  unit_price: number;
  total: number;
}

export interface JobConsumedMaterial {
  id: string;
  inventory_item_id: string;
  name: string;
  qty: number;
  unit: string;
}

export interface Job {
  id: string;
  organization_id: string;
  client_id: string;
  asset_id: string;
  quote_id: string | null;
  assigned_user_id: string | null;
  title: string;
  status: JobStatus;
  scheduled_start: string;
  scheduled_end: string | null;
  recurrence_rule: string | null;
  parent_job_id: string | null;
  checkin_at: string | null;
  checkout_at: string | null;
  checklist: ChecklistItem[];
  next_visit_notes: string | null;
  price: number;
  payment_status: PaymentStatus;
  extras?: JobExtraItem[];
  consumed_materials?: JobConsumedMaterial[];
  signature_data_url?: string | null;
  dunning_stage?: DunningStage;
  dunning_paused?: boolean;
  dunning_last_sent_at?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type MediaType = 'BEFORE' | 'AFTER' | 'ISSUE';

export interface JobMedia {
  id: string;
  organization_id: string;
  job_id: string;
  media_type: MediaType;
  storage_path: string;
  data_url: string;
  size_kb: number;
  taken_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type TransactionType = 'INCOME' | 'EXPENSE';
export type PaymentMethod = 'CASH' | 'MBWAY' | 'MULTIBANCO' | 'TRANSFER' | 'CARD' | 'OTHER';

export interface Transaction {
  id: string;
  organization_id: string;
  job_id: string | null;
  client_id: string | null;
  type: TransactionType;
  category: string;
  amount: number;
  payment_method: PaymentMethod;
  transaction_date: string;
  description: string | null;
  receipt_path: string | null;
  external_payment_id: string | null;
  external_invoice_id: string | null;
  atcud?: string | null;
  invoice_issued_at?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface InventoryItem {
  id: string;
  organization_id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  min_stock: number;
  unit_cost: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type EquipmentStatus = 'OK' | 'MAINTENANCE_DUE' | 'IN_REPAIR';

export interface EquipmentItem {
  id: string;
  organization_id: string;
  name: string;
  brand_model: string;
  serial_or_plate: string | null;
  hours_used: number;
  next_service_hours: number | null;
  next_service_date: string;
  status: EquipmentStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type EntityTableName =
  | 'vertical_templates'
  | 'organizations'
  | 'users'
  | 'team_invitations'
  | 'leads'
  | 'clients'
  | 'service_assets'
  | 'service_catalog'
  | 'quotes'
  | 'jobs'
  | 'job_media'
  | 'transactions'
  | 'inventory_items'
  | 'equipment';

export interface SyncQueueItem {
  id: string;
  table: EntityTableName;
  record_id: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  summary: string;
  queued_at: string;
}

export interface ZelvoDatabase {
  vertical_templates: VerticalTemplate[];
  organizations: Organization[];
  users: User[];
  team_invitations: TeamInvitation[];
  leads: Lead[];
  clients: Client[];
  service_assets: ServiceAsset[];
  service_catalog: ServiceCatalogItem[];
  quotes: Quote[];
  jobs: Job[];
  job_media: JobMedia[];
  transactions: Transaction[];
  inventory_items: InventoryItem[];
  equipment: EquipmentItem[];
}

// Zod validation schemas for critical boundaries
export const publicLeadInputSchema = z.object({
  name: z.string().trim().min(2, 'Indique o seu nome completo.'),
  phone: z.string().trim().min(9, 'Indique um número de telefone válido.'),
  email: z.string().trim().email('Email inválido.').optional().or(z.literal('')),
  address: z.string().trim().min(3, 'Indique a morada ou freguesia.'),
  description: z.string().trim().min(5, 'Descreva brevemente o serviço pretendido.'),
  gdpr_consent: z.literal(true, {
    message: 'É obrigatório aceitar o consentimento RGPD para enviar o pedido.',
  }),
  photos: z.array(z.string()).max(5, 'Pode anexar no máximo 5 fotografias.'),
});

export const quoteItemSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1, 'Descrição obrigatória'),
  unit: z.enum(['FIXED', 'HOUR', 'SQM', 'UNIT']),
  qty: z.number().positive('Quantidade deve ser maior que 0'),
  unit_price: z.number().min(0, 'Preço não pode ser negativo'),
  vat_rate: z.number().min(0).max(100),
  total: z.number().min(0),
});
