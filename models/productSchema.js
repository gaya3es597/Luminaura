const mongoose = require('mongoose')
const {Schema} = mongoose;

const productSchema = new Schema({
    productName:{
        type:String,
        required:true,
        unique:true
    },
    description:{
        type:String,
        required:true
    },
    productImage:{
        type:[String],
        required:true
    },
    price:{
        type:Number,
        required:true
    },
    productQuantity:{
        type:Number,
        default:null
    },
    unit:{
        type:String,
        default:null
    },
    category:{
        type: Schema.Types.ObjectId,
        ref:'Category',
        // required:true
    },
    effectiveDiscount:{
        type:Number
    },
   
    discount:{
        type:Number,
        default:0
    },
    stock:{
        type:Number,
        default:null
    },
    isBlocked:{
        type:Boolean,
        default:false
    },
    status:{
        type: String,
        enum:['available','out of stock','Discontinued'],
        required: true,
        default: 'available'
    },
},{
    timestamps:true
})


const productModel = mongoose.model('Product',productSchema);

module.exports = productModel;