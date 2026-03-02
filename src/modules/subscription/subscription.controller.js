const { Op } = require('sequelize');
const SubscriptionPlan = require('../../models/SubscriptionPlan.model');
const SubscriptionTransaction = require('../../models/SubscriptionTransaction.model');
const User = require('../../models/User.model');
const Coupon = require('../../models/Coupon.model');
const CouponUsage = require('../../models/CouponUsage.model');
const { getPayUConfig, generatePayUHash, verifyPayUHash, generateMobileSDKHash } = require('../../config/payu');
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

// ─────────────────────────────────────────────
// PayU Payment Flow
// ─────────────────────────────────────────────

/**
 * Helper: Apply coupon discount to amount
 * Returns { amount, couponId, discountAmount }
 */
const _applyCouponToAmount = async (couponCode, plan, user, baseAmount) => {
    let amount = baseAmount;
    let couponId = null;
    let discountAmount = 0;

    if (!couponCode) return { amount, couponId, discountAmount };

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
                amount = Math.max(1, amount - discountAmount);
            }
        }
    }

    return { amount, couponId, discountAmount };
};

/**
 * Helper: Activate subscription after successful payment
 */
const _activateSubscription = async (userId, planId, transactionId, payuPaymentId, couponId, discountAmount) => {
    const user = await User.findByPk(userId);
    const plan = await SubscriptionPlan.findByPk(planId);

    if (!user || !plan) return null;

    const tokensToAdd = plan.maxProfile || 0;
    user.profileViewTokens = (user.profileViewTokens || 0) + tokensToAdd;

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + (plan.validMonth || 1));
    user.subscriptionExpiresAt = expiresAt;
    user.gracePeriodEndsAt = null;
    await user.save();

    // Record coupon usage
    if (couponId && discountAmount > 0) {
        try {
            await CouponUsage.create({ couponId, userId, transactionId, discountAmount });
            await Coupon.increment('usedCount', { where: { id: couponId } });
        } catch (err) {
            console.error('Error recording coupon usage:', err);
        }
    }

    // Reward referrer on first purchase
    try {
        await rewardReferrer(userId);
    } catch (err) {
        console.error('Error rewarding referrer:', err);
    }

    return { user, plan, expiresAt, tokensToAdd };
};

// POST /api/subscription/payu/create-order
const createPayUOrder = async (req, res) => {
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

        let baseAmount = parseFloat(plan.offerAmount) || parseFloat(plan.amount);
        const { amount, couponId, discountAmount } = await _applyCouponToAmount(couponCode, plan, user, baseAmount);

        if (amount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid plan amount' });
        }

        const txnid = `sub_${user.id}_${planId}_${Date.now()}`;
        const productinfo = `${plan.planName} Subscription`;
        const firstname = (user.name || 'User').split(' ')[0];
        const email = user.email || '';
        const phone = (user.phone || '').replace(/^\+91/, '').replace(/\D/g, '');
        const amountStr = amount.toFixed(2);

        const { key, salt } = getPayUConfig();

        // udf1=userId, udf2=planId, udf3=couponId, udf4=discountAmount
        const hash = generatePayUHash({
            key,
            txnid,
            amount: amountStr,
            productinfo,
            firstname,
            email,
            udf1: String(user.id),
            udf2: String(planId),
            udf3: couponId ? String(couponId) : '',
            udf4: discountAmount ? String(discountAmount) : '',
            salt,
        });

        // Create pending transaction
        const transaction = await SubscriptionTransaction.create({
            paymentId: txnid,
            userId: user.id,
            planId: plan.id,
            amount,
            status: 'pending',
            paymentMethod: 'PayU',
            paymentGateway: 'PayU',
            transactionId: null,
        });

        res.json({
            success: true,
            message: 'PayU order created successfully',
            data: {
                txnid,
                key,
                hash,
                amount: amountStr,
                productinfo,
                firstname,
                email,
                phone,
                transactionId: transaction.id,
                environment: process.env.NODE_ENV === 'production' ? '1' : '0',
                planName: plan.planName,
                discountApplied: discountAmount,
                originalAmount: baseAmount,
                planDetails: {
                    validMonth: plan.validMonth,
                    maxProfile: plan.maxProfile,
                    contactNoView: plan.contactNoView,
                },
                udf1: String(user.id),
                udf2: String(planId),
                udf3: couponId ? String(couponId) : '',
                udf4: discountAmount ? String(discountAmount) : '',
            },
        });
    } catch (error) {
        console.error('Error creating PayU order:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to create PayU order' });
    }
};

