import { newId } from '../utils/ids.js';

export async function writeAudit(client, userId, action, entityType, entityId, details) {
  const id = newId('audit');
  await client.query(
    `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, userId || 'system', action, entityType, entityId, details]
  );
}
