import { differenceInSeconds, parseISO } from 'date-fns';
import type { Client, InventoryItem, Job, Transaction, User } from '../types/database';
import { roundCurrency } from './calculations';

export interface ClientProfitabilityMetrics {
  clientId: string;
  clientName: string;
  revenue: number;
  materialsCost: number;
  laborCost: number;
  netProfit: number;
  marginPct: number;
  completedJobsCount: number;
  trackedMinutes: number;
}

export function calculateJobLaborCost(job: Job, usersById: Map<string, User>): {
  trackedSeconds: number;
  laborCost: number;
  hourlyCost: number | null;
} {
  if (!job.checkin_at || !job.checkout_at) {
    return { trackedSeconds: 0, laborCost: 0, hourlyCost: null };
  }
  const trackedSeconds = Math.max(
    0,
    differenceInSeconds(parseISO(job.checkout_at), parseISO(job.checkin_at))
  );
  const assignedUser = job.assigned_user_id ? usersById.get(job.assigned_user_id) : undefined;
  const hourlyCost =
    assignedUser?.hourly_cost != null && assignedUser.hourly_cost > 0
      ? assignedUser.hourly_cost
      : null;

  if (!hourlyCost || trackedSeconds <= 0) {
    return { trackedSeconds, laborCost: 0, hourlyCost };
  }

  const laborCost = roundCurrency((trackedSeconds / 3600) * hourlyCost);
  return { trackedSeconds, laborCost, hourlyCost };
}

export function calculateClientProfitability(params: {
  client: Client;
  jobs: Job[];
  transactions: Transaction[];
  usersById: Map<string, User>;
  inventoryById?: Map<string, InventoryItem>;
}): ClientProfitabilityMetrics {
  const { client, jobs, transactions, usersById, inventoryById } = params;

  const clientJobs = jobs.filter((j) => !j.deleted_at && j.client_id === client.id);
  const clientJobIds = new Set(clientJobs.map((j) => j.id));

  const revenue = roundCurrency(
    transactions
      .filter(
        (t) =>
          !t.deleted_at &&
          t.type === 'INCOME' &&
          (t.client_id === client.id || (t.job_id != null && clientJobIds.has(t.job_id)))
      )
      .reduce((acc, t) => acc + t.amount, 0)
  );

  // Materials / supplies consumed directly inside jobs (unit_cost looked up in inventory)
  const jobMaterialsCost = clientJobs.reduce((sum, job) => {
    const itemsCost = (job.consumed_materials ?? []).reduce((inner, m) => {
      const unitCost = inventoryById?.get(m.inventory_item_id)?.unit_cost ?? 0;
      return inner + m.qty * unitCost;
    }, 0);
    return sum + itemsCost;
  }, 0);

  // Any explicit expense transactions directly attributed to this client or their jobs
  const directExpenseCost = transactions
    .filter(
      (t) =>
        !t.deleted_at &&
        t.type === 'EXPENSE' &&
        (t.client_id === client.id || (t.job_id != null && clientJobIds.has(t.job_id)))
    )
    .reduce((acc, t) => acc + t.amount, 0);

  const materialsCost = roundCurrency(jobMaterialsCost + directExpenseCost);

  // Labor cost from completed jobs timer × assigned technician hourly_cost
  let totalTrackedSeconds = 0;
  let laborCostRaw = 0;
  let completedJobsCount = 0;

  for (const job of clientJobs) {
    if (job.status === 'COMPLETED') {
      completedJobsCount += 1;
      const calc = calculateJobLaborCost(job, usersById);
      totalTrackedSeconds += calc.trackedSeconds;
      laborCostRaw += calc.laborCost;
    }
  }

  const laborCost = roundCurrency(laborCostRaw);
  const netProfit = roundCurrency(revenue - materialsCost - laborCost);
  const marginPct = revenue > 0 ? Math.round((netProfit / revenue) * 1000) / 10 : 0;

  return {
    clientId: client.id,
    clientName: client.name,
    revenue,
    materialsCost,
    laborCost,
    netProfit,
    marginPct,
    completedJobsCount,
    trackedMinutes: Math.round(totalTrackedSeconds / 60),
  };
}

export function calculateAllClientsProfitability(params: {
  clients: Client[];
  jobs: Job[];
  transactions: Transaction[];
  users: User[];
  inventoryItems?: InventoryItem[];
}): ClientProfitabilityMetrics[] {
  const usersById = new Map(params.users.map((u) => [u.id, u]));
  const inventoryById = new Map((params.inventoryItems ?? []).map((i) => [i.id, i]));
  return params.clients
    .filter((c) => !c.deleted_at)
    .map((client) =>
      calculateClientProfitability({
        client,
        jobs: params.jobs,
        transactions: params.transactions,
        usersById,
        inventoryById,
      })
    )
    .sort((a, b) => b.netProfit - a.netProfit);
}
