/**
 * event-bus.js — Lightweight pub/sub event bus
 * When data changes (payment recorded, customer added, installment created),
 * charts/KPI cards subscribe and re-render automatically without page refresh.
 *
 * Events:
 *   'payment:recorded'    — after InstallmentsService.recordPayment()
 *   'installment:created' — after InstallmentsService.createPlan()
 *   'customer:created'    — after CustomersService.create()
 *   'data:changed'        — generic, fired after ALL mutations (catch-all)
 */
const EventBus = {
  _listeners: {},

  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    // Return unsubscribe function
    return () => this.off(event, fn);
  },

  off(event, fn) {
    this._listeners[event] = (this._listeners[event] || []).filter(f => f !== fn);
  },

  emit(event, data) {
    (this._listeners[event] || []).slice().forEach(fn => {
      try { fn(data); } catch(e) { console.error('[EventBus]', event, e); }
    });
    // Also fire the generic catch-all (unless it IS the catch-all)
    if (event !== 'data:changed') {
      (this._listeners['data:changed'] || []).slice().forEach(fn => {
        try { fn({ event, data }); } catch(e) {}
      });
    }
  },

  once(event, fn) {
    const unsub = this.on(event, (...args) => { fn(...args); unsub(); });
  },

  clear() {
    this._listeners = {};
  },
};

export default EventBus;
