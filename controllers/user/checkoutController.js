const HttpStatus = require("../../constants/httpStatus");
const messages = require('../../constants/messages');
const addressModel = require("../../models/addressSchema");
const cartModel = require("../../models/cartSchema");
const orderModel = require("../../models/orderSchema");
const userModel = require("../../models/userSchema");
const walletModel = require("../../models/walletSchema");


const getCheckoutPage = async (req, res) => {
  try {
    const userId = req.session.user;

    const user = await userModel.findById(userId);
    const addresses = await addressModel.findOne({ userId }).lean();
    const wallet = await walletModel.findOne({ userId }) || { balance: 0, refundAmount: 0, totalDebited: 0 };
    const userAddresses = addresses ? [...addresses.address].reverse() : [];

    if (userAddresses.length > 0) {
      userAddresses[0].isDefault = true;
    }

    const cart = await cartModel
      .findOne({ userId })
      .populate({
        path: 'cartItems.productId',
        populate: { path: 'category' }
      })
      .lean();

    if (!cart || cart.cartItems.length === 0) {
      return res.render('checkout', {
        user,
        userAddresses,
        checkoutItems: [],
        totalItems: 0,
        totalMRP: 0,
        totalDiscount: 0,
        shippingCharges: 0,
        finalPrice: 0,
        wallet
      });
    }

    const checkoutItems = cart.cartItems.map(item => {
      const product = item.productId;
      const price = product.price;
      const productDiscount = product.discount || 0;
      const categoryDiscount = product.category?.categoryOffer || 0;
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
        totalPrice
      };
    });

    const totalItems = checkoutItems.reduce((acc, item) => acc + item.quantity, 0);
    const totalMRP = checkoutItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const totalDiscount = checkoutItems.reduce(
      (acc, item) => acc + ((item.price * item.discount) / 100) * item.quantity,
      0
    );

    const shippingCharges = totalMRP - totalDiscount > 500 ? 0 : 40;
    const finalPrice = totalMRP - totalDiscount + shippingCharges;

    res.render('checkout', {
      user,
      userAddresses,
      checkoutItems,
      totalItems,
      totalMRP,
      totalDiscount,
      shippingCharges,
      finalPrice,
      wallet
    });

  } catch (error) {
    console.error('Error in getCheckoutPage:', error);
  res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
    message: messages.ERROR.INTERNAL_SERVER_ERROR,
    error: error.message // optionally expose for dev mode
  });
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
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: messages.ERROR.INTERNAL_SERVER_ERROR
        });
    }
};

module.exports ={
    getCheckoutPage,
    checkStock
}