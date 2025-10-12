const mongoose = require('mongoose')
const {Schema} = mongoose;


const addressSchema = new Schema({
    userId:{
        type: Schema.Types.ObjectId,
        ref:'User',
        required:true
    },
    address:[{
        name:{
            type:String,
            required: true
        },
        phone:{
            type:Number,
            required:true
        },
        streetAddress:{
            type:String,
            required:true
        },
        town:{
            type:String,
            required:true
        },
        city:{
            type:String,
            required:true
        },
        state:{
            type:String,
            required:true
        },
        country:{
            type:String,
            required: true
        },
        pincode:{
            type: Number,
            required: true
        },
        isDefault:{
            type:Boolean,
            default:'false'
        }
    }],
},{
    timestamps:true
})

const addressModel = mongoose.model('Address',addressSchema);

module.exports = addressModel;