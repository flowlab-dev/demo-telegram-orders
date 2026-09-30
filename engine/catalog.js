// Cedarline Bakehouse - menu, prices and shop rules.
// Everything the owner would change month to month lives in this one file:
// prices, lead times, delivery zones and opening days. No logic here, only data.

export const SHOP = {
  name: 'Cedarline Bakehouse',
  currency: 'USD',
  symbol: '$',
  timezoneLabel: 'shop local time',
  // 0 = Sunday ... 6 = Saturday. The bakehouse is closed on Mondays.
  closedWeekdays: [1],
  pickup: { from: '08:00', to: '18:00' },
  // Orders below this total cannot be delivered - the bot offers pickup instead.
  deliveryMinimumCents: 2500,
  // How far ahead an order may be placed.
  maxDaysAhead: 60,
  // Where a customer is sent when the answer needs a person and the shop is closed.
  humanHandoff: '@cedarline_orders',
};

export const CATEGORIES = [
  { id: 'cake', title: 'Celebration cakes', leadHours: 48, note: 'baked to order, 48 hours notice' },
  { id: 'platter', title: 'Office platters', leadHours: 24, note: 'for meetings and events, 24 hours notice' },
  { id: 'bread', title: 'Bread boxes', leadHours: 12, note: 'next-morning bread, 12 hours notice' },
];

// priceCents is per unit. Items with variants take their price from the variant.
export const ITEMS = [
  {
    id: 'vanilla', categoryId: 'cake', title: 'Classic vanilla layer cake',
    description: 'Vanilla sponge, mascarpone cream, seasonal fruit.',
    maxQty: 3, allowsInscription: true,
    variants: [
      { id: '6', title: '6 servings', priceCents: 4200 },
      { id: '10', title: '10 servings', priceCents: 6400 },
      { id: '16', title: '16 servings', priceCents: 9200 },
    ],
  },
  {
    id: 'chocolate', categoryId: 'cake', title: 'Dark chocolate fudge cake',
    description: '70% chocolate, salted caramel layer.',
    maxQty: 3, allowsInscription: true,
    variants: [
      { id: '6', title: '6 servings', priceCents: 4600 },
      { id: '10', title: '10 servings', priceCents: 7000 },
      { id: '16', title: '16 servings', priceCents: 9900 },
    ],
  },
  {
    id: 'lemon', categoryId: 'cake', title: 'Lemon & elderflower cake',
    description: 'Lemon curd, elderflower syrup, white chocolate shards.',
    maxQty: 3, allowsInscription: true,
    variants: [
      { id: '6', title: '6 servings', priceCents: 4800 },
      { id: '10', title: '10 servings', priceCents: 7400 },
      { id: '16', title: '16 servings', priceCents: 10400 },
    ],
  },
  {
    id: 'pastry', categoryId: 'platter', title: 'Morning pastry platter',
    description: '12 pieces: croissants, pain au chocolat, cinnamon knots.',
    priceCents: 3800, maxQty: 10,
  },
  {
    id: 'sandwich', categoryId: 'platter', title: 'Sandwich & focaccia platter',
    description: '10 portions, half of them vegetarian.',
    priceCents: 5400, maxQty: 10,
  },
  {
    id: 'cookie', categoryId: 'platter', title: 'Cookie box',
    description: '24 pieces, four kinds.',
    priceCents: 3200, maxQty: 10,
  },
  {
    id: 'sourdough', categoryId: 'bread', title: 'Sourdough duo',
    description: 'Two 900 g country loaves.',
    priceCents: 1400, maxQty: 12,
  },
  {
    id: 'rye', categoryId: 'bread', title: 'Seeded rye loaf',
    description: 'Sunflower, flax and pumpkin seeds.',
    priceCents: 900, maxQty: 12,
  },
  {
    id: 'brioche', categoryId: 'bread', title: 'Brioche buns (6)',
    description: 'Soft burger-size buns, baked the same morning.',
    priceCents: 1100, maxQty: 12,
  },
];

export const ZONES = [
  { id: 'pickup', title: 'I will pick it up', cardTitle: 'Pickup at the bakehouse', feeCents: 0, pickup: true },
  { id: 'a', title: 'Delivery - city centre (up to 5 km)', cardTitle: 'Delivery, city centre (up to 5 km)', feeCents: 600 },
  { id: 'b', title: 'Delivery - outer districts (5-12 km)', cardTitle: 'Delivery, outer districts (5-12 km)', feeCents: 1100 },
  { id: 'far', title: 'Delivery - further than 12 km', cardTitle: 'Further than 12 km', feeCents: null, unserved: true },
];

export function categoryById(id) {
  return CATEGORIES.find((c) => c.id === id) || null;
}

export function itemById(id) {
  return ITEMS.find((i) => i.id === id) || null;
}

export function itemsInCategory(id) {
  return ITEMS.filter((i) => i.categoryId === id);
}

export function variantById(item, variantId) {
  if (!item || !item.variants) return null;
  return item.variants.find((v) => v.id === variantId) || null;
}

export function zoneById(id) {
  return ZONES.find((z) => z.id === id) || null;
}

export function unitPriceCents(item, variantId) {
  if (!item) return null;
  if (item.variants) {
    const v = variantById(item, variantId);
    return v ? v.priceCents : null;
  }
  return item.priceCents;
}

export function leadHoursFor(item) {
  const category = categoryById(item ? item.categoryId : null);
  return category ? category.leadHours : 0;
}