// POST /api/subscription/payu/verify-payment
const verifyPayUPayment = async (req, res) => {
    try {
        const {
            txnid,
            mihpayid,
            status,
            hash,
            amount,
            productinfo,
            firstname,
            email,
            udf1,
            udf2,
            udf3,
            udf4,
            udf5,
        } = req.body;

        if (!txnid || !mihpayid || !status || !hash) {
            return res.status(400).json({ success: false, message: 'Missing payment verification parameters' });
        }

        const { key, salt } = getPayUConfig();

        // Verify reverse hash
        const isValid = verifyPayUHash({
            salt, status,
            udf5: udf5 || '', udf4: udf4 || '', udf3: udf3 || '',
            udf2: udf2 || '', udf1: udf1 || '',
            email, firstname, productinfo, amount, txnid, key,
            receivedHash: hash,
        });

        if (!isValid) {
            await SubscriptionTransaction.update(
                { status: 'failed', failureReason: 'PayU hash verification failed' },
                { where: { paymentId: txnid } }
            );
            return res.status(400).json({ success: false, message: 'Payment verification failed. Invalid hash.' });
        }

        if (status !== 'success') {
            await SubscriptionTransaction.update(
                { status: 'failed', failureReason: `PayU payment status: ${status}` },
                { where: { paymentId: txnid } }
            );
            return res.status(400).json({ success: false, message: `Payment ${status}. Please try again.` });
        }

        // Find pending transaction
        const transaction = await SubscriptionTransaction.findOne({
            where: { paymentId: txnid, status: 'pending' },
        });

        if (!transaction) {
            return res.status(404).json({ success: false, message: 'Transaction not found or already processed' });
        }

        // Update transaction to success
        await transaction.update({
            status: 'success',
            transactionId: mihpayid,
            paymentMethod: 'PayU',
        });

        // Activate subscription
        const couponId = udf3 ? parseInt(udf3) : null;
        const discountAmt = udf4 ? parseFloat(udf4) : 0;

        const result = await _activateSubscription(
            transaction.userId,
            transaction.planId,
            transaction.id,
            mihpayid,
            couponId,
            discountAmt
        );

        if (result) {
            return res.json({
                success: true,
                message: 'Payment verified and subscription activated successfully',
                data: {
                    transactionId: transaction.id,
                    payuPaymentId: mihpayid,
                    txnid,
                    planName: result.plan.planName,
                    validMonth: result.plan.validMonth,
                    expiresAt: result.expiresAt.toISOString(),
                    tokensAdded: result.tokensToAdd,
                    newBalance: result.user.profileViewTokens,
                    amount: parseFloat(transaction.amount),
                },
            });
        }

        res.json({ success: true, message: 'Payment verified', data: { transactionId: transaction.id } });
    } catch (error) {
        console.error('Error verifying PayU payment:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to verify PayU payment' });
    }
};

// POST /api/subscription/payu/generate-hash
// Called by Flutter PayU SDK when it needs additional hashes (net banking, saved cards, etc.)
const generatePayUMobileHash = async (req, res) => {
    try {
        const { hashName, hashString } = req.body;

        if (!hashName || !hashString) {
            return res.status(400).json({ success: false, message: 'hashName and hashString are required' });
        }

        const { salt } = getPayUConfig();
        const hash = generateMobileSDKHash(hashString, salt);

        res.json({
            success: true,
            data: { hashName, hash },
        });
    } catch (error) {
        console.error('Error generating PayU mobile hash:', error);
        res.status(500).json({ success: false, message: error.message || 'Hash generation failed' });
    }
};

// POST /api/subscription/payu/payment-failed
const handlePayUFailed = async (req, res) => {
    try {
        const { txnid, error_Message } = req.body;

        if (!txnid) {
            return res.status(400).json({ success: false, message: 'txnid is required' });
        }

        const [updatedCount] = await SubscriptionTransaction.update(
            {
                status: 'failed',
                failureReason: error_Message || 'PayU payment failed',
            },
            { where: { paymentId: txnid, status: 'pending' } }
        );

        res.json({ success: true, message: 'Payment failure recorded', data: { updatedCount } });
    } catch (error) {
        console.error('Error handling PayU failure:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to record payment failure' });
    }
};

module.exports = {
    getSubscriptionStatus,
    getUserTransactions,
    createPayUOrder,
    verifyPayUPayment,
    generatePayUMobileHash,
    handlePayUFailed,
};
