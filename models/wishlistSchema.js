const mongoose = require('mongoose');
const {Schema} = mongoose;


const wishlistSchema = new Schema({
    userId:{
        type: Schema.Types.ObjectId,
        ref:'User',
        required:true
    },
    product:[{
        type:Schema.Types.ObjectId,
        ref:'Product',
        required:true
    }],
    addedOn:{
        type:Date,
        default:Date.now
    }
})

const wishlistModel = mongoose.model('Wishlist',wishlistSchema)

module.exports = wishlistModel;