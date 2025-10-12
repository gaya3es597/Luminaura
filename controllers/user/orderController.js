const addressModel = require("../../models/addressSchema");
const cartModel = require("../../models/cartSchema");
const orderModel = require('../../models/orderSchema');
const productModel = require('../../models/productSchema');
const userModel = require("../../models/userSchema");
const transactionModel = require("../../models/transactionSchema")
const couponModel = require("../../models/couponSchema")
const { creditWallet } = require('../../helper/refundWallet');
const Razorpay = require("razorpay")
const crypto = require("crypto")
const env = require("dotenv").config()
const ejs = require('ejs');
const path = require('path');
const puppeteer = require('puppeteer');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const HttpStatus = require('../../constants/httpStatus');
const messages = require('../../constants/messages');


// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
})


const placeOrder = async (req, res) => {
  try {
    // const { addressId, paymentMethod, couponCode } = req.body;
    const userId = req.session.user;

    // 1. Find the selected address
    const userAddressDoc = await addressModel.findOne({ userId });
    if (!userAddressDoc) return res.status(HttpStatus.NOT_FOUND).json({ message: "Address document not found" });

    const selectedAddress = userAddressDoc.address.find(addr => addr._id.toString() === addressId);
    if (!selectedAddress) return res.status(HttpStatus.NOT_FOUND).json({ message: "Selected address not found" });

    // 2. Fetch the cart
    const userCart = await cartModel.findOne({ userId }).populate({
      path: 'cartItems.productId',
      populate: { path: 'category' }
    });
    if (!userCart || userCart.cartItems.length === 0) {
      return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: messages.ERROR.CART_EMPTY });
    }

    // 3. Calculate total and prepare order items
    let totalPrice = 0;
    const orderedItems = [];

    for (const item of userCart.cartItems) {
      const product = item.productId;
      const quantityOrdered = item.quantity;

      if (!product || product.stock < quantityOrdered) {
        return res.json({ success: false, message: ` "${product.productName}" ${messages.ERROR.NOT_ENOUGH_STOCK}` });
      }

      const productDiscount = product.discount || 0;
      const categoryDiscount = product.category?.categoryOffer || 0;
      const effectiveDiscount = Math.max(productDiscount, categoryDiscount);

      const priceAfterDiscount = product.price - (product.price * effectiveDiscount / 100);
      const totalItemPrice = priceAfterDiscount * quantityOrdered;

      totalPrice += totalItemPrice;

      orderedItems.push({
        product: product._id,
        productName: product.productName,
        productImages: product.productImage,
        quantity: quantityOrdered,
        price: priceAfterDiscount,
        regularPrice: product.price,
        totalProductPrice: totalItemPrice,
        status: "pending"
      });
    }

    // if (paymentMethod === 'cod' && totalPrice > 1000) {
    //   return res.status(HttpStatus.BAD_REQUEST).json({
    //     success: false,
    //     message: messages.ERROR.EXCEEDS_CASH_ON_DELIVERY_LIMIT
    //   });
    // }

    for (const item of userCart.cartItems) {
      const product = item.productId;
      product.stock -= item.quantity;
      await product.save();
    }

    // 4. Handle coupon
    let discount = 0;
    let couponName = null;
    let couponApplied = false;

    if (couponCode) {

      const coupon = await couponModel.findOne({
        name: couponCode.trim(),
        $or: [
          { isList: true },
          { isReferralCoupon: true }
        ]
      });
      
      if (!coupon) {
        return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: messages.ERROR.INVALID_COUPON });
      }

      const now = new Date();

      if (coupon.expireOn < now) {
        return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: messages.ERROR.EXPIRED_COUPON });
      }

      if (coupon.expireOn < now) {
        return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: messages.ERROR.EXPIRED_COUPON });
      }
      
      if (coupon.isReferralCoupon) {
        // Referral coupon
        if (coupon.userId.toString() !== userId.toString()) {
          return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: messages.ERROR.REFERAL_COUPON_ERROR });
        }
      
        if (coupon.isUsed) {
          return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: messages.ERROR.ALREADY_USED_REFERAL_CODE });
        }
      
        // Apply referral coupon discount (fixed value or % depending on your design)
        discount = (totalPrice * coupon.offerPrice) / 100;  // Since you used `offerPrice: 25` in referral coupon
        couponName = coupon.name;
        couponApplied = true;
      
        // Mark referral coupon as used
        coupon.isUsed = true;
        await coupon.save();
      
      } else {
        // General coupon
        if (totalPrice < coupon.minimumPrice) {
          return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: `${messages.ERROR.MINIMUM_ORDER_VALUE_ERROR} ₹${coupon.minimumPrice}` });
        }
      
        if (coupon.userId.map(id => id.toString()).includes(userId.toString())) {
          return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: messages.ERROR.ALREADY_USED_COUPON });
        }
      
        // Apply general coupon discount
        discount = (totalPrice * coupon.offerPrice) / 100;
        if (coupon.maxPrice) {
          discount = Math.min(discount, coupon.maxPrice);
        }
        couponName = coupon.name;
        couponApplied = true;
      
        // Mark general coupon as used by this user
        coupon.userId.push(userId);
        await coupon.save();
      }
     
    }

    const shippingCharges = totalPrice > 500 ? 0 : 40;
    const finalAmount = totalPrice - discount + shippingCharges;


    // 5. Create and save the order
    const newOrder = new orderModel({
      userId,
      orderId: `ORD-${new Date().getFullYear().toString().slice(-2)}${(new Date().getMonth()+1).toString().padStart(2,'0')}${new Date().getDate().toString().padStart(2,'0')}-${Math.floor(1000 + Math.random() * 9000)}`,
      orderedItems,
      totalOrderPrice: totalPrice,
      discount,
      deliveryCharge: shippingCharges,
      finalAmount,
      couponName: couponName || null,
      couponApplied,
      address: selectedAddress,
      paymentMethod,
      invoiceDate: new Date(),
      status: "pending",
      createdOn: new Date()
    });

    await newOrder.save();

    // 6. Clear the cart
    userCart.cartItems = [];
    await userCart.save();

    res.status(HttpStatus.CREATED).json({ success: true, message: messages.SUCCESS.ORDER_PLACED, orderId: newOrder.orderId });

  } catch (error) {
    console.error("Error placing order:", error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: messages.ERROR.INTERNAL_SERVER_ERROR });
  }
};


