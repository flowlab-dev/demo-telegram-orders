// Price of a draft order. Money is kept in whole cents everywhere; the only
// place it becomes a string is money() at display time.

import { SHOP, itemById, leadHoursFor, unitPriceCents, variantById, zoneById } from './catalog.js';

export function quote(draft) {
  const item = itemById(draft.itemId);
  const unit = unitPriceCents(item, draft.variantId);
  if (unit === null || unit === undefined) return null;

  const qty = draft.qty || 1;
  const zone = zoneById(draft.zoneId);
  const deliveryCents = zone && !zone.unserved ? zone.feeCents : 0;
  const subtotalCents = unit * qty;

  const variant = variantById(item, draft.variantId);
  const label = variant ? `${item.title}, ${variant.title}` : item.title;

  return {
    itemLabel: label,
    unitCents: unit,
    qty,
    subtotalCents,
    deliveryCents,
    totalCents: subtotalCents + deliveryCents,
    leadHours: leadHoursFor(item),
    zoneTitle: zone ? zone.title : null,
  };
}

/** Delivery has a minimum basket; pickup never does. */
export function deliveryAllowed(draft) {
  const item = itemById(draft.itemId);
  const unit = unitPriceCents(item, draft.variantId);
  if (unit === null || unit === undefined) return false;
  return unit * (draft.qty || 1) >= SHOP.deliveryMinimumCents;
}
