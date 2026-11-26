export const SERVICE_PACKAGES = {
  WITH_DRIVER: ['HOURS_12', 'HOURS_4'],
  SELF_DRIVE: ['DAILY', 'MONTHLY', 'YEARLY'],
};

export const PACKAGE_PRICE_FIELD = {
  HOURS_4: 'priceDriver4h',
  HOURS_12: 'priceDriver12h',
  DAILY: 'priceDaily',
  MONTHLY: 'priceMonthly',
  YEARLY: 'priceYearly',
};

export const MAX_QTY = { HOURS_4: 14, HOURS_12: 14, DAILY: 30, MONTHLY: 12, YEARLY: 3 };

export const STATUS_TONE = {
  PENDING_PAYMENT: 'amber',
  PAID: 'blue',
  CONFIRMED: 'brand',
  ONGOING: 'violet',
  COMPLETED: 'slate',
  EXPIRED: 'slate',
  CANCELLED: 'red',
  REFUNDED: 'slate',
};

export const ACTIVE_STATUSES = ['PENDING_PAYMENT', 'PAID', 'CONFIRMED', 'ONGOING'];
