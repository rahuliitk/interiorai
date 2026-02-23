import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { db } from '@openlintel/db';
import { payments } from '@openlintel/db';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import { createHmac } from 'crypto';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-12-18.acacia' as Stripe.LatestApiVersion,
});

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';

/**
 * Stripe/Razorpay webhook handler with proper signature verification.
 * Uses raw body for Stripe signature verification (required by Stripe SDK).
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  // Determine provider from headers
  const stripeSignature = request.headers.get('stripe-signature');
  const razorpaySignature = request.headers.get('x-razorpay-signature');

  if (stripeSignature) {
    return handleStripeWebhook(rawBody, stripeSignature);
  } else if (razorpaySignature) {
    return handleRazorpayWebhook(rawBody, razorpaySignature);
  }

  return NextResponse.json({ error: 'Unknown payment provider' }, { status: 400 });
}

async function handleStripeWebhook(rawBody: string, signature: string) {
  let event: Stripe.Event;

  // Verify webhook signature
  if (STRIPE_WEBHOOK_SECRET) {
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid signature';
      return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 });
    }
  } else {
    // Development fallback — parse without verification
    event = JSON.parse(rawBody) as Stripe.Event;
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const paymentId = session.metadata?.payment_id;
      if (paymentId) {
        await db
          .update(payments)
          .set({
            status: 'completed',
            externalId: session.payment_intent as string || session.id,
            paidAt: new Date(),
          })
          .where(eq(payments.id, paymentId));
      }
      break;
    }

    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
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
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
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
      const charge = event.data.object as Stripe.Charge;
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

async function handleRazorpayWebhook(rawBody: string, signature: string) {
  // Verify Razorpay HMAC-SHA256 signature
  if (RAZORPAY_WEBHOOK_SECRET) {
    const expectedSignature = createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');
    if (signature !== expectedSignature) {
      return NextResponse.json({ error: 'Invalid Razorpay webhook signature' }, { status: 400 });
    }
  }

  const body = JSON.parse(rawBody);
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
