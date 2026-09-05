import { getItem } from "../items/items";

/** A shop's per-item listing with authoritative integer prices. */
export interface ShopItemListing {
  readonly itemId: string;
  readonly buyPrice: number;
  readonly sellPrice: number;
}

/** Data-driven shop definition (original dark-fantasy names). */
export interface ShopDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly items: readonly ShopItemListing[];
}

export const SHOP_DEFINITIONS: readonly ShopDefinition[] = [
  {
    id: "gravekeepers_armory",
    name: "Gravekeeper's Armory",
    description: "Forged blades and plate recovered from the barrow-fields.",
    items: [
      { itemId: "iron_longsword", buyPrice: 120, sellPrice: 60 },
      { itemId: "gravewarden_blade", buyPrice: 260, sellPrice: 130 },
      { itemId: "ashen_plate", buyPrice: 200, sellPrice: 100 },
      { itemId: "bloodstone_ring", buyPrice: 150, sellPrice: 75 },
    ],
  },
  {
    id: "black_ash_general",
    name: "Black Ash General Store",
    description: "Common goods and sundries, in no particular order.",
    items: [
      { itemId: "grave_dust", buyPrice: 8, sellPrice: 4 },
      { itemId: "reviving_wisp", buyPrice: 40, sellPrice: 20 },
      { itemId: "iron_longsword", buyPrice: 120, sellPrice: 60 },
    ],
  },
  {
    id: "moonlit_reliquary",
    name: "Moonlit Reliquary",
    description: "A quiet shop of cloaks, rings, and old relics.",
    items: [
      { itemId: "nightveil_cloak", buyPrice: 180, sellPrice: 90 },
      { itemId: "bloodstone_ring", buyPrice: 150, sellPrice: 75 },
      { itemId: "reviving_wisp", buyPrice: 40, sellPrice: 20 },
    ],
  },
];

const REGISTRY: ReadonlyMap<string, ShopDefinition> = (() => {
  const map = new Map<string, ShopDefinition>();
  for (const shop of SHOP_DEFINITIONS) {
    if (map.has(shop.id)) throw new Error(`Duplicate shop id "${shop.id}"`);
    // Validate listings reference real items.
    for (const listing of shop.items) {
      if (!getItem(listing.itemId)) {
        throw new Error(`Shop "${shop.id}" lists unknown item "${listing.itemId}"`);
      }
    }
    map.set(shop.id, shop);
  }
  return map;
})();

export function getShop(id: string): ShopDefinition | null {
  return REGISTRY.get(id) ?? null;
}

export function allShops(): readonly ShopDefinition[] {
  return SHOP_DEFINITIONS;
}

export function listShopIds(): readonly string[] {
  return [...REGISTRY.keys()];
}

export function hasShop(id: string): boolean {
  return REGISTRY.has(id);
}

/** Authoritative buy price for `itemId` in `shop` (server-side). */
export function buyPrice(shop: ShopDefinition, itemId: string): number | null {
  return shop.items.find((l) => l.itemId === itemId)?.buyPrice ?? null;
}

/** Authoritative sell price for `itemId` in `shop` (server-side). */
export function sellPrice(shop: ShopDefinition, itemId: string): number | null {
  return shop.items.find((l) => l.itemId === itemId)?.sellPrice ?? null;
}
