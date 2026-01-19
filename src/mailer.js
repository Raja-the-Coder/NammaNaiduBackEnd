const nodemailer = require('nodemailer');
require('dotenv').config();

// Create a reusable transporter object using Gmail SMTP (or any other service)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

module.exports = transporter;