const getOrders = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.redirect('/login');
    }

    const query = {userId}
    const search = req.query.search || ''


    if (req.query.search) {
      query.$or = [
        { orderId: { $regex: new RegExp(search, 'i') } },
        { orderedItems: { $elemMatch: { productName: { $regex: new RegExp(search, 'i') } } } }
      ];
    }

    // Fetch user info for displaying name
    const userData = await userModel.findById(userId);

    // Fetch all orders placed by the user, newest first
    const orders = await orderModel
      .find(query)
      .sort({ createdOn: -1 });


    res.render('order', {
      user: { name: userData?.name || "User" },
      orders,
      currentPage: "orders",
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).send(messages.ERROR.INTERNAL_SERVER_ERROR);
  }
};


const orderDetails = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) return res.redirect('/login');

    const orderId = req.params.id;
    const productId = req.query.productId; // Important: Get specific product ID from query

    // Find the order by _id and userId
    const order = await orderModel.findOne({ _id: orderId, userId });


    if (!order) {
      return res.status(HttpStatus.NOT_FOUND).send(messages.ERROR.ORDER_NOT_FOUND);
    }

    // Find the specific product item from the orderedItems array
    const productItem = order.orderedItems.find(item => item._id.toString() === productId);

    if (!productItem) {
      return res.status(HttpStatus.NOT_FOUND).send(messages.ERROR.PRODUCT_NOT_FOUND);
    }

    // Optional: populate the product data if needed from productModel
    // const productData = await productModel.findById(productId);

    // Get user data (optional for displaying name, etc.)
    const user = await userModel.findById(userId);

    res.render('order-details', {
      order,
      productItem, // Pass the matched product item for details and tracking
      user: { name: user?.name || "User" },
      currentPage: 'orders'
    });

  } catch (error) {
    console.error("Error fetching order details:", error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).send(messages.ERROR.INTERNAL_SERVER_ERROR);
  }
};




