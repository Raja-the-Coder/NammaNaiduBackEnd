require('dotenv').config();

// Import models to ensure they are registered with Sequelize
require('./models/User.model');
require('./models/Otp.model');
require('./models/BasicDetail.model');
require('./models/Admin.model');
require('./models/masters');
require('./models/SubscriptionPlan.model');
require('./models/SubscriptionTransaction.model');
require('./models/ProfileAction.model');
require('./models/ProfileView.model');
require('./models/PersonPhoto.model');
require('./models/Notification.model');
require('./models/DeviceToken.model');

const app = require('./app');
const { connectDB } = require('./config/database');
const { initializeFirebaseAdmin } = require('./config/firebase-admin');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Initialize Firebase Admin SDK
    initializeFirebaseAdmin();
    console.log('✅ Firebase Admin SDK initialized successfully');
  } catch (error) {
    console.error('⚠️  Warning: Firebase Admin initialization failed:', error.message);
    console.log('');
    console.log('📋 To fix this issue:');
    console.log('');
    console.log('For Railway/Production:');
    console.log('  1. Go to Railway Dashboard → Your Service → Variables');
    console.log('  2. Add a new variable:');
    console.log('     Key: FIREBASE_SERVICE_ACCOUNT');
    console.log('     Value: (Paste the entire JSON from Firebase service account key)');
    console.log('  3. Restart your Railway service');
    console.log('');
    console.log('For Local Development:');
    console.log('  1. Download Firebase service account JSON from Firebase Console');
    console.log('  2. Save it as: src/config/firebase-service-account.json');
    console.log('  3. Restart your server');
    console.log('');
    console.log('⚠️  Server will continue without Firebase Admin');
    console.log('   - Push notifications will NOT work');
    console.log('   - Firebase OTP login will NOT work');
    console.log('   - Other features will work normally');
    console.log('');
  }

  await connectDB();

  const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`\n❌ Port ${PORT} is already in use!`);
      console.error(`\nTo fix this, you can:`);
      console.error(`1. Kill the process using port ${PORT}:`);
      console.error(`   Windows: netstat -ano | findstr :${PORT}`);
      console.error(`   Then: taskkill /PID <PID> /F`);
      console.error(`\n2. Or use a different port by setting PORT in your .env file`);
      process.exit(1);
    } else {
      console.error('Server error:', error);
      process.exit(1);
    }
  });
};

startServer();


