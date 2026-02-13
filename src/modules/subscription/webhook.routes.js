const express = require('express');
const crypto = require('crypto');
const SubscriptionTransaction = require('../../models/SubscriptionTransaction.model');
const SubscriptionPlan = require('../../models/SubscriptionPlan.model');
const User = require('../../models/User.model');

const router = express.Router();

/**
 * POST /api/subscription/webhook
 * Razorpay Webhook endpoint — no auth needed, validated by signature
 * Must use raw body for signature verification
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // If no webhook secret configured, skip signature check (dev mode)
    if (webhookSecret) {
      const signature = req.headers['x-razorpay-signature'];
      if (!signature) {
        console.warn('[Webhook] Missing x-razorpay-signature header');
        return res.status(400).json({ success: false, message: 'Missing signature' });
      }

      const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(body)
        .digest('hex');

      if (expectedSignature !== signature) {
        console.warn('[Webhook] Signature mismatch');
        return res.status(400).json({ success: false, message: 'Invalid signature' });
      }
    }

    const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const eventType = event.event;

    console.log(`[Webhook] Received event: ${eventType}`);

    switch (eventType) {
      case 'payment.captured': {
        await handlePaymentCaptured(event.payload.payment.entity);
        break;
      }
      case 'payment.failed': {
        await handlePaymentFailed(event.payload.payment.entity);
        break;
      }
      case 'order.paid': {
        await handleOrderPaid(event.payload.order.entity, event.payload.payment?.entity);
        break;
      }
      case 'refund.created': {
        await handleRefundCreated(event.payload.refund.entity, event.payload.payment?.entity);
        break;
      }
      default:
        console.log(`[Webhook] Unhandled event type: ${eventType}`);
    }

    // Always respond 200 to Razorpay so it doesn't retry
    res.status(200).json({ success: true, message: 'Webhook received' });
  } catch (error) {
    console.error('[Webhook] Error processing webhook:', error);
    // Still return 200 to prevent Razorpay retries on our errors
    res.status(200).json({ success: true, message: 'Webhook received (with errors)' });
  }
});

// ─── Handler functions ───

async function handlePaymentCaptured(payment) {
  console.log(`[Webhook] Payment captured: ${payment.id}, order: ${payment.order_id}`);

  const transaction = await SubscriptionTransaction.findOne({
    where: { paymentId: payment.order_id, status: 'pending' },
  });

  if (!transaction) {
    console.log(`[Webhook] No pending transaction found for order ${payment.order_id}`);
    return;
  }

  await transaction.update({
    status: 'success',
    transactionId: payment.id,
    paymentMethod: payment.method || 'Razorpay',
  });

  // Credit tokens to user
  const plan = await SubscriptionPlan.findByPk(transaction.planId);
  const user = await User.findByPk(transaction.userId);

  if (user && plan) {
    const tokensToAdd = plan.maxProfile || 0;
    user.profileViewTokens = (user.profileViewTokens || 0) + tokensToAdd;

    // Update subscription expiry
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + (plan.validMonth || 1));
    user.subscriptionExpiresAt = expiresAt;
    user.gracePeriodEndsAt = null; // Clear any grace period

    await user.save();
    console.log(`[Webhook] Activated subscription for user ${user.id}, plan: ${plan.planName}, expires: ${expiresAt}`);
  }
}

async function handlePaymentFailed(payment) {
  console.log(`[Webhook] Payment failed: ${payment.id}, order: ${payment.order_id}`);

  const errorDesc = payment.error_description || payment.error_reason || 'Payment failed';

  await SubscriptionTransaction.update(
    {
      status: 'failed',
      failureReason: `${payment.error_code || 'UNKNOWN'}: ${errorDesc}`,
    },
    { where: { paymentId: payment.order_id, status: 'pending' } }
  );
}

async function handleOrderPaid(order, payment) {
  console.log(`[Webhook] Order paid: ${order.id}`);

  // If payment.captured didn't fire yet, handle it here
  const transaction = await SubscriptionTransaction.findOne({
    where: { paymentId: order.id, status: 'pending' },
  });

  if (transaction && payment) {
    await handlePaymentCaptured(payment);
  }
}

async function handleRefundCreated(refund, payment) {
  console.log(`[Webhook] Refund created: ${refund.id}, payment: ${refund.payment_id}`);

  // Find the transaction by payment ID (transactionId column stores razorpay payment id)
  const transaction = await SubscriptionTransaction.findOne({
    where: { transactionId: refund.payment_id, status: 'success' },
  });

  if (transaction) {
    // If full refund, mark transaction as failed/refunded
    if (refund.amount >= transaction.amount * 100) {
      await transaction.update({
        status: 'failed',
        failureReason: `Refunded: ${refund.id}`,
      });
      console.log(`[Webhook] Full refund — transaction ${transaction.id} marked as failed`);
    } else {
      console.log(`[Webhook] Partial refund of ${refund.amount / 100} for transaction ${transaction.id}`);
    }
  }
}

module.exports = router;
