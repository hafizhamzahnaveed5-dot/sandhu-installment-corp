/**
 * modal.js — Modal component
 * 
 * Usage:
 *   const modal = Modal.create({ title: 'Edit', content: '<p>...</p>', size: 'lg' });
 *   modal.open();
 *   modal.close();
 *   modal.destroy();
 * 
 * Or quick confirm:
 *   Modal.confirm('Delete?', 'This cannot be undone.').then(ok => { if (ok) ... });
 */

function create({ title = '', content = '', size = '', footer = null, onClose = null } = {}) {
  const sizeClass = size ? `modal-${size}` : '';

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal ${sizeClass}" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="btn btn-ghost btn-icon modal-close-btn" aria-label="Close modal">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="modal-body">${content}</div>
      ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
    </div>
  `;

  document.body.appendChild(backdrop);

  const closeBtn = backdrop.querySelector('.modal-close-btn');
  const modalEl  = backdrop.querySelector('.modal');

  const open = () => {
    requestAnimationFrame(() => backdrop.classList.add('visible'));
    document.body.style.overflow = 'hidden';
  };

  const close = () => {
    backdrop.classList.remove('visible');
    document.body.style.overflow = '';
    onClose?.();
  };

  const destroy = () => {
    close();
    setTimeout(() => backdrop.remove(), 300);
  };

  closeBtn.addEventListener('click', destroy);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) destroy(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { destroy(); document.removeEventListener('keydown', esc); }
  });

  return { open, close, destroy, backdrop, modalEl };
}

/** Quick confirmation dialog */
function confirm(title, message) {
  return new Promise(resolve => {
    const footer = `
      <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
      <button class="btn btn-danger" id="modal-confirm">Confirm</button>
    `;
    const modal = create({ title, content: `<p>${message}</p>`, footer });
    modal.backdrop.querySelector('#modal-cancel').addEventListener('click', () => { modal.destroy(); resolve(false); });
    modal.backdrop.querySelector('#modal-confirm').addEventListener('click', () => { modal.destroy(); resolve(true); });
    modal.open();
  });
}

const Modal = { create, confirm };
export default Modal;
