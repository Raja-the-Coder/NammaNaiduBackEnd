const { Op } = require('sequelize');
const SubscriptionPlan = require('../../models/SubscriptionPlan.model');
const SubscriptionTransaction = require('../../models/SubscriptionTransaction.model');
const User = require('../../models/User.model');
const Coupon = require('../../models/Coupon.model');
const CouponUsage = require('../../models/CouponUsage.model');
const { createOrder, verifyPaymentSignature, fetchPayment } = require('../../config/razorpay');
const { getUserSubscriptionStatus } = require('../../services/subscription.service');
const { rewardReferrer } = require('./referral.controller');
const { validateCoupon, calculateDiscount } = require('./coupon.controller');

// GET /api/subscription/status - current user's subscription status
const getSubscriptionStatus = async (req, res) => {
    try {
        const user = await User.findByPk(req.userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const status = await getUserSubscriptionStatus(user.id);
        const featuresEnabled = status.isActive
            ? ['basic_search', 'view_profiles_limited', 'unlimited_views', 'contact_view']
            : ['basic_search', 'view_profiles_limited'];

        res.json({
            success: true,
            data: {
                isPaid: status.isActive,
                isGracePeriod: status.isGracePeriod,
                planName: status.planName,
                expiresAt: status.expiresAt,
                gracePeriodEndsAt: status.gracePeriodEndsAt || null,
                daysRemaining: status.daysRemaining,
                profileViewTokens: user.profileViewTokens ?? 0,
                featuresEnabled,
            },
        });
    } catch (error) {
        console.error('Error getting subscription status:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to get subscription status' });
    }
};

// POST /api/subscription/create-order - Create a Razorpay order for a plan
const createRazorpayOrder = async (req, res) => {
    try {
        const { planId, couponCode } = req.body;
        const accountId = req.accountId;

        if (!planId) {
            return res.status(400).json({ success: false, message: 'Plan ID is required' });
        }

        const user = await User.findOne({ where: { accountId } });
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const plan = await SubscriptionPlan.findByPk(planId);
        if (!plan) return res.status(404).json({ success: false, message: 'Subscription plan not found' });

        if (plan.status !== 'active') {
            return res.status(400).json({ success: false, message: 'This plan is currently inactive' });
        }

        // Base amount
        let amount = parseFloat(plan.offerAmount) || parseFloat(plan.amount);
        let couponId = null;
        let discountAmount = 0;

        // Apply coupon if provided
        if (couponCode) {
            const coupon = await Coupon.findOne({
                where: { code: couponCode.toUpperCase().trim(), status: 'active' },
            });

            if (coupon) {
                const now = new Date();
                const validation = validateCoupon(coupon, plan, user, now);
                if (validation.valid) {
                    const userUsageCount = await CouponUsage.count({
                        where: { couponId: coupon.id, userId: user.id },
                    });
                    if (userUsageCount < coupon.maxUsesPerUser) {
                        discountAmount = calculateDiscount(coupon, amount);
                        couponId = coupon.id;
                        amount = Math.max(1, amount - discountAmount); // Min ₹1 for Razorpay
                    }
                }
            }
        }

        if (amount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid plan amount' });
        }

        const receipt = `sub_${user.id}_${planId}_${Date.now()}`;

        const order = await createOrder(amount, receipt, {
            userId: String(user.id),
            accountId,
            planId: String(planId),
            planName: plan.planName,
            couponId: couponId ? String(couponId) : '',
            discountAmount: String(discountAmount),
        });

        const transaction = await SubscriptionTransaction.create({
            paymentId: order.id,
            userId: user.id,
            planId: plan.id,
            amount,
            status: 'pending',
            paymentMethod: 'Razorpay',
            paymentGateway: 'Razorpay',
            transactionId: null,
        });

        res.json({
            success: true,
            message: 'Order created successfully',
            data: {
                orderId: order.id,
                amount: order.amount, // In paise
                currency: order.currency,
                receipt: order.receipt,
                transactionId: transaction.id,
                keyId: process.env.RAZORPAY_KEY_ID,
                planName: plan.planName,
                discountApplied: discountAmount,
                originalAmount: parseFloat(plan.offerAmount) || parseFloat(plan.amount),
                planDetails: {
                    validMonth: plan.validMonth,
                    maxProfile: plan.maxProfile,
                    contactNoView: plan.contactNoView,
                },
                prefill: {
                    name: user.name || '',
                    email: user.email || '',
                    contact: user.phone || '',
                },
            },
        });
    } catch (error) {
        console.error('Error creating Razorpay order:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to create order' });
    }
};

