/**
 * Plan definitions for Novo.
 * These are the official plans — limits are enforced server-side from here.
 */

export type PlanName = 'free' | 'trial' | 'starter' | 'growth' | 'business' | 'enterprise';

export interface Plan {
  name: PlanName;
  displayName: string;
  priceMonthlyInr: number; // 0 for free/trial
  priceMonthlyUsd: number; // 0 for free/trial
  limits: {
    users: number; // -1 = unlimited
    records: number; // -1 = unlimited
    storageMb: number;
    workflowRunsPerMonth: number;
    aiCreditsPerMonth: number;
    whatsappMessagesPerMonth: number;
    apps: number;
    tables: number;
  };
}

export const PLANS: Record<PlanName, Plan> = {
  free: {
    name: 'free',
    displayName: 'Free',
    priceMonthlyInr: 0,
    priceMonthlyUsd: 0,
    limits: {
      users: 3,
      records: 1000,
      storageMb: 100,
      workflowRunsPerMonth: 100,
      aiCreditsPerMonth: 10,
      whatsappMessagesPerMonth: 0,
      apps: 1,
      tables: 5,
    },
  },
  trial: {
    name: 'trial',
    displayName: 'Trial (14 days)',
    priceMonthlyInr: 0,
    priceMonthlyUsd: 0,
    limits: {
      users: 10,
      records: 10000,
      storageMb: 500,
      workflowRunsPerMonth: 1000,
      aiCreditsPerMonth: 50,
      whatsappMessagesPerMonth: 100,
      apps: 3,
      tables: 20,
    },
  },
  starter: {
    name: 'starter',
    displayName: 'Starter',
    priceMonthlyInr: 2999,
    priceMonthlyUsd: 39,
    limits: {
      users: 10,
      records: 50000,
      storageMb: 5000,
      workflowRunsPerMonth: 5000,
      aiCreditsPerMonth: 200,
      whatsappMessagesPerMonth: 500,
      apps: 5,
      tables: 50,
    },
  },
  growth: {
    name: 'growth',
    displayName: 'Growth',
    priceMonthlyInr: 7999,
    priceMonthlyUsd: 99,
    limits: {
      users: 50,
      records: 500000,
      storageMb: 50000,
      workflowRunsPerMonth: 50000,
      aiCreditsPerMonth: 1000,
      whatsappMessagesPerMonth: 5000,
      apps: 20,
      tables: 200,
    },
  },
  business: {
    name: 'business',
    displayName: 'Business',
    priceMonthlyInr: 19999,
    priceMonthlyUsd: 249,
    limits: {
      users: 200,
      records: -1,
      storageMb: 500000,
      workflowRunsPerMonth: -1,
      aiCreditsPerMonth: 5000,
      whatsappMessagesPerMonth: 50000,
      apps: -1,
      tables: -1,
    },
  },
  enterprise: {
    name: 'enterprise',
    displayName: 'Enterprise',
    priceMonthlyInr: 0,
    priceMonthlyUsd: 0,
    limits: {
      users: -1,
      records: -1,
      storageMb: -1,
      workflowRunsPerMonth: -1,
      aiCreditsPerMonth: -1,
      whatsappMessagesPerMonth: -1,
      apps: -1,
      tables: -1,
    },
  },
};

export function getPlan(name: string): Plan {
  return PLANS[name as PlanName] ?? PLANS.free;
}
