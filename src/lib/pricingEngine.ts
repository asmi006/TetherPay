import {
  CATALOG,
  MAX_TRANSACTION_LIMIT_INR,
  MIN_MERCHANT_MARGIN_FLOOR,
  type Product,
} from "./catalog";

export interface CartBreakdown {
  productId: string;
  name: string;
  quantity: number;
  unitPriceINR: number;
  costPriceINR: number;
  subtotalINR: number;
}

export interface PricingEvaluation {
  allowed: boolean;
  finalAmountINR: number;
  marginPercent: number;
  discountAppliedINR: number;
  breakdown: CartBreakdown[];
  reason: string;
  shieldTriggered: boolean;
}

const HEADPHONES_ID = "aura-anc-headphones";
const TRAVEL_CASE_ID = "hard-shell-eva-travel-case";
const BUNDLE_CASE_PRICE_INR = 599;

function roundCurrency(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function findProduct(itemId: string): Product | undefined {
  return CATALOG.find((product) => product.id === itemId);
}

export function evaluateCartAndNegotiation(
  itemIds: string[],
  proposedTotal?: number,
): PricingEvaluation {
  const products = itemIds.map(findProduct);
  const unknownItem = products.some((product) => product === undefined);

  if (unknownItem) {
    return {
      allowed: false,
      finalAmountINR: 0,
      marginPercent: 0,
      discountAppliedINR: 0,
      breakdown: [],
      reason: "One or more items are not present in the catalog.",
      shieldTriggered: false,
    };
  }

  const selectedProducts = products as Product[];
  const hasHeadphones = selectedProducts.some(
    (product) => product.id === HEADPHONES_ID,
  );
  const breakdown = selectedProducts.map((product) => {
    const unitPriceINR =
      hasHeadphones && product.id === TRAVEL_CASE_ID
        ? BUNDLE_CASE_PRICE_INR
        : product.retailPrice;

    return {
      productId: product.id,
      name: product.name,
      quantity: 1,
      unitPriceINR,
      costPriceINR: product.costPrice,
      subtotalINR: unitPriceINR,
    };
  });

  const retailTotalINR = selectedProducts.reduce(
    (total, product) => total + product.retailPrice,
    0,
  );
  const costTotalINR = selectedProducts.reduce(
    (total, product) => total + product.costPrice,
    0,
  );
  const bundleTotalINR = breakdown.reduce(
    (total, item) => total + item.subtotalINR,
    0,
  );
  const discountAppliedINR = roundCurrency(retailTotalINR - bundleTotalINR);
  const finalAmountINR = roundCurrency(proposedTotal ?? bundleTotalINR);
  const marginPercent =
    finalAmountINR === 0
      ? 0
      : roundCurrency(((finalAmountINR - costTotalINR) / finalAmountINR) * 100);
  const shieldTriggered =
    proposedTotal !== undefined &&
    marginPercent / 100 < MIN_MERCHANT_MARGIN_FLOOR;
  const exceedsLimit = finalAmountINR > MAX_TRANSACTION_LIMIT_INR;
  const allowed = !shieldTriggered && !exceedsLimit;

  return {
    allowed,
    finalAmountINR,
    marginPercent,
    discountAppliedINR,
    breakdown,
    reason: exceedsLimit
      ? `Transaction exceeds the INR ${MAX_TRANSACTION_LIMIT_INR} limit.`
      : shieldTriggered
        ? "Proposed total falls below the minimum merchant margin floor."
        : "Cart pricing approved.",
    shieldTriggered,
  };
}