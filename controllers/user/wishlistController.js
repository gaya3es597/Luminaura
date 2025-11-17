const wishlistModel = require('../../models/wishlistSchema');
const productModel = require('../../models/productSchema');
const userModel = require('../../models/userSchema');
const cartModel = require('../../models/cartSchema');
const HttpStatus = require('../../constants/httpStatus');
const messages = require("../../constants/messages")


const getWishlist = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      return res.redirect('/login'); // Redirect to login if user not authenticated
    }

    const user = await userModel.findById(userId); // e.g., { name: "Haris", email: "..." }
    const currentPage = "wishlist";

    // Find the wishlist and populate products + categories
    const wishlistDoc = await wishlistModel.findOne({ userId }).populate({
      path: 'product',
      populate: {
        path: 'category' // To access categoryOffer
      }
    });

    const wishlist = wishlistDoc
      ? wishlistDoc.product.map(product => {
          // Calculate effective discount
          const productDiscount = product.discount || 0;
          const categoryOffer = product.category?.categoryOffer || 0;
           const effectiveDiscount = Math.max(productDiscount, categoryOffer);
          // product.effectiveDiscount = Math.max(productDiscount, categoryOffer);

          return {
            _id: product._id,
            name: product.productName,
            price: product.price,
            stock: product.stock,
            discount: product.discount,
            effectiveDiscount: effectiveDiscount, // Add this field
            image: product.productImage[0] || "/images/default.jpg"
          };
        })
      : [];

    res.render("wishlist", { user, wishlist, currentPage });
  } catch (error) {
    console.error("Error loading wishlist:", error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).render("error", { message: messages.ERROR.WALLET_ERROR });
  }
};

const addToWishlist = async (req, res) => {
  try {
    const userId = req.session.user;
    const { productId } = req.body;

    if (!userId) {
      return res.status(HttpStatus.UNAUTHORIZED).json({ status: false, message: messages.ERROR.WISHLIST_AUTH_ERROR });
    }

    let wishlist = await wishlistModel.findOne({ userId });

    if (!wishlist) {
      wishlist = new wishlistModel({
        userId,
        product: [productId]
      });
    } else {
      if (wishlist.product.includes(productId)) {
        // 💡 Still return current count
        return res.json({
          status: false,
          message: messages.ERROR.ALREADY_IN_WISHLIST,
          wishlistCount: wishlist.product.length
        });
      }

      wishlist.product.push(productId);
    }

    await wishlist.save();

    // ✅ Return updated count
    res.json({
      status: true,
      message: messages.SUCCESS.ADDED_WISHLIST,
      wishlistCount: wishlist.product.length
    });

  } catch (error) {
    console.error("Error adding to wishlist:", error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ status: false, message: messages.ERROR.INTERNAL_SERVER_ERROR });
  }
};


const removeProduct = async (req, res) => {
  try {
    const productId = req.query.productId;
    const userId = req.session.user;

    if (!userId) {
      return res.status(HttpStatus.UNAUTHORIZED).json({ status: false, message: messages.ERROR.WISHLIST_AUTH_ERROR });
    }

    const wishlist = await wishlistModel.findOne({ userId });

    if (!wishlist) {
      return res.status(HttpStatus.NOT_FOUND).json({ status: false, message: messages.ERROR.WISHLIST_NOT_FOUND});
    }

    const index = wishlist.product.indexOf(productId);
    if (index === -1) {
      return res.status(HttpStatus.NOT_FOUND).json({ status: false, message: messages.ERROR.PRODUCT_NOT_FOUND_IN_WISHLIST });
    }

    wishlist.product.splice(index, 1); // remove the product
    await wishlist.save();

    res.json({ status: true, message: messages.SUCCESS.REMOVED_WISHLIST });

  } catch (error) {
    console.error("Error removing product from wishlist:", error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ status: false, message: messages.ERROR.INTERNAL_SERVER_ERROR });
  }
};

const moveToCart = async (req, res) => {
  try {
    const userId = req.session.user;
    const { productId, quantity } = req.body;

    if (!userId) {
      return res.status(HttpStatus.UNAUTHORIZED).json({ success: false, message: messages.ERROR.UNAUTHORIZED_ACCESS });
    }

    const qty = parseInt(quantity) || 1;

    const product = await productModel.findById(productId);
    if (!product) {
      return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: messages.ERROR.PRODUCT_NOT_FOUND_IN_WISHLIST });
    }

    let cart = await cartModel.findOne({ userId });

    if (!cart) {
      cart = new cartModel({
        userId,
        cartItems: [{
          productId,
          quantity: qty,
          price: product.price,
          totalPrice: product.price * qty
        }]
      });
    } else {
      const itemIndex = cart.cartItems.findIndex(item => item.productId.toString() === productId);

      if (itemIndex > -1) {
        const existingItem = cart.cartItems[itemIndex];
        existingItem.quantity += qty;
        existingItem.totalPrice = existingItem.quantity * product.price;
      } else {
        cart.cartItems.push({
          productId,
          quantity: qty,
          price: product.price,
          totalPrice: product.price * qty
        });
      }
    }

    await cart.save();

    // ✅ Remove product from wishlist
    const wishlist = await wishlistModel.findOne({ userId });
    if (wishlist) {
      wishlist.product = wishlist.product.filter(
        (id) => id.toString() !== productId
      );
      await wishlist.save();
    }

    return res.json({ success: true, message: messages.SUCCESS.MOVED_TO_CART_REMOVED_FROM_WISHLIST });
  } catch (err) {
    console.error("moveToCart error:", err);
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ success: false, message: messages.ERROR.INTERNAL_SERVER_ERROR });
  }
};


module.exports = {
    getWishlist,
    addToWishlist,
    removeProduct,
    moveToCart
}