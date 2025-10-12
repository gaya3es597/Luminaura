const mongoose = require('mongoose');
const {Schema} = mongoose;

const userSchema = new Schema({
    name:{
        type: String,
        required: true
    },
    email:{
        type: String,
        required: true,
        unique: true
    },
    phone:{
        type: String,
        required: false,
        unique: false,
        sparse: true,
        default: null
    },
    googleId:{
        type: String,
        // unique: true,
    },
    password:{
        type: String,
        // required: false,
    },
    username: {
        type:String,
        required:false
    },
    referralCode: {
        type: String,
    },
    referredBy: {
        type: String, 
        default: null
    },
    isBlocked:{
        type: Boolean,
        default: false     
    },
    isAdmin:{
        type: Boolean,
        default: false     
    },
    profilePicture:{
        type:String,
        required:false
    },
    cart:[{
        productId:{
            type:Schema.Types.ObjectId,
            ref:'product'
        },
        quantity:{
            type: Number,
            default:1
        }
    }],
    wallet:{
        type: Number,
        default: 0
    },
    wishlist:[{
        type: Schema.Types.ObjectId,
        ref: 'Product'
    }],
    orderHistory:[{
        type: Schema.Types.ObjectId,
        ref: 'Order'
    }],
    createdOn:{
        type: Date,
        default: Date.now
    },
    referalCode:{
        type: String,
        
    },
    redeemed:{
        type: Boolean,
        
    },
    redeemedUsers:[{
        type: Schema.Types.ObjectId,
        ref: 'User'
    }],
    searchHistory:[{
        category:{
            type: Schema.Types.ObjectId,
            ref: 'Category'
        },
        brand:{
            type: String
        },
        searchOn:{
            type: Date,
            default: Date.now
        }
    }]
},{
    timestamps:true
})

const userModel = mongoose.model('User',userSchema);

module.exports = userModel;