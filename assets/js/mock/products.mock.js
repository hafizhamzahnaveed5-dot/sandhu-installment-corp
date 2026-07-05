/**
 * products.mock.js — Mock products, categories, and users
 */

export const MOCK_CATEGORIES = [
  { id: 'cat-001', name: 'Electronics', parentCategoryId: null },
  { id: 'cat-002', name: 'Home Appliances', parentCategoryId: null },
  { id: 'cat-003', name: 'Furniture', parentCategoryId: null },
  { id: 'cat-004', name: 'Mobile Phones', parentCategoryId: 'cat-001' },
  { id: 'cat-005', name: 'Laptops', parentCategoryId: 'cat-001' },
];

export const MOCK_PRODUCTS = [
  {
    id: 'prod-001',
    name: 'Samsung Galaxy A54 5G',
    categoryId: 'cat-004',
    price: 75000,
    sku: 'SAM-A54-BLK',
    status: 'active',
    imageUrl: null,
    stockQty: 12,
    description: '128GB, 6GB RAM, Black',
  },
  {
    id: 'prod-002',
    name: 'Dell Inspiron 15 Laptop',
    categoryId: 'cat-005',
    price: 120000,
    sku: 'DELL-INS15-SLV',
    status: 'active',
    imageUrl: null,
    stockQty: 5,
    description: 'Intel Core i5, 8GB RAM, 512GB SSD',
  },
  {
    id: 'prod-003',
    name: 'Haier Split AC 1.5 Ton',
    categoryId: 'cat-002',
    price: 85000,
    sku: 'HAIER-AC-15T',
    status: 'active',
    imageUrl: null,
    stockQty: 8,
    description: 'Inverter technology, 1.5 ton',
  },
  {
    id: 'prod-004',
    name: 'LED TV 43 inch',
    categoryId: 'cat-001',
    price: 55000,
    sku: 'LED-TV-43',
    status: 'active',
    imageUrl: null,
    stockQty: 6,
    description: '4K Ultra HD Smart TV',
  },
  {
    id: 'prod-005',
    name: 'Sofa Set 5-Seater',
    categoryId: 'cat-003',
    price: 65000,
    sku: 'SOFA-5S-BRN',
    status: 'active',
    imageUrl: null,
    stockQty: 3,
    description: 'Premium fabric, brown color',
  },
];

export const MOCK_USERS = [
  {
    id: 'user-001',
    name: 'Sandhu Admin',
    email: 'admin@sandhuinstallments.com',
    role: 'admin',
    permissions: ['*'],
    lastLogin: '2024-07-05T06:00:00Z',
    status: 'active',
    password: 'admin123', // DECISION: mock only. Real auth uses hashed passwords server-side.
  },
  {
    id: 'user-002',
    name: 'Hamza Ahmed',
    email: 'hamza@sandhuinstallments.com',
    role: 'manager',
    permissions: ['customers.read', 'customers.write', 'installments.*', 'payments.*', 'reports.read'],
    lastLogin: '2024-07-04T14:30:00Z',
    status: 'active',
    password: 'manager123',
  },
  {
    id: 'user-003',
    name: 'Sara Ali',
    email: 'sara@sandhuinstallments.com',
    role: 'agent',
    permissions: ['customers.read', 'installments.read', 'payments.create'],
    lastLogin: '2024-07-03T09:00:00Z',
    status: 'active',
    password: 'agent123',
  },
];

export const MOCK_NOTIFICATIONS = [
  {
    id: 'notif-001',
    userId: 'user-001',
    type: 'overdue',
    message: 'Installment overdue for Muhammad Arif Khan — Plan #plan-001, Installment 4',
    isRead: false,
    createdAt: '2024-07-05T06:00:00Z',
    relatedEntityId: 'plan-001',
  },
  {
    id: 'notif-002',
    userId: 'user-001',
    type: 'due-soon',
    message: 'Installment due in 3 days — Bilal Ahmad Sheikh, Plan #plan-005',
    isRead: false,
    createdAt: '2024-07-04T18:00:00Z',
    relatedEntityId: 'plan-005',
  },
  {
    id: 'notif-003',
    userId: 'user-001',
    type: 'payment',
    message: 'Payment received: PKR 5,625 from Fatima Bibi',
    isRead: true,
    createdAt: '2024-07-03T11:45:00Z',
    relatedEntityId: 'pay-006',
  },
  {
    id: 'notif-004',
    userId: 'user-001',
    type: 'new-customer',
    message: 'New customer registered: Sadia Iqbal',
    isRead: true,
    createdAt: '2024-05-15T08:05:00Z',
    relatedEntityId: 'cust-008',
  },
];

export const MOCK_AUDIT_LOGS = [
  {
    id: 'audit-001',
    userId: 'user-001',
    action: 'CREATE',
    entityType: 'Customer',
    entityId: 'cust-008',
    timestamp: '2024-05-15T08:00:00Z',
    details: 'Created customer: Sadia Iqbal',
  },
  {
    id: 'audit-002',
    userId: 'user-002',
    action: 'CREATE',
    entityType: 'Payment',
    entityId: 'pay-006',
    timestamp: '2024-05-04T10:00:00Z',
    details: 'Payment recorded: PKR 5,625 for plan-002',
  },
  {
    id: 'audit-003',
    userId: 'user-001',
    action: 'UPDATE',
    entityType: 'Customer',
    entityId: 'cust-006',
    timestamp: '2024-01-10T15:00:00Z',
    details: 'Status changed to blacklisted',
  },
];
