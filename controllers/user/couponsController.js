const couponModel = require("../../models/couponSchema");
const userModel = require('../../models/userSchema');
const HttpStatus = require('../../constants/httpStatus');
const messages = require('../../constants/messages');


const loadCoupon = async (req, res) => {
  try {
    const userId = req.session.user;

    const user = await userModel.findById(userId);

    // General Coupons: visible to all but not referral coupons
    let generalCoupons = await couponModel.find({
      isList: true,
      isReferralCoupon: { $ne: true },
      userId: { $ne: userId }
    }).sort({ expireOn: 1 });

    // Referral Coupons: given specifically to this user
    let referralCoupons = await couponModel.find({
      userId: userId,
      isReferralCoupon: true,
      isUsed:false
    }).sort({ expireOn: 1 });

    // Format both coupon types
    const formatCoupons = (coupons) =>
      coupons.map(coupon => ({
        ...coupon._doc,
        formattedExpiry: coupon.expireOn.toLocaleDateString('en-GB').replace(/\//g, '-')
      }));

    generalCoupons = formatCoupons(generalCoupons);
    referralCoupons = formatCoupons(referralCoupons);

    res.render('coupons', {
      user,
      currentPage: 'coupons',
      generalCoupons,
      referralCoupons
    });

  } catch (error) {
    console.error("Error loading coupons:", error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).render('errorPage', { message: messages.ERROR.INTERNAL_SERVER_ERROR, error });
  }
};

const applyCoupon = async (req, res) => {
  try {
    const { couponCode, orderTotal } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res.status(HttpStatus.UNAUTHORIZED).json({ success: false, message: messages.VALIDATION.LOGIN_EXPIRED });
    }

    const coupon = await couponModel.findOne({ name: couponCode, isList: true });

    if (!coupon) {
      return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: messages.ERROR.INVALID_COUPON });
    }

    // Check if coupon is expired
    if (new Date(coupon.expireOn) < new Date()) {
      return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: messages.ERROR.EXPIRED_COUPON });
    }

    if(coupon.isReferralCoupon){

      if (coupon.isUsed) {
        return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: messages.ERROR.ALREADY_USED_REFERAL_CODE });
      }
    }else if (coupon.userId.map(id => id.toString()).includes(userId.toString())) {
      return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: messages.ERROR.ALREADY_USED_COUPON });
    } 

    // Check if order total meets minimum requirement
    if(!coupon.isReferralCoupon){
      if (orderTotal < coupon.minimumPrice) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: `${messages.ERROR.MINIMUM_PURCHASE} - ₹${coupon.minimumPrice}`,
        });
      }
    }

    let discount;

    if (coupon.isReferralCoupon) {
      // Flat discount for referral coupon
      discount = coupon.offerPrice;
    } else {
      // Percentage discount with optional max cap
      const calculatedDiscount = (orderTotal * coupon.offerPrice) / 100;
      discount = coupon.maxPrice ? Math.min(calculatedDiscount, coupon.maxPrice) : calculatedDiscount;
    }
   
    // If everything is valid, return coupon discount
    return res.status(HttpStatus.OK).json({
      success: true,
      coupon: {
        code: coupon.name,
        offerPrice: coupon.offerPrice,
        maxPrice: coupon.maxPrice || null
      },
      discount: Math.floor(discount) 
    });

  } catch (error) {
    console.error("Error applying coupon:", error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ success: false, message: messages.ERROR.INTERNAL_SERVER_ERROR });
  }
};


module.exports = {
    loadCoupon,
    applyCoupon
}