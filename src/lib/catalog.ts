export interface Product {
  id: string;
  name: string;
  retailPrice: number;
  costPrice: number;
  stock: number;
  category: string;
  upsellEligible: boolean;
}

export const CATALOG: Product[] = [
  {
    id: "aura-anc-headphones",
    name: "Aura ANC Headphones",
    retailPrice: 4299,
    costPrice: 2600,
    stock: 100,
    category: "audio",
    upsellEligible: true,
  },
  {
    id: "hard-shell-eva-travel-case",
    name: "Hard-Shell Eva Travel Case",
    retailPrice: 799,
    costPrice: 280,
    stock: 100,
    category: "accessory",
    upsellEligible: true,
  },
  {
    id: "vegan-leather-desk-mat",
    name: "Vegan Leather Desk Mat",
    retailPrice: 1299,
    costPrice: 500,
    stock: 100,
    category: "workspace",
    upsellEligible: false,
  },
];

export const MAX_TRANSACTION_LIMIT_INR = 7500;
export const MIN_MERCHANT_MARGIN_FLOOR = 0.20;