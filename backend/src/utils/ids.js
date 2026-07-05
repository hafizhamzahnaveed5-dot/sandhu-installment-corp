import crypto from 'crypto';

export function newId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function receiptNumber(sequence) {
  return `RCP-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;
}
