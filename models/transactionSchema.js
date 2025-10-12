const mongoose = require('mongoose');
const {Schema} = mongoose;
const { v4: uuidv4 } = require('uuid');

const transactionSchema = new Schema({
    transactionId: {
        type: String,
        default: () => uuidv4(),
        unique: true
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    transactionType: {
        type: String,
        enum: ['credit', 'debit'],
        required: true
    },
    paymentMethod: {
        type: String,
        enum: ['wallet', 'online', 'refund', 'admin'],
        required: true
    },
    paymentGateway: {
        type: String,
        enum: ['razorpay', 'wallet', 'admin', 'none'],
        default: 'none'
    },
    gatewayTransactionId: {
        type: String,
        default: null
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'refunded'],
        default: 'completed'
    },
    purpose: {
        type: String,
        enum: ['purchase', 'refund', 'wallet_add', 'wallet_withdraw', 'cancellation', 'return'],
        required: true
    },
    description: {
        type: String,
        default: ''
    },
    orders: [{
        orderId: {
            type: String,
            ref: 'Order'
        },
        amount: {
            type: Number
        }
    }],
    walletBalanceAfter: {
        type: Number,
        default: null
    },
    metadata: {
        type: Schema.Types.Mixed,
        default: {}
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
},{
    timestamps:true
})

// Indexes for faster queries
transactionSchema.index({ userId: 1, createdAt: -1 });

transactionSchema.index({ 'orders.orderId': 1 });

const transactionModel = mongoose.model('Transaction',transactionSchema);

module.exports = transactionModel;