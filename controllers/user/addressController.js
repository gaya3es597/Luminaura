const mongoose = require('mongoose');
const userModel = require('../../models/userSchema');
const addressModel = require('../../models/addressSchema');
const HttpStatus = require('../../constants/httpStatus');
const messages =require('../../constants/messages');


const loadAddressPage = async(req,res)=>{
    try {
        
        const userId = req.session.user

        const userData = await userModel.findById(userId);

        const addressData = await addressModel.findOne({userId:userId});

        res.render('address',{
            user:userData,
            userAddress:addressData,
            currentPage: 'address'
        })


    } catch (error) {
        
        console.error("Error in Address loading",error);
        res.redirect("/pageNotFound");
    }
}

const addAddress = async(req,res)=>{
     
    try {
        
        const {name, phone, streetAddress, town, city, state, pincode, country} = req.body;

        const userId = req.session.user;

        const userAddress = await addressModel.findOne({userId:userId});
        console.log(userAddress)
        if(!userAddress){
            const addNewAddress = new addressModel({
                userId,
                address:[{name, phone, streetAddress, town, city, state, pincode, country}]
            });

           const newAddress = await addNewAddress.save();

           return res.json({success:true, message:messages.SUCCESS.ADDRESS_SAVED});
        }else{
            userAddress.address.push({name, phone, streetAddress, town, city, state, pincode, country})

            await userAddress.save();

            return res.json({success:true, message:messages.SUCCESS.ADDRESS_SAVED});
        }

    } catch (error) {
        console.log(error);
    }
}

const editAddress = async(req,res)=>{
    try {
       
        const {addressId,name, phone, streetAddress, town, city, state, pincode, country} = req.body;

        const userId = req.session.user;
        //console.log(userId)
        const objectAddressId = new mongoose.Types.ObjectId(addressId);


        const result = await addressModel.updateOne(
            { userId: userId, 'address._id': objectAddressId },
            {
              $set: {
                'address.$.name': name,
                'address.$.phone': phone,
                'address.$.streetAddress': streetAddress,
                'address.$.town': town,
                'address.$.city': city,
                'address.$.state': state,
                'address.$.country': country,
                'address.$.pincode': pincode
              }
            }
          );
          console.log(result);

        res.status(HttpStatus.OK).json({success:true, message: messages.SUCCESS.ADDRESS_UPDATED });

    } catch (error) {
        console.log(error);
    }
}

const deleteAddress = async(req,res)=>{
    try {
        
        const addressId = req.params.id;
        const userId = req.session.user;

        const objectAddressId = new mongoose.Types.ObjectId(addressId);

        const result = await addressModel.updateOne(
            { userId: userId },
            { $pull: { address: { _id: objectAddressId } } }
        );

        if (result.modifiedCount === 0) {
            return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: messages.ERROR.ADDRESS_NOT_FOUND });
        }

        return res.status(HttpStatus.OK).json({ success: true, message:messages.SUCCESS.ADDRESS_DELETED });


    } catch (error) {
        console.error("Error in deleting in address",error)
        res.redirect("/pageNotFound")
    }
}

module.exports ={
    loadAddressPage,
    addAddress,
    editAddress,
    deleteAddress
}