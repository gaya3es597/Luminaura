const couponModel = require("../../models/couponSchema")
const HttpStatus = require("../../constants/httpStatus");
const messages = require("../../constants/messages");


const getCoupons = async (req, res) => {
    try {
        const findCoupons = await couponModel.find({}).sort({ createdOn: -1 });

        const formattedCoupons = findCoupons.map(coupon => ({
        ...coupon._doc,
        createdOn: formatDate(coupon.createdOn),
        expireOn: formatDate(coupon.expireOn)
        }));

        return res.render('admin-coupons', { coupons: formattedCoupons });
    } catch (error) {
        console.log(error);
        return res.redirect("/pageerror");
    }
};
  
function formatDate(date) {
    const d = new Date(date);
    const day = (`0${d.getDate()}`).slice(-2);
    const month = (`0${d.getMonth() + 1}`).slice(-2);
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
}

const createCoupon = async(req, res) => {
    try {
        const { name, startDate, endDate, offer, minPrice ,maxPrice} = req.body;
    
        const newCoupon = new couponModel({
        name,
        createdOn: new Date(startDate),  // Store as Date object
        expireOn: new Date(endDate),
        offerPrice: offer,
        minimumPrice: minPrice,
        maxPrice
        });
    
        await newCoupon.save();
    
        return res.json({ success: true, message: messages.SUCCESS.COUPON_ADDED });
    
    } catch (error) {
        console.log(error);
        res.redirect("/pageerror");
    }
};
      

const editCoupon = async (req, res) => {
    try {
        const { id, name, startDate, endDate, offerPrice, minPrice, maxPrice } = req.body;

        if (!id || !name || !startDate || !endDate || !offerPrice || !minPrice || !maxPrice) {
            return res.status(HttpStatus.BAD_REQUEST).json({message:messages.VALIDATION.REQUIRED_FIELDS});
        }

        if (new Date(endDate) < new Date(startDate)) {
            return res.status(HttpStatus.BAD_REQUEST).json({error:messages.ERROR.DATE_ERROR});
        }

        const updatedCoupon = await couponModel.findByIdAndUpdate(
            id,
        {
            name,
            createdOn: new Date(startDate),  // Store as Date
            expireOn: new Date(endDate),
            offerPrice: offerPrice,
            minimumPrice: minPrice,
            maxPrice:maxPrice
        },
        { new: true }
        );

        if (!updatedCoupon) {
            return res.status(HttpStatus.NOT_FOUND).json({message:messages.ERROR.COUPON_NOT_FOUND});
        }

        return res.json({ success: true, message: messages.SUCCESS.COUPON_UPDATED });

    } catch (error) {
        console.error("Error updating coupon:", error);
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({message:messages.ERROR.INTERNAL_SERVER_ERROR});
    }
};

const deleteCoupon = async(req,res)=>{
    try {
        const couponId = req.params.id;

        await couponModel.deleteOne({_id:couponId});

        res.json({success:true, message:messages.SUCCESS.COUPON_DELETED})

    } catch (error) {
        console.error("Error Deleting Coupon",error)
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({error:messages.ERROR.INTERNAL_SERVER_ERROR})
    }
}
  
  
module.exports = {
    getCoupons,
    createCoupon,
    editCoupon,
    deleteCoupon
}