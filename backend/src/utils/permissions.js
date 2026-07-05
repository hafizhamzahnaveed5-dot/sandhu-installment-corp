export const rolePermissions = {
  admin: ['*'],
  manager: ['customers.read', 'customers.write', 'installments.*', 'payments.*', 'reports.read'],
  agent: ['customers.read', 'installments.read', 'payments.create'],
  customer: ['my-plan.read', 'my-payments.read'],
};

const roleRank = { customer: 1, agent: 2, manager: 3, admin: 4 };

export function permissionsFor(role) {
  return rolePermissions[role] || rolePermissions.agent;
}

export function atLeast(role, minRole) {
  return (roleRank[role] || 0) >= (roleRank[minRole] || 0);
}
