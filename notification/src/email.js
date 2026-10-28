const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        type: 'OAuth2',
        user: process.env.EMAIL_USER,
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        refreshToken: process.env.REFRESH_TOKEN,
    },
});

// Verify the connection configuration
transporter.verify((error) => {
    if (error) {
        console.error('Error connecting to email server:', error.message);
    } else {
        console.log('Email server is ready to send messages');
    }
});

// Function to send email. Errors are logged (the broker acknowledges the message either way).
const sendEmail = async (to, subject, text, html) => {
    try {
        const info = await transporter.sendMail({
            from: `"${process.env.EMAIL_FROM_NAME || 'Nova Market'}" <${process.env.EMAIL_USER}>`, // sender address
            to, // list of receivers
            subject, // Subject line
            text, // plain text body
            html, // html body
        });

        console.log('Message sent: %s', info.messageId);
    } catch (error) {
        console.error('Error sending email:', error.message);
    }
};


module.exports = { sendEmail };
