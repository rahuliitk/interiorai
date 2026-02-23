import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { db } from '@openlintel/db';
import { payments } from '@openlintel/db';
import { eq } from 'drizzle-orm';

/**
 * Stripe/Razorpay webhook handler.
 *
 * In production, verify webhook signatures:
 * - Stripe: stripe.webhooks.constructEvent(body, sig, endpointSecret)
 * - Razorpay: validateWebhookSignature(body, sig, secret)
 */

export async function POST(request: NextRequest) {
  const body = await request.json();

  // Determine provider from headers
  const stripeSignature = request.headers.get('stripe-signature');
  const razorpaySignature = request.headers.get('x-razorpay-signature');

  if (stripeSignature) {
    return handleStripeWebhook(body);
  } else if (razorpaySignature) {
    return handleRazorpayWebhook(body);
  }

  return NextResponse.json({ error: 'Unknown payment provider' }, { status: 400 });
}

async function handleStripeWebhook(event: any) {
  switch (event.type) {
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object;
      const paymentId = paymentIntent.metadata?.payment_id;
      if (paymentId) {
        await db
          .update(payments)
          .set({
            status: 'completed',
            externalId: paymentIntent.id,
            paidAt: new Date(),
          })
          .where(eq(payments.id, paymentId));
      }
      break;
    }

    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object;
      const paymentId = paymentIntent.metadata?.payment_id;
      if (paymentId) {
        await db
          .update(payments)
          .set({
            status: 'failed',
            externalId: paymentIntent.id,
          })
          .where(eq(payments.id, paymentId));
      }
      break;
    }

    case 'charge.refunded': {
      const charge = event.data.object;
      const paymentId = charge.metadata?.payment_id;
      if (paymentId) {
        await db
          .update(payments)
          .set({ status: 'refunded' })
          .where(eq(payments.id, paymentId));
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}

async function handleRazorpayWebhook(body: any) {
  const { event, payload } = body;

  switch (event) {
    case 'payment.captured': {
      const payment_entity = payload.payment.entity;
      const paymentId = payment_entity.notes?.payment_id;
      if (paymentId) {
        await db
          .update(payments)
          .set({
            status: 'completed',
            externalId: payment_entity.id,
            paidAt: new Date(),
          })
          .where(eq(payments.id, paymentId));
      }
      break;
    }

    case 'payment.failed': {
      const payment_entity = payload.payment.entity;
      const paymentId = payment_entity.notes?.payment_id;
      if (paymentId) {
        await db
          .update(payments)
          .set({
            status: 'failed',
            externalId: payment_entity.id,
          })
          .where(eq(payments.id, paymentId));
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
