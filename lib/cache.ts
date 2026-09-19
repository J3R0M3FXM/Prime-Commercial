// In-memory cache helper for server routes to avoid repeated Firestore queries
export const cacheStore = {
  products: null as any[] | null,
  lastProductsFetchTime: 0,

  orders: null as any[] | null,
  lastOrdersFetchTime: 0,

  adminOrders: null as any[] | null,
  lastAdminOrdersFetchTime: 0,

  customers: null as any[] | null,
  lastCustomersFetchTime: 0,

  charges: null as any[] | null,
  lastChargesFetchTime: 0,

  payments: null as any[] | null,
  lastPaymentsFetchTime: 0,

  couriers: null as any[] | null,
  lastCouriersFetchTime: 0,

  warehouses: null as any[] | null,
  lastWarehousesFetchTime: 0,

  promos: null as any[] | null,
  lastPromosFetchTime: 0,

  invalidateProducts() {
    this.products = null;
    this.lastProductsFetchTime = 0;
  },

  invalidateOrders() {
    this.orders = null;
    this.lastOrdersFetchTime = 0;
    this.adminOrders = null;
    this.lastAdminOrdersFetchTime = 0;
  },

  invalidateCustomers() {
    this.customers = null;
    this.lastCustomersFetchTime = 0;
  },

  invalidateCharges() {
    this.charges = null;
    this.lastChargesFetchTime = 0;
  },

  invalidatePayments() {
    this.payments = null;
    this.lastPaymentsFetchTime = 0;
  },

  invalidateCouriers() {
    this.couriers = null;
    this.lastCouriersFetchTime = 0;
  },

  invalidateWarehouses() {
    this.warehouses = null;
    this.lastWarehousesFetchTime = 0;
  },

  invalidatePromos() {
    this.promos = null;
    this.lastPromosFetchTime = 0;
  }
};