const cancelOrder = async (req, res) => {
  try {
    const { orderId, itemId, reason } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res.status(HttpStatus.UNAUTHORIZED).json({ message: messages.VALIDATION.UNAUTHORIZED });
    }

    const order = await orderModel.findOne({ _id: orderId, userId });
    if (!order) {
      return res.status(HttpStatus.NOT_FOUND).json({ message: messages.ERROR.ORDER_NOT_FOUND });
    }

    const itemIndex = order.orderedItems.findIndex(item => item._id.toString() === itemId);
    if (itemIndex === -1) {
      return res.status(HttpStatus.NOT_FOUND).json({ message: messages.ERROR.ORDER_NOT_FOUND });
    }

    const item = order.orderedItems[itemIndex];
    if (item.status === "cancelled") {
      return res.status(HttpStatus.BAD_REQUEST).json({ message: messages.ERROR.ALREADY_CANCELLED });
    }

    order.orderedItems[itemIndex].status = "cancelled";
    order.orderedItems[itemIndex].cancelReason = reason;
    order.orderedItems[itemIndex].cancelledAt = new Date();

    const cancelledAmount = item.totalProductPrice || (item.price * item.quantity);
    order.totalOrderPrice -= cancelledAmount;
    order.finalAmount -= cancelledAmount;

    if (order.totalOrderPrice < 0) order.totalOrderPrice = 0;
    if (order.finalAmount < 0) order.finalAmount = 0;

    const product = await productModel.findById(item.product);
    if (product) {
      product.stock += item.quantity;
      await product.save();
    }

    if (order.paymentMethod === 'online' || order.paymentMethod === 'wallet') {
      let refundAmount = item.totalProductPrice;

      const remainingAmount = order.orderedItems
        .filter(i => i._id.toString() !== item._id.toString() && i.status !== 'cancelled')
        .reduce((acc, i) => acc + (i.totalProductPrice || (i.price * i.quantity)), 0);

      let couponRevoked = false;

      if (order.couponApplied && order.couponName) {
        const coupon = await couponModel.findOne({ name: order.couponName });

        if (coupon && coupon.minimumPrice) {
          if (remainingAmount < coupon.minimumPrice) {
            // Revoke full coupon
            couponRevoked = true;
            refundAmount -= order.discount;
            if (refundAmount < 0) refundAmount = 0;

            order.discount = 0;
            order.couponApplied = false;
            order.couponName = null;
          } else {
            // Proportional discount for this item
             const totalBeforeCancellation = order.totalOrderPrice + cancelledAmount;

  if (totalBeforeCancellation > 0 && order.discount > 0) {
    const itemShare = cancelledAmount / totalBeforeCancellation;
    const itemDiscount = Math.round(itemShare * order.discount * 100) / 100;

    refundAmount -= itemDiscount;
    if (refundAmount < 0) refundAmount = 0;

    // ✅ Now add this to update remaining order values
    const remainingDiscount = Math.round((remainingAmount / totalBeforeCancellation) * order.discount * 100) / 100;
    order.discount = remainingDiscount;
    order.finalAmount = remainingAmount - remainingDiscount;
            }
          }
        }
      }

      await creditWallet({
        userId,
        amount: refundAmount,
        orderId: order.orderId,
        productId: item._id.toString(),
        purpose: 'cancellation',
        description: couponRevoked
          ? `Refund adjusted due to coupon revocation - ${item.productName}`
          : `Refund for cancelled product - ${item.productName}`
      });

      await transactionModel.create({
        userId,
        amount: refundAmount,
        transactionType: "credit",
        paymentMethod: "refund",
        paymentGateway: order.paymentMethod === 'online' ? 'razorpay' : order.paymentMethod,
        purpose: "cancellation",
        status: "completed",
        orders: [{ orderId: order.orderId, amount: refundAmount }],
        description: couponRevoked
          ? `Refund adjusted due to coupon revocation - ${item.productName}`
          : `Refund for cancelled product - ${item.productName}`
      });
    }

    await order.save();
    res.status(HttpStatus.OK).json({ success: true, message: messages.SUCCESS.ORDER_CANCELLED_STOCK_UPDATED_REFUND_PROCESSED });
  } catch (error) {
    console.error("Error cancelling order:", error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: messages.ERROR.INTERNAL_SERVER_ERROR });
  }
};


