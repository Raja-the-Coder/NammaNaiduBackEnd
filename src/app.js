const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');

const authRoutes = require('./modules/auth/auth.routes');
const userRoutes = require('./modules/users/user.routes');
const horoscopeRoutes = require('./modules/users/horoscope.routes');
const familyRoutes = require('./modules/users/family.routes');
const hobbiesRoutes = require('./modules/users/hobbies.routes');
const masterRoutes = require('./modules/admin/master.routes');
const subscriptionRoutes = require('./modules/admin/subscription.routes');
const userSubscriptionRoutes = require('./modules/subscription/subscription.routes');
const publicSubscriptionRoutes = require('./modules/subscription/subscription.public.routes');
const webhookRoutes = require('./modules/subscription/webhook.routes');
const publicMasterRoutes = require('./modules/master/master.public.routes');
const adminUserRoutes = require('./modules/admin/adminUser.routes');
const adminUserManagementRoutes = require('./modules/admin/user.routes');
const photoModerationRoutes = require('./modules/admin/photoModeration.routes');
const dashboardRoutes = require('./modules/admin/dashboard.routes');
const adminNotificationRoutes = require('./modules/admin/notification.routes');
const adminCouponRoutes = require('./modules/admin/coupon.routes');
const adminReferralRoutes = require('./modules/admin/referral.routes');
const adminSettingsRoutes = require('./modules/admin/settings.routes');
const adminChatRoutes = require('./modules/admin/chatAdmin.routes');
const { getReferralSettings } = require('./modules/admin/settings.controller');
const notificationRoutes = require('./modules/notifications/notification.routes');
const deviceRoutes = require('./modules/devices/device.routes');
const messageRoutes = require('./modules/messages/message.routes');
const chatRoutes = require('./modules/chat/chat.routes');
const safetyRoutes = require('./modules/users/safety.routes');
const privacyRoutes = require('./modules/users/privacy.routes');
const legalRoutes = require('./modules/users/legal.routes');
const adminSafetyRoutes = require('./modules/admin/safetyAdmin.routes');
const adminSuspiciousRoutes = require('./modules/admin/suspiciousBehavior.routes');
const adminPhotoDuplicateRoutes = require('./modules/admin/photoDuplicate.routes');
const adminCmsRoutes = require('./modules/admin/cms.routes');
const publicCmsRoutes = require('./modules/public/publicCms.routes');
const whatsappRoutes = require('./modules/whatsapp/whatsapp.routes');
const errorHandler = require('./middleware/error.middleware');
const { apiLogger, errorLogger } = require('./middleware/apiLogger.middleware');

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
// Increase body size limit to 50MB for image uploads (base64 encoded images are larger)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API Logger Middleware - Log all API calls
app.use(apiLogger);

app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Namma Naidu Backend API' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/users', horoscopeRoutes);
app.use('/api/users', familyRoutes);
app.use('/api/users', hobbiesRoutes);
// Public routes (no authentication required)
app.use('/api', publicSubscriptionRoutes);
app.use('/api', publicMasterRoutes);
// Public settings route (no auth)
app.get('/api/settings/referral', getReferralSettings);
// Razorpay webhook (no auth, validated by signature)
app.use('/api/subscription', webhookRoutes);
// Authenticated User Subscription routes
app.use('/api/subscription', userSubscriptionRoutes);

// Register specific admin routes BEFORE generic routes to avoid route conflicts
app.use('/api/admin', subscriptionRoutes);
app.use('/api/admin', adminCouponRoutes);
app.use('/api/admin', adminReferralRoutes);
app.use('/api/admin', adminSettingsRoutes);
app.use('/api/admin', adminChatRoutes);
app.use('/api/admin', adminSafetyRoutes);
app.use('/api/admin', adminSuspiciousRoutes);
app.use('/api/admin', adminPhotoDuplicateRoutes);
app.use('/api/admin', adminUserRoutes);
app.use('/api/admin', adminUserManagementRoutes); // Admin user management routes (must come before master routes)
app.use('/api/admin', photoModerationRoutes);
app.use('/api/admin', dashboardRoutes);
app.use('/api/admin/notifications', adminNotificationRoutes);
app.use('/api/admin', masterRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/users', safetyRoutes);
app.use('/api/users', privacyRoutes);
app.use('/api/users', legalRoutes);

// CMS routes
app.use('/api/admin', adminCmsRoutes);
app.use('/api', publicCmsRoutes);

// WhatsApp routes
app.use('/api/whatsapp', whatsappRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error Logger Middleware - Log errors with full context
app.use(errorLogger);

app.use(errorHandler);

module.exports = app;


