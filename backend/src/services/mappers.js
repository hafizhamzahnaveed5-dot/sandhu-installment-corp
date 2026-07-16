import { pgDateOnly, todayDateOnly, toDateOnly } from '../utils/dates.js';

export function mapCustomer(row) {
  if (!row) return null;
  return {
    id: row.id,
    fullName: row.full_name,
    accountNumber: row.account_number || null,
    cnicOrId: row.cnic_or_id,
    phone: row.phone,
    email: row.email,
    address: row.address,
    city: row.city,
    status: row.status,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    guarantorName: row.guarantor_name,
    guarantorPhone: row.guarantor_phone,
    documents: row.documents || [],
    creditScore: Number(row.credit_score || 0),
    totalOutstanding: Number(row.total_outstanding || 0),
    totalPurchaseCost: Number(row.total_purchase_cost || 0),
    totalCostGap: Number(row.total_cost_gap || 0),
    smsAlertsEnabled: row.sms_alerts_enabled ?? true,
    notes: row.notes,
    productNames: row.product_names || '',
  };
}

export function mapPlan(row) {
  if (!row) return null;
  const principalAmount = Number(row.principal_amount);
  const purchaseCost = Number(row.purchase_cost || 0);
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    productId: row.product_id,
    principalAmount,
    purchaseCost,
    fileFee: Number(row.file_fee || 0),
    costGap: principalAmount - purchaseCost,
    downPayment: Number(row.down_payment),
    numberOfInstallments: Number(row.number_of_installments),
    installmentAmount: Number(row.installment_amount),
    frequency: row.frequency,
    startDate: pgDateOnly(row.start_date),
    status: row.status,
    interestOrMarkup: Number(row.interest_or_markup),
    discountAmount: Number(row.discount_amount || 0),
    markupAmount: Number(row.markup_amount || 0),
    markupWaived: Number(row.markup_waived || 0),
    markupEarned: Number(row.total_markup_earned || 0),
    settledEarlyAt: row.settled_early_at?.toISOString?.() || row.settled_early_at,
    settlementNote: row.settlement_note,
    outstandingBalance: Number(row.outstanding_balance || 0),
    createdBy: row.created_by,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
  };
}

function computeScheduleStatus(row) {
  const rawStatus = String(row.status || '').trim();
  if (['paid', 'settled', 'partial'].includes(rawStatus)) return rawStatus;

  const dueDate = pgDateOnly(row.due_date) || '';
  if (!dueDate) return rawStatus || 'pending';

  const today = todayDateOnly();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 2);
  const dueSoonCutoff = toDateOnly(cutoff);

  if (dueDate < today) return 'overdue';
  if (dueDate <= dueSoonCutoff) return 'due-soon';
  return rawStatus || 'pending';
}

export function mapSchedule(row) {
  if (!row) return null;
  return {
    id: row.id,
    planId: row.plan_id,
    installmentNumber: Number(row.installment_number),
    dueDate: pgDateOnly(row.due_date),
    amountDue: Number(row.amount_due),
    amountPaid: Number(row.amount_paid),
    principalDue: Number(row.principal_due || 0),
    principalPaid: Number(row.principal_paid || 0),
    markupAmount: Number(row.markup_amount || 0),
    markupEarned: Number(row.markup_earned || 0),
    markupWaived: Number(row.markup_waived || 0),
    status: computeScheduleStatus(row),
    paidDate: row.paid_date?.toISOString?.() || row.paid_date,
    closedReason: row.closed_reason,
  };
}

export function mapPayment(row) {
  if (!row) return null;
  return {
    id: row.id,
    planId: row.plan_id,
    scheduleId: row.schedule_id,
    customerId: row.customer_id,
    amount: Number(row.amount),
    method: row.method,
    receivedBy: row.received_by,
    receiptNumber: row.receipt_number,
    paidAt: row.paid_at?.toISOString?.() || row.paid_at,
    notes: row.notes,
    smsStatus: row.sms_status || null,
    status: row.status || 'posted',
    reversedAt: row.reversed_at?.toISOString?.() || row.reversed_at,
    reversedBy: row.reversed_by,
    reversalReason: row.reversal_reason,
    isEarlySettlement: row.is_early_settlement || false,
    markupWaived: Number(row.markup_waived || 0),
  };
}

export function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    permissions: row.permissions || [],
    status: row.status,
    lastLogin: row.last_login?.toISOString?.() || row.last_login,
    customerId: row.customer_id,
  };
}

export function mapProduct(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    categoryId: row.category_id,
    price: Number(row.price),
    sku: row.sku,
    status: row.status,
    imageUrl: row.image_url,
    stockQty: Number(row.stock_qty),
    description: row.description,
  };
}

export function mapCategory(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    parentCategoryId: row.parent_category_id,
  };
}

export function mapNotification(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    message: row.message,
    isRead: row.is_read,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    relatedEntityId: row.related_entity_id,
  };
}

export function mapAudit(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    timestamp: row.timestamp?.toISOString?.() || row.timestamp,
    details: row.details,
  };
}

export function mapSmsLog(row) {
  if (!row) return null;
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    phone: row.phone,
    message: row.message,
    alertType: row.alert_type,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    status: row.status,
    provider: row.provider,
    providerMessageId: row.provider_message_id,
    error: row.error,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
  };
}
