import { NextResponse } from "next/server";

import {
  CATALOG,
  MAX_TRANSACTION_LIMIT_INR,
  MIN_MERCHANT_MARGIN_FLOOR,
} from "@/lib/catalog";

export function GET() {
  return NextResponse.json({
    server: "TetherPay-Merchant-Agent",
    protocol: "mcp-v1",
    tools: [
      {
        name: "get_catalog",
        description: "Reads catalog items, stock, and baseline prices.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
      {
        name: "negotiate_bundle_order",
        description:
          "Automates machine-to-machine checkout for a bundle within merchant bounds.",
        inputSchema: {
          type: "object",
          properties: {
            itemIds: {
              type: "array",
              items: { type: "string" },
              description: "Catalog item IDs to include in the order.",
            },
            proposedBudget: {
              type: "number",
              description: "Optional proposed checkout budget in INR.",
            },
          },
          required: ["itemIds"],
          additionalProperties: false,
        },
      },
    ],
    bounds: {
      MAX_TRANSACTION_LIMIT_INR,
      MIN_MERCHANT_MARGIN_FLOOR,
    },
    catalog: CATALOG,
  });
}