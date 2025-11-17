const addressModel = require("../../models/addressSchema");
const cartModel = require("../../models/cartSchema");
const userModel = require("../../models/userSchema");
const walletModel = require("../../models/walletSchema");
const couponModel = require("../../models/couponSchema");


const getCheckoutPage = async (req, res) => {
  try {
    const userId = req.session.user;

    // Get user addresses
    const addresses = await addressModel.findOne({ userId }).lean();

    // Get user details
    const user = await userModel.findById(userId);

    // Get cart with product and category populated
    const cart = await cartModel
      .findOne({ userId })
      .populate({
        path: 'cartItems.productId',
        populate: {
          path: 'category',
        },
      })
      .lean();

    // If no cart found, render empty checkout page
    if (!cart) {
      return res.render('checkout', {
        user,
        userAddresses: addresses ? addresses.address : [],
        checkoutItems: [],
        totalItems: 0,
        totalMRP: 0,
        totalDiscount: 0,
        shippingCharges: 0,
        finalPrice: 0,
        wallet: { balance: 0, refundAmount: 0, totalDebited: 0 },

        // Pass empty coupon arrays to avoid undefined in EJS
        referral: [],
        couponCode: [],
      });
    }

    // Get wallet info
    const wallet = await walletModel.findOne({ userId });

    // Fetch referral coupons assigned to user
    const referralCoupons = await couponModel.find({ assignedTo: userId }).lean();

    // Fetch general coupons (not assigned to any user)
    const generalCoupons = await couponModel.find({ assignedTo: null }).lean();

    // Prepare addresses: reverse order, mark first as default
    const userAddresses = addresses ? [...addresses.address].reverse() : [];
    if (userAddresses.length > 0) {
      userAddresses[0].isDefault = true;
    }

    // Prepare checkout items with max discount from product and category
    const checkoutItems = cart.cartItems.map(item => {
      const product = item.productId;

      const price = product.price;
      const productDiscount = product.discount || 0;
      const categoryDiscount = product.category?.categoryOffer || 0;

      // Use max discount available
      const effectiveDiscount = Math.max(productDiscount, categoryDiscount);

      const quantity = item.quantity;

      const discountedPrice = price - (price * effectiveDiscount) / 100;
      const totalPrice = discountedPrice * quantity;

      return {
        _id: product._id,
        name: product.productName,
        image: product.productImage.length > 0 ? product.productImage[0] : '/images/default.png',
        quantity,
        price,
        discount: effectiveDiscount,
        discountedPrice,
        totalPrice,
      };
    });

    // Calculate totals
    const totalItems = checkoutItems.reduce((acc, item) => acc + item.quantity, 0);
    const totalMRP = checkoutItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const totalDiscount = checkoutItems.reduce(
      (acc, item) => acc + ((item.price * item.discount) / 100) * item.quantity,
      0
    );

    // Calculate shipping charge: free if subtotal after discount > 500 else 40
    const shippingCharges = totalMRP - totalDiscount > 500 ? 0 : 40;
    // console/log(shippingCharges+"hgjhfjhgkjgkjgk")
    // Final price
    const finalPrice = totalMRP - totalDiscount + shippingCharges;
    // console.log(generalCoupons)
    // Render the checkout page with all data
    res.render('checkout', {
      user,
      userAddresses,
      checkoutItems,
      totalItems,
      totalMRP,
      totalDiscount,
      shippingCharges,
      finalPrice,
      wallet: wallet || { balance: 0, refundAmount: 0, totalDebited: 0 },
      referral: referralCoupons,
      couponCode: generalCoupons,
    });
  } catch (error) {
    console.error('Error in getCheckoutPage:', error);
    res.status(500).send('Internal Server Error');
  }
};

const checkStock = async (req, res) => {
  try {
    const userId = req.session.user;

    const cart = await cartModel.findOne({ userId }).populate('cartItems.productId');

    if (!cart || cart.cartItems.length === 0) {
      return res.json({
        success: false,
        message: 'Cart is empty',
        items: []
      });
    }

    const updatedItems = [];

    for (let item of cart.cartItems) {
      const product = item.productId;

      if (!product) continue;

      let updatedItem = {
        productId: product._id,
        isBlocked: product.isBlocked,
        stockChanged: false
      };

      // Check if product is blocked
      if (product.isBlocked) {
        updatedItems.push(updatedItem);
        continue;
      }

      // Check stock availability
      if (product.stock < item.quantity) {
        updatedItem.stockChanged = true;

        // Update the quantity to match stock (if stock > 0)
        const newQuantity = product.stock > 0 ? product.stock : 0;

        item.quantity = newQuantity;
        item.totalPrice = newQuantity * item.price;
      }

      updatedItems.push(updatedItem);
    }

    // Save any updated cart changes
    await cart.save();

    return res.json({
      success: true,
      items: updatedItems
    });

  } catch (error) {
    console.error('Error in checkStock:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal Server Error'
    });
  }
};

module.exports = {
  getCheckoutPage,
  checkStock
}