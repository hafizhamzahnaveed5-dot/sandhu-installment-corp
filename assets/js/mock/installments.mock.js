/**
 * installments.mock.js — Mock installment plans, schedules, and payments
 * Matches InstallmentPlan, InstallmentSchedule, and Payment schemas exactly.
 */

// ── Installment Plans ─────────────────────────────────────────
export const MOCK_INSTALLMENT_PLANS = [
  {
    id: 'plan-001',
    customerId: 'cust-001',
    productId: 'prod-001',
    principalAmount: 85000,
    purchaseCost: 78000,
    downPayment: 10000,
    numberOfInstallments: 12,
    installmentAmount: 7084,
    frequency: 'monthly',
    startDate: '2024-02-01',
    status: 'active',
    interestOrMarkup: 10,  // percent
    createdBy: 'user-001',
    createdAt: '2024-01-15T08:30:00Z',
  },
  {
    id: 'plan-002',
    customerId: 'cust-002',
    productId: 'prod-003',
    principalAmount: 45000,
    purchaseCost: 40000,
    downPayment: 5000,
    numberOfInstallments: 8,
    installmentAmount: 5625,
    frequency: 'monthly',
    startDate: '2024-03-01',
    status: 'active',
    interestOrMarkup: 0,
    createdBy: 'user-002',
    createdAt: '2024-02-20T10:00:00Z',
  },
  {
    id: 'plan-003',
    customerId: 'cust-003',
    productId: 'prod-002',
    principalAmount: 120000,
    purchaseCost: 110000,
    downPayment: 20000,
    numberOfInstallments: 24,
    installmentAmount: 5000,
    frequency: 'monthly',
    startDate: '2024-04-01',
    status: 'active',
    interestOrMarkup: 0,
    createdBy: 'user-001',
    createdAt: '2024-03-05T09:15:00Z',
  },
  {
    id: 'plan-004',
    customerId: 'cust-004',
    productId: 'prod-004',
    principalAmount: 30000,
    purchaseCost: 25000,
    downPayment: 5000,
    numberOfInstallments: 6,
    installmentAmount: 5000,
    frequency: 'monthly',
    startDate: '2023-12-01',
    status: 'completed',
    interestOrMarkup: 0,
    createdBy: 'user-001',
    createdAt: '2023-11-01T11:00:00Z',
  },
  {
    id: 'plan-005',
    customerId: 'cust-005',
    productId: 'prod-001',
    principalAmount: 60000,
    purchaseCost: 54000,
    downPayment: 0,
    numberOfInstallments: 12,
    installmentAmount: 5000,
    frequency: 'monthly',
    startDate: '2024-05-01',
    status: 'active',
    interestOrMarkup: 0,
    createdBy: 'user-002',
    createdAt: '2024-04-10T14:00:00Z',
  },
  {
    id: 'plan-006',
    customerId: 'cust-006',
    productId: 'prod-005',
    principalAmount: 35000,
    purchaseCost: 30000,
    downPayment: 0,
    numberOfInstallments: 7,
    installmentAmount: 5000,
    frequency: 'monthly',
    startDate: '2023-09-01',
    status: 'defaulted',
    interestOrMarkup: 0,
    createdBy: 'user-001',
    createdAt: '2023-08-20T09:00:00Z',
  },
  {
    id: 'plan-007',
    customerId: 'cust-001',
    productId: 'prod-002',
    principalAmount: 55000,
    purchaseCost: 50000,
    downPayment: 5000,
    numberOfInstallments: 12,
    installmentAmount: 4584,
    frequency: 'monthly',
    startDate: '2024-01-01',
    // DECISION: 'overdue' is a computed plan status — plan has missed installments.
    // The listPlans filter in the service treats this as plans-with-overdue-schedules.
    status: 'overdue',
    interestOrMarkup: 5,
    createdBy: 'user-002',
    createdAt: '2023-12-15T10:00:00Z',
  },
  {
    id: 'plan-008',
    customerId: 'cust-003',
    productId: 'prod-003',
    principalAmount: 72000,
    purchaseCost: 65000,
    downPayment: 12000,
    numberOfInstallments: 10,
    installmentAmount: 6000,
    frequency: 'monthly',
    startDate: '2024-02-01',
    status: 'overdue',
    interestOrMarkup: 0,
    createdBy: 'user-001',
    createdAt: '2024-01-10T08:00:00Z',
  },
];

