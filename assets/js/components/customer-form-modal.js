import AuthService from '../services/auth.service.js';
import CustomersService from '../services/customers.service.js';
import Modal from './modal.js';
import Toast from './toast.js';

function escapeAttr(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fieldValue(customer, key) {
  return escapeAttr(customer?.[key] || '');
}

function getPayload(modal) {
  return {
    fullName:       modal.backdrop.querySelector('#c-fullName').value.trim(),
    phone:          modal.backdrop.querySelector('#c-phone').value.trim(),
    city:           modal.backdrop.querySelector('#c-city').value.trim(),
    cnicOrId:       modal.backdrop.querySelector('#c-cnic').value.trim(),
    email:          modal.backdrop.querySelector('#c-email').value.trim(),
    address:        modal.backdrop.querySelector('#c-address').value.trim(),
    status:         modal.backdrop.querySelector('#c-status').value,
    guarantorName:  modal.backdrop.querySelector('#c-guarantorName').value.trim(),
    guarantorPhone: modal.backdrop.querySelector('#c-guarantorPhone').value.trim(),
    notes:          modal.backdrop.querySelector('#c-notes').value.trim(),
    creditScore:    Number(modal.backdrop.querySelector('#c-creditScore')?.value || 0),
    smsAlertsEnabled: modal.backdrop.querySelector('#c-smsAlertsEnabled')?.checked ?? true,
  };
}

export function openCustomerFormModal({ mode = 'add', customer = null, onSaved = null, onDeleted = null } = {}) {
  const isEdit = mode === 'edit';
  const canDelete = isEdit && AuthService.isAdmin();

  const formHtml = `
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Full Name <span class="required">*</span></label>
        <input type="text" id="c-fullName" class="form-control" placeholder="Muhammad Ali Khan" value="${fieldValue(customer, 'fullName')}" required/>
      </div>
      <div class="form-group">
        <label class="form-label">CNIC / ID</label>
        <input type="text" id="c-cnic" class="form-control" placeholder="35202-XXXXXXX-X" value="${fieldValue(customer, 'cnicOrId')}"/>
      </div>
      <div class="form-group">
        <label class="form-label">Phone <span class="required">*</span></label>
        <input type="tel" id="c-phone" class="form-control" placeholder="+923001234567" value="${fieldValue(customer, 'phone')}" required/>
      </div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input type="email" id="c-email" class="form-control" placeholder="customer@email.com" value="${fieldValue(customer, 'email')}"/>
      </div>
      <div class="form-group full-width">
        <label class="form-label">Address</label>
        <input type="text" id="c-address" class="form-control" placeholder="House #, Street, Area" value="${fieldValue(customer, 'address')}"/>
      </div>
      <div class="form-group">
        <label class="form-label">City <span class="required">*</span></label>
        <input type="text" id="c-city" class="form-control" placeholder="Lahore" value="${fieldValue(customer, 'city')}" required/>
      </div>
      <div class="form-group">
        <label class="form-label">Status</label>
        <select id="c-status" class="form-control">
          <option value="active" ${customer?.status === 'active' ? 'selected' : ''}>Active</option>
          <option value="inactive" ${customer?.status === 'inactive' ? 'selected' : ''}>Inactive</option>
          <option value="blacklisted" ${customer?.status === 'blacklisted' ? 'selected' : ''}>Blacklisted</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Credit Score</label>
        <input type="number" id="c-creditScore" class="form-control" min="0" max="999" value="${escapeAttr(customer?.creditScore ?? 0)}"/>
      </div>
      <div class="form-group">
        <label class="form-label">Guarantor Name</label>
        <input type="text" id="c-guarantorName" class="form-control" placeholder="Guarantor full name" value="${fieldValue(customer, 'guarantorName')}"/>
      </div>
      <div class="form-group">
        <label class="form-label">Guarantor Phone</label>
        <input type="tel" id="c-guarantorPhone" class="form-control" placeholder="+92..." value="${fieldValue(customer, 'guarantorPhone')}"/>
      </div>
      <div class="form-group full-width">
        <label class="form-label">Notes</label>
        <textarea id="c-notes" class="form-control" rows="2" placeholder="Any notes about this customer...">${escapeAttr(customer?.notes || '')}</textarea>
      </div>
      <div class="form-group full-width">
        <label class="checkbox-group" style="min-height:44px">
          <input type="checkbox" id="c-smsAlertsEnabled" ${customer?.smsAlertsEnabled === false ? '' : 'checked'}/>
          <span>
            <span style="display:block;font-size:14px;color:var(--color-text-primary);font-weight:500">SMS alerts enabled</span>
            <span style="display:block;font-size:12px;color:var(--color-text-tertiary)">Send due, overdue, and payment confirmation texts to this customer.</span>
          </span>
        </label>
      </div>
      ${canDelete ? `
        <div class="form-group full-width" style="border-top:1px solid var(--color-border);padding-top:var(--space-4)">
          <div class="alert alert-danger" style="margin-bottom:var(--space-3)">
            Delete is restricted to Super Admin and blocked when open installment plans exist.
          </div>
          <button class="btn btn-danger" id="delete-customer-btn" type="button">Delete Customer</button>
        </div>
      ` : ''}
    </div>
  `;

  const footer = `
    <button class="btn btn-secondary" id="cancel-customer-form">Cancel</button>
    <button class="btn btn-primary" id="save-customer-form">${isEdit ? 'Save Changes' : 'Add Customer'}</button>
  `;

  const modal = Modal.create({
    title: isEdit ? 'Edit Customer' : 'Add New Customer',
    content: formHtml,
    footer,
    size: 'lg',
  });

  modal.open();

  modal.backdrop.querySelector('#cancel-customer-form').addEventListener('click', modal.destroy);
  modal.backdrop.querySelector('#save-customer-form').addEventListener('click', async () => {
    const payload = getPayload(modal);
    if (!payload.fullName || !payload.phone || !payload.city) {
      Toast.warning('Validation error', 'Full Name, Phone, and City are required.');
      return;
    }

    const btn = modal.backdrop.querySelector('#save-customer-form');
    btn.classList.add('loading');

    const result = isEdit
      ? await CustomersService.update(customer.id, payload)
      : await CustomersService.create(payload);

    btn.classList.remove('loading');

    if (result.success) {
      Toast.success(isEdit ? 'Customer updated' : 'Customer added', `${payload.fullName} has been saved.`);
      modal.destroy();
      await onSaved?.(result.data);
    } else {
      Toast.error('Failed', result.error);
    }
  });

  modal.backdrop.querySelector('#delete-customer-btn')?.addEventListener('click', async () => {
    const settled = Number(customer?.totalOutstanding || 0) === 0;
    const ok = await Modal.confirm(
      'Delete Customer?',
      settled
        ? 'This customer has 0 outstanding. Admin delete will remove their settled history permanently.'
        : 'Are you sure? This cannot be undone. Customers with outstanding balance cannot be deleted.'
    );
    if (!ok) return;

    const btn = modal.backdrop.querySelector('#delete-customer-btn');
    btn.classList.add('loading');
    const result = await CustomersService.delete(customer.id, { forceZero: settled && AuthService.isAdmin() });
    btn.classList.remove('loading');

    if (result.success) {
      Toast.success('Customer deleted', `${customer.fullName} has been removed.`);
      modal.destroy();
      await onDeleted?.(customer);
    } else {
      Toast.error('Delete blocked', result.error);
    }
  });
}
