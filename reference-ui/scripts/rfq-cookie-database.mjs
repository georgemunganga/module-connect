// Exact private RFQ cohort admission; a PO fixture cannot substitute for this proof.
export const isRfqCookieDatabase = value => typeof value === 'string'
  && /^proc_p30_http_rfq_[a-z0-9_]{1,40}$/.test(value) && value.length <= 63;