const retrunProduct = async (req, res) => {
  try {
    const { orderId, itemId, returnReason, returnDescription } = req.body;
    const userId = req.session.user;
    const files = req.files

    const order = await orderModel.findOne({ _id: orderId, userId })
    if (!order) {
      return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: messages.ERROR.ORDER_NOT_FOUND })
    }



    const itemIndex = order.orderedItems.findIndex(item => item._id.toString() === itemId);

    if (itemIndex === -1) {
      return res.status(HttpStatus.NOT_FOUND).json({ message: messages.ERROR.ORDER_NOT_FOUND });
    }

    const item = order.orderedItems[itemIndex];


    const deliveredDate = item.deliveredOn
    const currentDate = new Date();
    const daysSinceDelivery = Math.floor((currentDate - deliveredDate) / (1000 * 60 * 60 * 24))

    if (item.status !== 'delivered' || daysSinceDelivery > 7) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: messages.ERROR.NOT_RETUNABLE,
      })
    }

    let imagePath = [];
    if (files && files.length > 0) {
      imagePath = files.map((file) => `uploads/returnImages/${file.filename}`);
    }

    item.status = 'return_requested'
    item.returnReason = returnReason
    item.returnDescription = returnDescription
    item.returnImages = imagePath
    item.requestStatus = "pending"

    item.updatedOn = new Date()

    // Set overall order status to return_requested
    order.status = 'return_requested'

    await order.save()

    res.json({
      success: true,
      message: messages.SUCCESS.RETURN_REQ_SUBMITTED,
    })

  } catch (error) {
    console.error("Error in requestReturn:", error)
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: messages.ERROR.INTERNAL_SERVER_ERROR,
    })
  }
}

const cancelReturnRequest = async (req, res) => {
  try {
    const { orderId, itemId } = req.body;
    const userId = req.session.user;

    const order = await orderModel.findOne({ _id: orderId, userId });
    if (!order) {
      return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: messages.ERROR.ORDER_NOT_FOUND });
    }

    const itemIndex = order.orderedItems.findIndex(item => item._id.toString() === itemId);
    if (itemIndex === -1) {
      return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: messages.ERROR.ORDER_NOT_FOUND });
    }

    const item = order.orderedItems[itemIndex];

    if (item.status !== 'return_requested') {
      return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: messages.ERROR.RETURN_REQ_NOT_FOUND });
    }

    // Revert the item status
    item.status = 'delivered';
    item.returnReason = undefined;
    item.returnDescription = undefined;
    item.returnImages = [];
    item.requestStatus = undefined;
    item.updatedOn = new Date();

    // If no other items have return_requested, revert overall order status
    const hasOtherReturnRequests = order.orderedItems.some(
      (it, idx) => idx !== itemIndex && it.status === 'return_requested'
    );

    if (!hasOtherReturnRequests) {
      order.status = 'delivered';
    }

    await order.save();

    res.json({ success: true, message: messages.SUCCESS.RETURN_REQ_CANCELLED });

  } catch (error) {
    console.error("Error in cancelReturnRequest:", error);
    res.status(500).json({ success: false, message: messages.ERROR.INTERNAL_SERVER_ERROR });
  }
};


