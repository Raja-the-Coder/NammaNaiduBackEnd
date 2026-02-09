const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const SubscriptionPlan = require('../../models/SubscriptionPlan.model');
const SubscriptionTransaction = require('../../models/SubscriptionTransaction.model');
const User = require('../../models/User.model');

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

// Mock Purchase Subscription
const mockPurchaseSubscription = async (req, res) => {
    try {
        const { planId } = req.body;
        const accountId = req.accountId; // UUID from auth middleware

        if (!planId) {
            return res.status(400).json({
                success: false,
                message: 'Plan ID is required',
            });
        }

        // Find User (need integer ID for transaction)
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

        // Create Mock Payment ID
        const paymentId = `MOCK_${Date.now()}_${uuidv4().substring(0, 8)}`;

        // Create Transaction
        const transaction = await SubscriptionTransaction.create({
            paymentId: paymentId,
            userId: user.id, // Ensure this is the integer primary key
            planId: plan.id,
            amount: plan.offerAmount || plan.amount,
            status: 'success', // Immediately successful
            paymentMethod: 'MockPayment',
            paymentGateway: 'InternalMock',
            transactionId: uuidv4(),
        });

        // Credit Tokens
        // Assuming maxProfile corresponds to token count
        const tokensToAdd = plan.maxProfile || 0;
        user.profileViewTokens = (user.profileViewTokens || 0) + tokensToAdd;
        await user.save();

        res.json({
            success: true,
            message: 'Subscription purchased successfully',
            data: {
                transaction,
                tokensAdded: tokensToAdd,
                newBalance: user.profileViewTokens,
            },
        });
    } catch (error) {
        console.error('Error in mock purchase:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to process mock subscription',
        });
    }
};

module.exports = {
    getSubscriptionStatus,
    mockPurchaseSubscription,
};
