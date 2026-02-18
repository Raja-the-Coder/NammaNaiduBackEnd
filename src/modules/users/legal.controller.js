const User = require('../../models/User.model');
const ConsentLog = require('../../models/ConsentLog.model');
const PageContent = require('../../models/PageContent.model');

// Current policy version — bump this when policies are materially updated
const CURRENT_POLICY_VERSION = '1.0';

/**
 * GET /api/users/legal/consent-status
 * Returns the user's current consent state and whether re-consent is needed.
 */
const getConsentStatus = async (req, res) => {
  try {
    const accountId = req.accountId;

    const user = await User.findOne({
      where: { accountId },
      attributes: ['accountId', 'acceptedTermsAt', 'acceptedTermsVersion'],
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const hasConsented = !!user.acceptedTermsAt;
    const needsReConsent = hasConsented && user.acceptedTermsVersion !== CURRENT_POLICY_VERSION;

    return res.json({
      success: true,
      data: {
        hasConsented,
        acceptedTermsAt: user.acceptedTermsAt,
        acceptedTermsVersion: user.acceptedTermsVersion,
        currentPolicyVersion: CURRENT_POLICY_VERSION,
        needsReConsent,
      },
    });
  } catch (error) {
    console.error('[Legal] getConsentStatus error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch consent status' });
  }
};

/**
 * POST /api/users/legal/accept
 * Record that the user accepted the current policy version.
 * Body: { policyVersion?: string }  — defaults to CURRENT_POLICY_VERSION
 */
const acceptTerms = async (req, res) => {
  try {
    const accountId = req.accountId;
    const policyVersion = req.body.policyVersion || CURRENT_POLICY_VERSION;

    // Update user record
    await User.update(
      {
        acceptedTermsAt: new Date(),
        acceptedTermsVersion: policyVersion,
      },
      { where: { accountId } }
    );

    // Write immutable consent log
    await ConsentLog.create({
      accountId,
      action: 'grant',
      policyType: 'all',
      policyVersion,
      ipAddress: req.ip || req.connection?.remoteAddress || null,
      userAgent: (req.headers['user-agent'] || '').substring(0, 500),
      metadata: { source: 'manual_accept', platform: req.headers['x-platform'] || 'unknown' },
    });

    return res.json({
      success: true,
      message: 'Terms & Privacy Policy accepted',
      data: {
        acceptedTermsAt: new Date(),
        acceptedTermsVersion: policyVersion,
      },
    });
  } catch (error) {
    console.error('[Legal] acceptTerms error:', error);
    return res.status(500).json({ success: false, message: 'Failed to record consent' });
  }
};

/**
 * POST /api/users/legal/withdraw
 * DPDP Act — consent withdrawal. Deactivates the account and logs the withdrawal.
 * Body: { reason?: string }
 */
const withdrawConsent = async (req, res) => {
  try {
    const accountId = req.accountId;
    const reason = req.body.reason || null;

    const user = await User.findOne({ where: { accountId } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Log the withdrawal event
    await ConsentLog.create({
      accountId,
      action: 'withdraw',
      policyType: 'all',
      policyVersion: user.acceptedTermsVersion || CURRENT_POLICY_VERSION,
      ipAddress: req.ip || req.connection?.remoteAddress || null,
      userAgent: (req.headers['user-agent'] || '').substring(0, 500),
      metadata: {
        source: 'user_withdrawal',
        reason,
        platform: req.headers['x-platform'] || 'unknown',
      },
    });

    // Deactivate the account (soft delete — data can still be retained for legal hold period)
    await User.update(
      {
        isActive: false,
        acceptedTermsAt: null,
        acceptedTermsVersion: null,
      },
      { where: { accountId } }
    );

    return res.json({
      success: true,
      message: 'Consent withdrawn successfully. Your account has been deactivated. You may request complete data erasure by contacting support.',
      data: {
        accountDeactivated: true,
        withdrawnAt: new Date(),
      },
    });
  } catch (error) {
    console.error('[Legal] withdrawConsent error:', error);
    return res.status(500).json({ success: false, message: 'Failed to withdraw consent' });
  }
};

/**
 * GET /api/users/legal/consent-history
 * Returns the full consent audit trail for the authenticated user.
 */
const getConsentHistory = async (req, res) => {
  try {
    const accountId = req.accountId;

    const logs = await ConsentLog.findAll({
      where: { accountId },
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'action', 'policyType', 'policyVersion', 'ipAddress', 'createdAt', 'metadata'],
    });

    return res.json({
      success: true,
      data: logs,
    });
  } catch (error) {
    console.error('[Legal] getConsentHistory error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch consent history' });
  }
};

/**
 * GET /api/users/legal/policy-version
 * Public — returns the current policy version so clients can check if re-consent is needed.
 */
const getCurrentPolicyVersion = async (_req, res) => {
  try {
    // Fetch last-updated timestamps from CMS for extra context
    const [terms, privacy] = await Promise.all([
      PageContent.findOne({ where: { slug: 'terms-of-use' }, attributes: ['updatedAt'] }),
      PageContent.findOne({ where: { slug: 'privacy-policy' }, attributes: ['updatedAt'] }),
    ]);

    return res.json({
      success: true,
      data: {
        currentVersion: CURRENT_POLICY_VERSION,
        termsLastUpdated: terms?.updatedAt || null,
        privacyLastUpdated: privacy?.updatedAt || null,
      },
    });
  } catch (error) {
    console.error('[Legal] getCurrentPolicyVersion error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch policy version' });
  }
};

module.exports = {
  getConsentStatus,
  acceptTerms,
  withdrawConsent,
  getConsentHistory,
  getCurrentPolicyVersion,
  CURRENT_POLICY_VERSION,
};
