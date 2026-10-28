const mongoose = require('mongoose');


const paymentSchema = new mongoose.Schema({
    order: { type: mongoose.Schema.Types.ObjectId, required: true },
    paymentId: { type: String },
    razorpayOrderId: { type: String, required: true },
    signature: { type: String },
    status: { type: String, enum: [ 'PENDING', 'COMPLETED', 'FAILED' ], default: 'PENDING' },
    user: { type: mongoose.Schema.Types.ObjectId, required: true },
    price: {
        // smallest currency unit (paise / cents), exactly as sent to Razorpay
        amount: { type: Number, required: true },
        currency: { type: String, required: true, default: 'INR', enum: [ 'INR', "USD" ] }
    }
}, { timestamps: true });

paymentSchema.index({ razorpayOrderId: 1 }, { unique: true });
paymentSchema.index({ order: 1, status: 1 });



const paymentModel = mongoose.model('payment', paymentSchema);


module.exports = paymentModel;