const generateInvoice = async (req, res) => {
  try {
    const orderId = req.params.id;
    const order = await orderModel.findById(orderId).lean();

    if (!order) {
      return res.status(404).send(messages.ERROR.ORDER_NOT_FOUND);
    }

    // Set invoice date if not already set
    if (!order.invoiceDate) {
      order.invoiceDate = new Date();
    }

    // Remove cancelled items
    order.orderedItems = order.orderedItems.filter(item => item.status !== 'cancelled');

    // Adjust finalAmount for returned items
    let returnedAmount = 0;
    order.orderedItems.forEach(item => {
      if (item.status === 'returned') {
        returnedAmount += item.price * item.quantity;
      }
    });

    

    const adjustedFinalAmount = order.finalAmount - returnedAmount;
    order.adjustedFinalAmount = adjustedFinalAmount; // pass to invoice if needed

    // Render EJS to HTML
    const invoiceTemplatePath = path.join(__dirname, '../../views/user/invoice.ejs');
    const html = await ejs.renderFile(invoiceTemplatePath, { order });

    // Launch Puppeteer and generate PDF
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
    });

    await browser.close();

    // Send PDF to client
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=invoice_${order.orderId}.pdf`,
      'Content-Length': pdfBuffer.length
    });

    return res.send(pdfBuffer);

  } catch (error) {
    console.error('Invoice generation error:', error);
    return res.status(500).send(messages.ERROR.INVOICE_GENERATION_ERROR);
  }
};


const createRazorpayOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    const { addressId, couponCode, paymentMethod } = req.body;

    // Fetch cart
    const cart = await cartModel.findOne({ userId }).populate({
      path: 'cartItems.productId',
      populate: { path: 'category' }
    });
    if (!cart || cart.cartItems.length === 0) {
      return res.json({ success: false, message: messages.ERROR.CART_EMPTY });
    }

    // Calculate total amount with effective discount
    let totalAmount = 0;
    for (let item of cart.cartItems) {
      const product = item.productId;
      const productDiscount = product.discount || 0;
      const categoryDiscount = product.category?.categoryOffer || 0;
      const effectiveDiscount = Math.max(productDiscount, categoryDiscount);

      const priceAfterDiscount = product.price - (product.price * effectiveDiscount / 100);
      totalAmount += priceAfterDiscount * item.quantity;
    }

    // Store pre-coupon amount for delivery charge check
    let amountBeforeCoupon = totalAmount;

    // Delivery charge: Free if total > 500, else ₹40
    let deliveryCharge = 0;
    if (amountBeforeCoupon <= 500) {
      deliveryCharge = 40;
      totalAmount += deliveryCharge;
    }


    // Coupon logic
    let discountAmount = 0;
    if (couponCode) {
      const coupon = await couponModel.findOne({ name: couponCode.trim(), isList: true });
      if (!coupon) {
        return res.status(400).json({ success: false, message: messages.ERROR.INVALID_COUPON });
      }

      const now = new Date();
      if (coupon.expireOn < now) {
        return res.status(400).json({ success: false, message: messages.ERROR.EXPIRED_COUPON });
      }

      if (coupon.isReferralCoupon) {
        // Referral coupon logic
        if (coupon.userId.toString() !== userId.toString()) {
          return res.status(400).json({ success: false, message: messages.ERROR.REFERAL_COUPON_ERROR });
        }

        if (coupon.isUsed) {
          return res.status(400).json({ success: false, message: messages.ERROR.ALREADY_USED_REFERAL_CODE });
        }

        // Referral coupon is flat offerPrice value
        discountAmount = (totalAmount * coupon.offerPrice) / 100;
        totalAmount -= discountAmount;

      } else {
        // General coupon logic

        if (coupon.userId.includes(userId)) {
          return res.status(400).json({ success: false, message: messages.ERROR.ALREADY_USED_COUPON });
        }

        if (totalAmount < coupon.minimumPrice) {
          return res.status(400).json({
            success: false,
            message: `${messages.ERROR.MINIMUM_ORDER_VALUE_ERROR} ₹${coupon.minimumPrice}`,
          });
        }

        // General coupon: % based discount, capped by maxPrice if applicable
        let calculatedDiscount = (totalAmount * coupon.offerPrice) / 100;
        if (coupon.maxPrice) {
          calculatedDiscount = Math.min(calculatedDiscount, coupon.maxPrice);
        }
        discountAmount = calculatedDiscount;
        totalAmount -= discountAmount;

      }
    }


    // Convert to paise
    const amountInPaise = Math.round(totalAmount * 100);

    // Create Razorpay order
    const options = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: 'rcpt_' + Math.random().toString(36).substring(7),
    };

    const order = await razorpay.orders.create(options);


    const user = await userModel.findById(userId);

    res.json({
      success: true,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      customerName: user.name,
      customerEmail: user.email,
      customerPhone: user.phone,
    });

  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    res.status(500).json({ success: false, message: messages.ERROR.RAZORPAY_ERROR });
  }
};

const verifyPayment = async (req, res) => {
  try {
    const userId = req.session.user;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderData } = req.body;

    // Step 1: Verify payment signature
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generatedSignature = hmac.digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: messages.ERROR.INVALID_PAYMENT_SIGNATURE});
    }

    // Step 2: Validate address
    const userAddressDoc = await addressModel.findOne({ userId });
    if (!userAddressDoc) return res.status(404).json({ success: false, message: messages.ERROR.ADDRESS_NOT_FOUND });

    const selectedAddress = userAddressDoc.address.find(addr => addr._id.toString() === orderData.addressId);
    if (!selectedAddress) return res.status(404).json({ success: false, message: messages.ERROR.ADDRESS_NOT_FOUND});

    // Step 3: Get cart and calculate totals
    const userCart = await cartModel.findOne({ userId }).populate({
      path: 'cartItems.productId',
      populate: { path: 'category' }
    });

    if (!userCart || userCart.cartItems.length === 0) {
      return res.status(400).json({ success: false, message: messages.ERROR.CART_EMPTY });
    }

    // Step 4: Calculate total price using effective discount
    let totalPrice = 0;
    const orderedItems = [];

    for (const item of userCart.cartItems) {
      const product = item.productId;
      const quantityOrdered = item.quantity;

      if (product.stock === null || product.stock < quantityOrdered) {
        return res.json({ success: false, message: `${messages.ERROR.INSUFFICIENT_STOCK} for ${product.productName}` });
      }

      const productDiscount = product.discount || 0;
      const categoryDiscount = product.category?.categoryOffer || 0;

      const effectiveDiscount = Math.max(productDiscount, categoryDiscount);
      const priceAfterDiscount = product.price - (product.price * effectiveDiscount / 100);
      const totalItemPrice = priceAfterDiscount * quantityOrdered;

      totalPrice += totalItemPrice;

      orderedItems.push({
        product: product._id,
        productName: product.productName,
        productImages: product.productImage,
        quantity: quantityOrdered,
        price: priceAfterDiscount,
        regularPrice: product.price,
        totalProductPrice: totalItemPrice,
        status: "pending"
      });

      product.stock -= quantityOrdered;
      await product.save();
    }

    // Step 4: Apply coupon if valid
    let discount = 0;
    let couponUsed = false;
    let couponName = null;

    if (orderData.couponCode) {
      const coupon = await couponModel.findOne({ name: orderData.couponCode.trim() });
    
      if (!coupon) {
        return res.status(400).json({ success: false, message: messages.ERROR.INVALID_COUPON });
      }
    
      const now = new Date();
      if (coupon.expireOn < now) {
        return res.status(400).json({ success: false, message: messages.ERROR.EXPIRED_COUPON });
      }
    
      // Referral Coupon
      if (coupon.isReferralCoupon) {
        if (coupon.userId.toString() !== userId.toString()) {
          return res.status(400).json({ success: false, message: messages.ERROR.REFERAL_COUPON_ERROR });
        }
    
        if (coupon.isUsed) {
          return res.status(400).json({ success: false, message: messages.ERROR.ALREADY_USED_REFERAL_CODE});
        }
    
  
        discount = (totalPrice * coupon.offerPrice) / 100;
        couponUsed = true;
        couponName = coupon.name;
    
        // Mark referral coupon as used
        coupon.isUsed = true;
        await coupon.save();
    
      } else {
        // General Coupon
    
        if (coupon.userId.includes(userId)) {
          return res.status(400).json({ success: false, message: messages.ERROR.ALREADY_USED_COUPON });
        }
    
        if (totalPrice < coupon.minimumPrice) {
          return res.status(400).json({
            success: false,
            message: `${messages.ERROR.MINIMUM_ORDER_VALUE_ERROR} ₹${coupon.minimumPrice}`,
          });
        }
    
        // Apply discount with maxPrice cap
        discount = (totalPrice * coupon.offerPrice) / 100;
        if (coupon.maxPrice) {
          discount = Math.min(discount, coupon.maxPrice);
        }

        couponUsed = true;
        couponName = coupon.name;
    
        // Mark general coupon as used by adding userId
        coupon.userId.push(userId);
        await coupon.save();
      }
    }
    

    const shippingCharges = totalPrice > 500 ? 0 : 40;
    const finalAmount = totalPrice - discount + shippingCharges;

    // Step 5: Save order
    const newOrder = new orderModel({
      userId,
      orderId: `ORD-${new Date().getFullYear().toString().slice(-2)}${(new Date().getMonth()+1).toString().padStart(2,'0')}${new Date().getDate().toString().padStart(2,'0')}-${Math.floor(1000 + Math.random() * 9000)}`,
      orderedItems,
      totalOrderPrice: totalPrice,
      discount,
      deliveryCharge: shippingCharges,
      finalAmount,
      address: selectedAddress,
      paymentMethod: "online",
      invoiceDate: new Date(),
      status: "pending",
      createdOn: new Date(),
      couponApplied: couponUsed,
      couponName: couponName
    });

    await newOrder.save();

    // Step 6: Save transaction
    const transaction = new transactionModel({
      userId,
      amount: finalAmount,
      transactionType: "debit",
      paymentMethod: "online",
      paymentGateway: "razorpay",
      gatewayTransactionId: razorpay_payment_id,
      status: "completed",
      purpose: "purchase",
      description: `Purchase using Razorpay. Order ID: ${newOrder.orderId}`,
      orders: [{ orderId: newOrder.orderId, amount: finalAmount }]
    });

    await transaction.save();

    // Step 7: Clear cart
    userCart.cartItems = [];
    await userCart.save();

    // Step 8: Return response
    res.status(200).json({
      success: true,
      message: messages.SUCCESS.PAYMENT_SUCCESSFUL,
      orderId: newOrder.orderId
    });

  } catch (error) {
    console.error("Payment verification error:", error);
    res.status(500).json({ success: false, message: messages.ERROR.INTERNAL_SERVER_ERROR});
  }
};

// orderController.js
const saveFailedOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    const { addressId, paymentMethod, couponCode } = req.body;

    const userAddressDoc = await addressModel.findOne({ userId });
    const selectedAddress = userAddressDoc?.address.find(addr => addr._id.toString() === addressId);
    const userCart = await cartModel.findOne({ userId }).populate({
      path: 'cartItems.productId',
      populate: { path: 'category' }
    });

    if (!userCart || !selectedAddress) {
      return res.status(400).json({ success: false, message: messages.ERROR.CART_ERROR });
    }

    let totalPrice = 0;
    const orderedItems = [];

    for (const item of userCart.cartItems) {
      const product = item.productId;
      const quantity = item.quantity;
      const discount = Math.max(product.discount || 0, product.category?.categoryOffer || 0);
      const priceAfterDiscount = product.price - (product.price * discount / 100);
      const totalItemPrice = priceAfterDiscount * quantity;

      totalPrice += totalItemPrice;

      orderedItems.push({
        product: product._id,
        productName: product.productName,
        productImages: product.productImage,
        quantity,
        price: priceAfterDiscount,
        regularPrice: product.price,
        totalProductPrice: totalItemPrice,
        status: 'failed'
      });
    }

    const shippingCharges = totalPrice > 500 ? 0 : 40;
    const finalAmount = totalPrice + shippingCharges;

    const order = new orderModel({
      userId,
      orderId: `ORD-${new Date().getFullYear().toString().slice(-2)}${(new Date().getMonth() + 1).toString().padStart(2, '0')}${new Date().getDate().toString().padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`,
      orderedItems,
      totalOrderPrice: totalPrice,
      discount: 0,
      deliveryCharge: shippingCharges,
      finalAmount,
      address: selectedAddress,
      paymentMethod,
      invoiceDate: new Date(),
      status: "failed",
      createdOn: new Date(),
      paymentStatus: 'failed' // ✅ main flag
    });

    await order.save();

    res.status(201).json({
      success: true,
      message: messages.SUCCESS.FAILED_ORDER_SAVED,
      orderId: order.orderId
    });

  } catch (error) {
    console.error("Failed to save failed order:", error);
    res.status(500).json({ success: false, message: messages.ERROR.INTERNAL_SERVER_ERROR });
  }
};




module.exports = {
  placeOrder,
  getOrders,
  orderDetails,
  cancelOrder,
  retrunProduct,
  cancelReturnRequest,
  generateInvoice,
  createRazorpayOrder,
  verifyPayment,
  saveFailedOrder,
};