const mongoose = require('mongoose');
const {Schema} = mongoose;
const {v4:uuidv4} = require('uuid')


const orderSchema = new Schema({
    orderId: {
        type: String,
         default: function () {
    const now = new Date();
    const yy = now.getFullYear().toString().slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `ORD-${yy}${mm}${dd}-${rand}`;
  },
        unique: true
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    couponRevoked: { type: Boolean, default: false },
    orderedItems: [{
        product: {
            type: Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        productName: { 
            type: String,
            required: true
        },
        productImages: [{ 
            type: String
        }],
        quantity: {
            type: Number,
            required: true
        },
        price: {
            type: Number,
            default: 0
        },
        regularPrice: {
            type: Number,
            default: 0
        },
        totalProductPrice:{
            type:Number,
            default:0
        },
        status: {
            type: String,
            enum: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled', 'return_requested', 'returning', 'returned','failed'],
            default: 'pending'
        },
        cancelReason: {
            type: String
        },
        cancelledAt: {
            type: Date
        },
        updatedOn:{
            type:Date
        },
        deliveredOn:{
            type:Date
        },
        returnedOn:{
            type:Date
        },
        restocked:{
            type:Boolean,
            default:false
        },
        returnReason:{
            type:String
        },
        returnDescription:{
            type:String
        },
        returnImages:[{
            type: String
        }],
        requestStatus:{
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending'
        },
        rejectionCategory: {
            type: String
        },
        rejectionReason: {
            type: String
        },    
        updatedOn:{
            type:Date
        }
    }],
    totalOrderPrice: {
        type: Number,
        required: true
    },
    discount: {
        type: Number,
        default: 0
    },
    deliveryCharge: {
        type: Number,
    },
    finalAmount: {
        type: Number,
        required: true
    },
    address: {
        type: Schema.Types.Mixed,
        required: true
    },
    paymentMethod: {
        type: String,
        enum: ['cod', 'online', 'wallet'],
        required: true
    },
    paymentStatus: {
        type: String,
        enum: ['success', 'failed'],
        default: 'success' // most orders will be success
    },
    invoiceDate: {
        type: Date
    },
    status: {
        type: String,
        required: true,
        enum: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled', 'return_requested', 'returning', 'returned','failed'],
        default: 'pending'
    },
    cancelReason: {
        type: String
    },
    returnReason: {
        type: String
    },
    returnDescription: {
        type: String
    },
    returnImages: [{
        type: String
    }],
    requestStatus: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    rejectionCategory: {
        type: String
    },
    rejectionReason: {
        type: String
    },
    createdOn: {
        type: Date,
        default: Date.now,
        required: true
    },
    updatedOn: {
        type: Date,
    },
    deliveredOn: {
        type: Date
    },
    couponApplied: {
        type: Boolean,
        default: false
    },
    couponName:{
        type:String
    }
})

const orderModel = mongoose.model('Order',orderSchema);
module.exports = orderModel;