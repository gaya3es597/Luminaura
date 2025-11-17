const walletModel = require("../../models/walletSchema")
const transactionModel = require("../../models/transactionSchema")
const userModel = require("../../models/userSchema")
const cartModel = require("../../models/cartSchema")
const orderModel = require("../../models/orderSchema")
const couponModel = require("../../models/couponSchema")
const addressModel = require("../../models/addressSchema")
const Razorpay = require("razorpay")
const crypto = require("crypto")
const env = require("dotenv").config()


const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
})


const getWallet = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect('/login');

    let wallet = await walletModel.findOne({ userId });
    if (!wallet) wallet = await walletModel.create({ userId });

    const walletBalance = wallet.balance;

    // ✅ Pagination values
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    const totalTransactions = wallet.transactions.length;
    const totalPages = Math.ceil(totalTransactions / limit);

    const paginatedTransactions = wallet.transactions
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(skip, skip + limit)
      .map(txn => ({
        _id: txn._id,
        date: txn.createdAt,
        amount: txn.amount,
        type: txn.transactionType,
        description: txn.description || txn.transactionPurpose
      }));

    const user = await userModel.findById(userId).select('name email');

    // ✅ Make sure you pass page and totalPages here!
    res.render('wallet', {
      currentPage: 'wallet',
      user,
      walletBalance,
      transactions: paginatedTransactions,
      page,             // ✅ Pass to EJS
      totalPages        // ✅ Pass to EJS
    });

  } catch (error) {
    console.error("Error fetching wallet:", error);
    res.status(500).render('error', { message: "Something went wrong while fetching your wallet." });
  }
};



const createWalletRazorpayOrder = async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount < 1) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    const razorpayOrder = await razorpay.orders.create({
      amount: amount * 100, // Convert to paise
      currency: "INR",
      receipt: "wallet_txn_" + Date.now(),
    });

    res.status(200).json({
      success: true,
      order_id: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key_id: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error("Error creating Razorpay order:", error);
    res.status(500).json({ success: false, message: "Server error creating payment order" });
  }
};

const verifyPayment = async (req, res) => {
  try {
    const userId = req.session.user;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const razorpayOrder = await razorpay.orders.fetch(razorpay_order_id);
    const amount = razorpayOrder.amount / 100;


      // Verify signature
      const sign = razorpay_order_id + "|" + razorpay_payment_id
      const expectedSign = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(sign.toString())
        .digest("hex")
  
      if (razorpay_signature !== expectedSign) {
        return res.status(400).json({ success: false, message: "Invalid signature" })
      }

    // Step 2: Get or Create Wallet
    let wallet = await walletModel.findOne({ userId });
    if (!wallet) {
      wallet = new walletModel({ userId });
    }

    // Step 3: Update Wallet
    const newBalance = wallet.balance + amount;
    wallet.balance = newBalance;

    wallet.transactions.push({
      amount,
      transactionType: "credit",
      transactionPurpose: "add",
      description: "Wallet top-up via Razorpay"
    });

    await wallet.save();

    // Step 4: Record in Transaction History
    await transactionModel.create({
      userId,
      amount,
      transactionType: "credit",
      paymentMethod: "online",
      paymentGateway: "razorpay",
      gatewayTransactionId: razorpay_payment_id,
      purpose: "wallet_add",
      description: "Wallet top-up via Razorpay",
      walletBalanceAfter: newBalance
    });

    res.status(200).json({ success: true, message: "Payment verified and wallet updated" });

  } catch (error) {
    console.error("Error verifying payment:", error);
    res.status(500).json({ success: false, message: "Server error during payment verification" });
  }
};

const placeWalletOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    const { paymentMethod, addressId, couponCode } = req.body;

    // 1. Get the selected address
    const userAddressDoc = await addressModel.findOne({ userId });
    if (!userAddressDoc) return res.status(404).json({ message: "Address not found" });

    const selectedAddress = userAddressDoc.address.find(addr => addr._id.toString() === addressId);
    if (!selectedAddress) return res.status(404).json({ message: "Selected address not found" });

    // 2. Get the cart
    const userCart = await cartModel.findOne({ userId }).populate({
      path: 'cartItems.productId',
      populate: { path: 'category' }
    });
    if (!userCart || userCart.cartItems.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    // 3. Prepare orderedItems and calculate total
    let totalPrice = 0;
    const orderedItems = [];

    for (const item of userCart.cartItems) {
      const product = item.productId;
      if (!product || product.stock < item.quantity) {
        return res.json({ success: false, message: `Insufficient stock for ${product?.productName || "product"}` });
      }

      const productDiscount = product.discount || 0;
      const categoryDiscount = product.category?.categoryOffer || 0;
      const effectiveDiscount = Math.max(productDiscount, categoryDiscount);

      const priceAfterDiscount = product.price - (product.price * effectiveDiscount / 100);
      const totalItemPrice = priceAfterDiscount * item.quantity;
      totalPrice += totalItemPrice;

      orderedItems.push({
        product: product._id,
        productName: product.productName,
        productImages: product.productImage,
        quantity: item.quantity,
        price: priceAfterDiscount,
        regularPrice: product.price,
        totalProductPrice: totalItemPrice,
        status: "pending"
      });

      // Update stock
      product.stock -= item.quantity;
      await product.save();
    }


    // 4. Handle coupon
    let discount = 0, couponApplied = false, couponName = null;

    if (couponCode) {
      const coupon = await couponModel.findOne({ name: couponCode.trim() }); // No need isList here
    
      if (!coupon) return res.status(400).json({ success: false, message: "Invalid coupon code" });
    
      const now = new Date();
      if (coupon.expireOn < now) return res.status(400).json({ success: false, message: "Coupon expired" });
    
      if (coupon.isReferralCoupon) {
        // Referral Coupon logic
        if (coupon.userId.toString() !== userId.toString()) {
          return res.status(400).json({ success: false, message: "This referral coupon is not for your account" });
        }
    
        if (coupon.isUsed) {
          return res.status(400).json({ success: false, message: "Referral coupon already used" });
        }
    
        // Apply 25% discount
        discount = (totalPrice * coupon.offerPrice) / 100;
        couponApplied = true;
        couponName = coupon.name;
    
        // Mark referral coupon as used
        coupon.isUsed = true;
        await coupon.save();
    
      } else {
        // General Coupon logic
        if (totalPrice < coupon.minimumPrice) {
          return res.status(400).json({ success: false, message: `Minimum order value for this coupon is ₹${coupon.minimumPrice}` });
        }
    
        if (coupon.userId.includes(userId)) {
          return res.status(400).json({ success: false, message: "Coupon already used" });
        }
    
        discount = (totalPrice * coupon.offerPrice) / 100;

        if (coupon.maxPrice) {
          discount = Math.min(discount, coupon.maxPrice);
        }
    
        couponApplied = true;
        couponName = coupon.name;
    
        // Mark general coupon as used by adding userId
        coupon.userId.push(userId);
        await coupon.save();
      }
    }
    

    const deliveryCharge = totalPrice > 500 ? 0 : 40;
    const finalAmount = totalPrice - discount + deliveryCharge;

    // 5. Wallet check
    const wallet = await walletModel.findOne({ userId });
    if (!wallet || wallet.balance < finalAmount) {
      return res.status(400).json({ success: false, message: "Insufficient wallet balance" });
    }

    // 6. Create Order
    const newOrder = new orderModel({
      userId,
      orderedItems,
      totalOrderPrice: totalPrice,
      discount,
      deliveryCharge,
      finalAmount,
      couponName,
      couponApplied,
      address: selectedAddress,
      paymentMethod: "wallet",
      invoiceDate: new Date(),
      status: "pending",
      createdOn: new Date()
    });

    await newOrder.save();

    // 7. Debit Wallet
    wallet.balance -= finalAmount;
    wallet.totalDebited += finalAmount;
    wallet.transactions.push({
      amount: finalAmount,
      transactionType: 'debit',
      transactionPurpose: 'purchase',
      description: `Purchase using wallet - Order ID: ${newOrder.orderId}`
    });
    await wallet.save();

    // 8. Add Transaction
    await transactionModel.create({
      userId,
      amount: finalAmount,
      transactionType: 'debit',
      paymentMethod: 'wallet',
      paymentGateway: 'wallet',
      purpose: 'purchase',
      orders: [{ orderId: newOrder.orderId, amount: finalAmount }],
      walletBalanceAfter: wallet.balance,
      description: `Wallet purchase for order ${newOrder.orderId}`
    });

    // 9. Clear Cart
    userCart.cartItems = [];
    await userCart.save();

    res.status(201).json({ success: true, message: "Order placed successfully", orderIds: [newOrder.orderId] });

  } catch (err) {
    console.error("Wallet order error:", err);
    res.status(500).json({ success: false, message: "Something went wrong" });
  }
};


module.exports = {
    getWallet,
    createWalletRazorpayOrder,
    verifyPayment,
    placeWalletOrder
}