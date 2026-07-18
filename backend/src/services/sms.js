import { config } from '../config.js';
import { pool } from '../db.js';
import { newId } from '../utils/ids.js';

const provider = 'twilio';

function isConfigured() {
  return Boolean(config.twilio.accountSid && config.twilio.authToken && config.twilio.phoneNumber);
}

function normalizePhone(phone) {
  const trimmed = String(phone || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('+')) return trimmed;
  if (trimmed.startsWith('00')) return `+${trimmed.slice(2)}`;
  if (trimmed.startsWith('0')) return `+92${trimmed.slice(1)}`;
  if (trimmed.startsWith('92')) return `+${trimmed}`;
  return trimmed;
}

async function logSms({ customerId, phone, message, alertType, referenceType, referenceId, status, providerMessageId = null, error = null }) {
  await pool.query(
    `INSERT INTO sms_notifications_log
     (id, customer_id, phone, message, alert_type, reference_type, reference_id, status, provider, provider_message_id, error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [newId('sms'), customerId, phone, message, alertType, referenceType, referenceId, status, provider, providerMessageId, error]
  );
}

export async function sendSms({ customerId, phone, message, alertType, referenceType, referenceId }) {
  const to = normalizePhone(phone);

  if (!to) {
    await logSms({ customerId, phone: '', message, alertType, referenceType, referenceId, status: 'failed', error: 'Missing recipient phone number.' });
    return { success: false, error: 'Missing recipient phone number.' };
  }

  if (!isConfigured()) {
    await logSms({ customerId, phone: to, message, alertType, referenceType, referenceId, status: 'failed', error: 'Twilio environment variables are not configured.' });
    return { success: false, error: 'Twilio environment variables are not configured.' };
  }

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.twilio.accountSid)}/Messages.json`;
  const body = new URLSearchParams({
    To: to,
    From: config.twilio.phoneNumber,
    Body: message,
  });

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.twilio.accountSid}:${config.twilio.authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = result.message || `Twilio HTTP ${response.status}`;
      await logSms({ customerId, phone: to, message, alertType, referenceType, referenceId, status: 'failed', error });
      return { success: false, error };
    }

    await logSms({
      customerId,
      phone: to,
      message,
      alertType,
      referenceType,
      referenceId,
      status: 'sent',
      providerMessageId: result.sid || null,
    });
    return { success: true, providerMessageId: result.sid || null };
  } catch (error) {
    await logSms({ customerId, phone: to, message, alertType, referenceType, referenceId, status: 'failed', error: error.message });
    return { success: false, error: error.message };
  }
}

export async function sendPaymentConfirmation(payment) {
  const result = await pool.query(
    `SELECT c.id, c.full_name, c.phone, c.sms_alerts_enabled
     FROM customers c
     WHERE c.id = $1`,
    [payment.customer_id || payment.customerId]
  );
  if (!result.rowCount) return { success: false, error: 'Customer not found for payment SMS.' };

  const customer = result.rows[0];
  const message = `Sandhu IC: Payment received PKR ${Number(payment.amount).toLocaleString('en-PK')} for receipt ${payment.receipt_number || payment.receiptNumber}. Thank you.`;

  if (!customer.sms_alerts_enabled) {
    await logSms({
      customerId: customer.id,
      phone: normalizePhone(customer.phone),
      message,
      alertType: 'payment-confirmation',
      referenceType: 'payment',
      referenceId: payment.id,
      status: 'skipped',
      error: 'Customer SMS alerts are disabled.',
    });
    return { success: false, skipped: true, error: 'Customer SMS alerts are disabled.' };
  }

  return sendSms({
    customerId: customer.id,
    phone: customer.phone,
    message,
    alertType: 'payment-confirmation',
    referenceType: 'payment',
    referenceId: payment.id,
  });
}

export async function runDueSmsSweep({ dueSoonDays = 2 } = {}) {
  const result = await pool.query(
    `SELECT
       s.id AS schedule_id,
       s.installment_number,
       s.due_date,
       s.amount_due,
       s.status,
       p.id AS plan_id,
       c.id AS customer_id,
       c.full_name,
       c.phone,
       CASE WHEN s.due_date < CURRENT_DATE THEN 'overdue' ELSE 'due-soon' END AS alert_type
     FROM installment_schedules s
     JOIN installment_plans p ON p.id = s.plan_id
     JOIN customers c ON c.id = p.customer_id
     WHERE c.sms_alerts_enabled = true
       AND s.status <> 'paid'
       AND s.due_date BETWEEN CURRENT_DATE - INTERVAL '30 days' AND CURRENT_DATE + ($1::int * INTERVAL '1 day')
       AND NOT EXISTS (
         SELECT 1 FROM sms_notifications_log l
         WHERE l.reference_type = 'schedule'
           AND l.reference_id = s.id
           AND l.alert_type = CASE WHEN s.due_date < CURRENT_DATE THEN 'overdue' ELSE 'due-soon' END
           AND l.status = 'sent'
       )`,
    [dueSoonDays]
  );

  let sent = 0;
  let failed = 0;

  for (const row of result.rows) {
    const amount = Number(row.amount_due).toLocaleString('en-PK');
    const dueDate = row.due_date?.toISOString?.().slice(0, 10) || row.due_date;
    const message = row.alert_type === 'overdue'
      ? `Sandhu IC: Installment #${row.installment_number} is overdue. Amount due PKR ${amount}. Please pay as soon as possible.`
      : `Sandhu IC: Installment #${row.installment_number} is due on ${dueDate}. Amount due PKR ${amount}.`;

    const sms = await sendSms({
      customerId: row.customer_id,
      phone: row.phone,
      message,
      alertType: row.alert_type,
      referenceType: 'schedule',
      referenceId: row.schedule_id,
    });

    if (sms.success) sent += 1;
    else failed += 1;
  }

  return { checked: result.rowCount, sent, failed };
}

export function scheduleDailySmsSweep() {
  // Serverless (Vercel) has no long-lived process — skip interval scheduler
  if (process.env.VERCEL || !config.smsSchedulerEnabled) return null;
  const dayMs = 24 * 60 * 60 * 1000;
  const run = () => runDueSmsSweep().catch((error) => {
    console.error('[sms] due/overdue sweep failed:', error);
  });
  const initial = setTimeout(run, 30_000);
  const interval = setInterval(run, dayMs);
  return { initial, interval };
}
