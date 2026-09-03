import Razorpay from "razorpay";
import { NextResponse } from "next/server";

import { evaluateCartAndNegotiation } from "@/lib/pricingEngine";

export const runtime = "nodejs";

interface RazorpayRequestBody {
  action?: unknown;
  itemIds?: unknown;
  proposedTotal?: unknown;
}

export async function POST(request: Request) {
  let body: RazorpayRequestBody;

  try {
    body = (await request.json()) as RazorpayRequestBody;
  } catch {
    return NextResponse.json(
      { success: false, error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const { action, itemIds, proposedTotal } = body;
  if (
    !Array.isArray(itemIds) ||
    !itemIds.every((itemId): itemId is string => typeof itemId === "string") ||
    (proposedTotal !== undefined &&
      (typeof proposedTotal !== "number" || !Number.isFinite(proposedTotal)))
  ) {
    return NextResponse.json(
      { success: false, error: "itemIds and proposedTotal are invalid." },
      { status: 400 },
    );
  }

  const evaluation = evaluateCartAndNegotiation(itemIds, proposedTotal);

  if (evaluation.shieldTriggered) {
    return NextResponse.json(
      {
        success: false,
        error: evaluation.reason,
        shieldTriggered: true,
      },
      { status: 400 },
    );
  }

  if (!evaluation.allowed) {
    return NextResponse.json(
      { success: false, error: evaluation.reason, evaluation },
      { status: 422 },
    );
  }

  const isMockMode =
    !process.env.RAZORPAY_KEY_SECRET ||
    process.env.RAZORPAY_KEY_SECRET === "YOUR_KEY_SECRET";

  if (isMockMode) {
    if (action === "create_recovery_link") {
      const amount = Math.round(evaluation.finalAmountINR * 0.95);
      return NextResponse.json({
        success: true,
        recoveryUrl: `http://localhost:3000?recovery_token=${Date.now()}`,
        amount,
        evaluation,
        isMock: true,
      });
    }

    return NextResponse.json({
      success: true,
      orderId: `order_mock_${Math.random().toString(36).substring(2, 9)}`,
      amount: evaluation.finalAmountINR,
      evaluation,
      isMock: true,
    });
  }

  try {
    const razorpay = new Razorpay({
      key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    if (action === "create_recovery_link") {
      const discountedAmount = Math.round(evaluation.finalAmountINR * 0.95);
      const paymentLink = await razorpay.paymentLink.create({
        amount: discountedAmount * 100,
        currency: "INR",
        expire_by: Math.floor(Date.now() / 1000) + 15 * 60,
        customer: {
          name: "TetherPay Customer",
          email: "customer@example.com",
          contact: "+919999999999",
        },
      });

      return NextResponse.json({
        success: true,
        recoveryUrl: paymentLink.short_url,
        amount: discountedAmount,
        evaluation,
      });
    }

    const order = await razorpay.orders.create({
      amount: evaluation.finalAmountINR * 100,
      currency: "INR",
    });

    return NextResponse.json({
      success: true,
      orderId: order.id,
      amount: evaluation.finalAmountINR,
      evaluation,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Unable to create the Razorpay payment." },
      { status: 500 },
    );
  }
}