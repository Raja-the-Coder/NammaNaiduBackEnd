const { Op } = require('sequelize');
const SubscriptionPlan = require('../../models/SubscriptionPlan.model');
const SubscriptionTransaction = require('../../models/SubscriptionTransaction.model');
const User = require('../../models/User.model');
const { createOrder, verifyPaymentSignature, fetchPayment } = require('../../config/razorpay');

// GET /api/subscription/status - current user's subscription status
const getSubscriptionStatus = async (req, res) => {
    try {
        const accountId = req.accountId;
        const user = await User.findOne({ where: { accountId } });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        const lastSuccess = await SubscriptionTransaction.findOne({
            where: { userId: user.id, status: 'success' },
            order: [['createdAt', 'DESC']],
            include: [{ model: SubscriptionPlan, as: 'plan', attributes: ['id', 'planName', 'maxProfile', 'validMonth'] }],
        });
        const isPaid = !!lastSuccess;
        let expiresAt = null;
        let planName = null;
        let featuresEnabled = ['basic_search', 'view_profiles_limited'];
        if (lastSuccess && lastSuccess.plan) {
            planName = lastSuccess.plan.planName;
            const validMonths = lastSuccess.plan.validMonth || 1;
            expiresAt = new Date(lastSuccess.createdAt);
            expiresAt.setMonth(expiresAt.getMonth() + validMonths);
            // Check if subscription has expired
            if (new Date() > expiresAt) {
                return res.json({
                    success: true,
                    data: {
                        isPaid: false,
                        planName: 'Expired',
                        expiresAt: expiresAt.toISOString(),
                        profileViewTokens: user.profileViewTokens ?? 0,
                        featuresEnabled: ['basic_search', 'view_profiles_limited'],
                        lastPlan: planName,
                    },
                });
            }
            featuresEnabled = ['basic_search', 'view_profiles_limited', 'unlimited_views', 'contact_view'];
        }
        res.json({
            success: true,
            data: {
                isPaid,
                planName: planName || 'Free',
                expiresAt: expiresAt ? expiresAt.toISOString() : null,
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
        const { planId } = req.body;
        const accountId = req.accountId;

        if (!planId) {
            return res.status(400).json({
                success: false,
                message: 'Plan ID is required',
            });
        }

        // Find User
        const user = await User.findOne({ where: { accountId } });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        // Find Plan
        const plan = await SubscriptionPlan.findByPk(planId);
        if (!plan) {
            return res.status(404).json({
                success: false,
                message: 'Subscription plan not found',
            });
        }

        if (plan.status !== 'active') {
            return res.status(400).json({
                success: false,
                message: 'This plan is currently inactive',
            });
        }

        // Use offer amount if available, otherwise regular amount
        const amount = parseFloat(plan.offerAmount) || parseFloat(plan.amount);

        if (amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid plan amount',
            });
        }

        // Create receipt ID
        const receipt = `sub_${user.id}_${planId}_${Date.now()}`;

        // Create Razorpay order
        const order = await createOrder(amount, receipt, {
            userId: String(user.id),
            accountId: accountId,
            planId: String(planId),
            planName: plan.planName,
        });

        // Create a pending transaction record
        const transaction = await SubscriptionTransaction.create({
            paymentId: order.id, // Store Razorpay order ID as paymentId initially
            userId: user.id,
            planId: plan.id,
            amount: amount,
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
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to create order',
        });
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

        // Find user and plan to credit tokens
        const user = await User.findOne({ where: { accountId } });
        const plan = await SubscriptionPlan.findByPk(transaction.planId);

        if (user && plan) {
            const tokensToAdd = plan.maxProfile || 0;
            user.profileViewTokens = (user.profileViewTokens || 0) + tokensToAdd;
            await user.save();

            res.json({
                success: true,
                message: 'Payment verified and subscription activated successfully',
                data: {
                    transactionId: transaction.id,
                    paymentId: razorpay_payment_id,
                    orderId: razorpay_order_id,
                    planName: plan.planName,
                    validMonth: plan.validMonth,
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