// ── Installment Schedules (one row per installment due) ──────
// Generate schedules dynamically for realism
function generateSchedule(plan) {
  const schedule = [];
  const start = new Date(plan.startDate);
  const today = new Date('2024-07-05'); // DECISION: fixed "today" for mock data

  for (let i = 1; i <= plan.numberOfInstallments; i++) {
    const dueDate = new Date(start);
    if (plan.frequency === 'monthly') {
      dueDate.setMonth(dueDate.getMonth() + (i - 1));
    } else {
      dueDate.setDate(dueDate.getDate() + (i - 1) * 7);
    }

    let status;
    let paidDate = null;
    let amountPaid = 0;

    if (plan.status === 'completed') {
      status = 'paid';
      paidDate = new Date(dueDate.getTime() + 86400000).toISOString();
      amountPaid = plan.installmentAmount;
    } else if (plan.status === 'defaulted') {
      status = dueDate < today ? 'overdue' : 'pending';
      if (i <= 2) {
        status = 'paid';
        paidDate = new Date(dueDate.getTime() + 86400000).toISOString();
        amountPaid = plan.installmentAmount;
      }
    } else {
      const diffDays = (dueDate - today) / (1000 * 60 * 60 * 24);
      if (dueDate < today) {
        // In the past — simulate some paid, some overdue
        if (i <= 3) {
          status = 'paid';
          paidDate = new Date(dueDate.getTime() + 2 * 86400000).toISOString();
          amountPaid = plan.installmentAmount;
        } else {
          status = 'overdue';
        }
      } else if (diffDays <= 7) {
        status = 'due-soon';
      } else {
        status = 'pending';
      }
    }

    schedule.push({
      id: `sch-${plan.id}-${i}`,
      planId: plan.id,
      installmentNumber: i,
      dueDate: dueDate.toISOString().split('T')[0],
      amountDue: plan.installmentAmount,
      amountPaid,
      status,
      paidDate,
    });
  }
  return schedule;
}

export const MOCK_SCHEDULES = MOCK_INSTALLMENT_PLANS.flatMap(generateSchedule);

// ── Payments ─────────────────────────────────────────────────
export const MOCK_PAYMENTS = [
  {
    id: 'pay-001',
    planId: 'plan-001',
    scheduleId: 'sch-plan-001-1',
    amount: 7084,
    method: 'cash',
    receivedBy: 'user-002',
    receiptNumber: 'RCP-2024-0001',
    paidAt: '2024-02-03T11:00:00Z',
    notes: '',
  },
  {
    id: 'pay-002',
    planId: 'plan-001',
    scheduleId: 'sch-plan-001-2',
    amount: 7084,
    method: 'bank',
    receivedBy: 'user-002',
    receiptNumber: 'RCP-2024-0002',
    paidAt: '2024-03-04T10:30:00Z',
    notes: 'Bank transfer ref: BT2024030401',
  },
  {
    id: 'pay-003',
    planId: 'plan-001',
    scheduleId: 'sch-plan-001-3',
    amount: 7084,
    method: 'cash',
    receivedBy: 'user-001',
    receiptNumber: 'RCP-2024-0003',
    paidAt: '2024-04-05T09:15:00Z',
    notes: '',
  },
  {
    id: 'pay-004',
    planId: 'plan-002',
    scheduleId: 'sch-plan-002-1',
    amount: 5625,
    method: 'online',
    receivedBy: 'user-001',
    receiptNumber: 'RCP-2024-0004',
    paidAt: '2024-03-02T14:00:00Z',
    notes: 'JazzCash payment',
  },
  {
    id: 'pay-005',
    planId: 'plan-002',
    scheduleId: 'sch-plan-002-2',
    amount: 5625,
    method: 'cash',
    receivedBy: 'user-002',
    receiptNumber: 'RCP-2024-0005',
    paidAt: '2024-04-03T11:45:00Z',
    notes: '',
  },
  {
    id: 'pay-006',
    planId: 'plan-002',
    scheduleId: 'sch-plan-002-3',
    amount: 5625,
    method: 'cash',
    receivedBy: 'user-002',
    receiptNumber: 'RCP-2024-0006',
    paidAt: '2024-05-04T10:00:00Z',
    notes: '',
  },
];