// POST /api/subscription/verify-payment - Verify Razorpay payment and activate subscription
const verifyRazorpayPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
        const accountId = req.accountId;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({
                success: false,
                message: 'Missing payment verification parameters',
            });
        }

        // Verify signature
        const isValid = verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);

        if (!isValid) {
            // Mark transaction as failed
            await SubscriptionTransaction.update(
                {
                    status: 'failed',
                    failureReason: 'Payment signature verification failed',
                },
                { where: { paymentId: razorpay_order_id } }
            );

            return res.status(400).json({
                success: false,
                message: 'Payment verification failed. Invalid signature.',
            });
        }

        // Find the pending transaction
        const transaction = await SubscriptionTransaction.findOne({
            where: { paymentId: razorpay_order_id, status: 'pending' },
        });

        if (!transaction) {
            return res.status(404).json({
                success: false,
                message: 'Transaction not found or already processed',
            });
        }

        // Fetch payment details from Razorpay for additional verification
        const paymentDetails = await fetchPayment(razorpay_payment_id);

        if (paymentDetails.status !== 'captured') {
            // Payment is authorized but not captured - it's usually auto-captured
            // for test mode, or you need to capture it
            console.log(`Payment ${razorpay_payment_id} status: ${paymentDetails.status}`);
        }

        // Update transaction to success
        await transaction.update({
            status: 'success',
            transactionId: razorpay_payment_id,
            paymentId: razorpay_order_id, // Keep order ID
            paymentMethod: paymentDetails.method || 'Razorpay',
        });

        // Find user and plan to credit tokens + set expiry
        const user = await User.findOne({ where: { accountId } });
        const plan = await SubscriptionPlan.findByPk(transaction.planId);

        if (user && plan) {
            const tokensToAdd = plan.maxProfile || 0;
            user.profileViewTokens = (user.profileViewTokens || 0) + tokensToAdd;

            // Set subscription expiry
            const expiresAt = new Date();
            expiresAt.setMonth(expiresAt.getMonth() + (plan.validMonth || 1));
            user.subscriptionExpiresAt = expiresAt;
            user.gracePeriodEndsAt = null; // Clear any grace period
            await user.save();

            // Record coupon usage if coupon was applied
            const orderDetails = await require('../../config/razorpay').fetchOrder(razorpay_order_id);
            if (orderDetails.notes && orderDetails.notes.couponId) {
                const couponId = parseInt(orderDetails.notes.couponId);
                const discountAmt = parseFloat(orderDetails.notes.discountAmount) || 0;
                if (couponId && discountAmt > 0) {
                    try {
                        await CouponUsage.create({
                            couponId,
                            userId: user.id,
                            transactionId: transaction.id,
                            discountAmount: discountAmt,
                        });
                        // Increment coupon usage counter
                        await Coupon.increment('usedCount', { where: { id: couponId } });
                    } catch (couponErr) {
                        console.error('Error recording coupon usage:', couponErr);
                    }
                }
            }

            // Reward referrer on first purchase
            try {
                await rewardReferrer(user.id);
            } catch (refErr) {
                console.error('Error rewarding referrer:', refErr);
            }

            res.json({
                success: true,
                message: 'Payment verified and subscription activated successfully',
                data: {
                    transactionId: transaction.id,
                    paymentId: razorpay_payment_id,
                    orderId: razorpay_order_id,
                    planName: plan.planName,
                    validMonth: plan.validMonth,
                    expiresAt: expiresAt.toISOString(),
                    tokensAdded: tokensToAdd,
                    newBalance: user.profileViewTokens,
                    amount: parseFloat(transaction.amount),
                    paymentMethod: paymentDetails.method || 'Razorpay',
                },
            });
        } else {
            res.json({
                success: true,
                message: 'Payment verified successfully',
                data: {
                    transactionId: transaction.id,
                    paymentId: razorpay_payment_id,
                    orderId: razorpay_order_id,
                },
            });
        }
    } catch (error) {
        console.error('Error verifying Razorpay payment:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to verify payment',
        });
    }
};

// POST /api/subscription/payment-failed - Handle payment failure
const handlePaymentFailed = async (req, res) => {
    try {
        const { razorpay_order_id, error_code, error_description, error_reason } = req.body;

        if (!razorpay_order_id) {
            return res.status(400).json({
                success: false,
                message: 'Order ID is required',
            });
        }

        // Update transaction as failed
        const [updatedCount] = await SubscriptionTransaction.update(
            {
                status: 'failed',
                failureReason: `${error_code || 'UNKNOWN'}: ${error_description || error_reason || 'Payment failed'}`,
            },
            { where: { paymentId: razorpay_order_id, status: 'pending' } }
        );

        res.json({
            success: true,
            message: 'Payment failure recorded',
            data: { updatedCount },
        });
    } catch (error) {
        console.error('Error handling payment failure:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to record payment failure',
        });
    }
};

// GET /api/subscription/transactions - Get user's transaction history
const getUserTransactions = async (req, res) => {
    try {
        const accountId = req.accountId;
        const { page = 1, limit = 20 } = req.query;

        const user = await User.findOne({ where: { accountId } });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const transactions = await SubscriptionTransaction.findAndCountAll({
            where: { userId: user.id },
            include: [
                {
                    model: SubscriptionPlan,
                    as: 'plan',
                    attributes: ['id', 'planName', 'planType', 'validMonth', 'maxProfile'],
                },
            ],
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset,
        });

        res.json({
            success: true,
            data: transactions.rows,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(transactions.count / parseInt(limit)),
                totalItems: transactions.count,
            },
        });
    } catch (error) {
        console.error('Error getting user transactions:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to get transactions' });
    }
};

module.exports = {
    getSubscriptionStatus,
    createRazorpayOrder,
    verifyRazorpayPayment,
    handlePaymentFailed,
    getUserTransactions,
};
