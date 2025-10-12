const mongoose = require('mongoose');
const {Schema} = mongoose;

const couponSchema = new Schema({
    name:{
        type: String,
        required: true,
        unique: true
    },
    createdOn:{
        type: Date,
        // default: Date.now,
        // required: true
    },
    expireOn:{
        type: Date,
        required: true
    },
    offerPrice:{
        type: Number,
        required: true
    },
    minimumPrice:{
        type: Number,
        // required: true
    },
    maxPrice:{
        type: Number,
        // required: true
    },
    isList:{
        type: Boolean,
        default: true
    },
    isReferralCoupon:{
        type:Boolean,
        default:false
    },
    isUsed:{
        type:Boolean,
        default:false
    },
    userId:[{
        type: mongoose.Schema.Types.ObjectId,
        ref:'User'
    }]
})

const couponModel = mongoose.model('Coupon',couponSchema);

module.exports = couponModel;