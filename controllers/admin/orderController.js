const couponModel = require('../../models/couponSchema');
const orderModel = require('../../models/orderSchema');
const productModel = require('../../models/productSchema');
const userModel = require("../../models/userSchema");
const { creditWallet } = require('../../helper/refundWallet');
const HttpStatus = require("../../constants/httpStatus");
const messages = require("../../constants/messages");

const getOrders = async (req, res) => {
  try {

    const { search = '', statusFilter = '', sortBy = '', page = 1 } = req.query;
    const query = {};

    // const search = req.query.search || '';
    // const page = parseInt(req.query.page) || 1;
    // const limit = 5; // You can change this as needed
    // const skip = (page - 1) * limit;

    

    if(req.query.search){
      query.$or = [
        { orderId: { $regex: new RegExp(search, 'i') } },
        { 'address.name': { $regex: new RegExp(search, 'i') } }
      ];

    }
    if (statusFilter) {
      query.status = statusFilter;
    }

     let sort = {};
    switch (sortBy) {
      case 'date_asc':
        sort.createdOn = 1;
        break;
      case 'date_desc':
        sort.createdOn = -1;
        break;
      case 'orderId_asc':
        sort.orderId = 1;
        break;
      case 'orderId_desc':
        sort.orderId = -1;
        break;
      case 'status_asc':
        sort.status = 1;
        break;
      case 'status_desc':
        sort.status = -1;
        break;
      default:
        sort.createdOn = -1; // default sort newest first
    }
    
    const limit = 10;
    const skip = (page - 1) * limit;
     const ordersData = await orderModel.find(query)
      .populate('orderedItems.product') // populates product info
      .sort({ createdOn: -1 })
      .skip(skip)
      .limit(limit);

     const orders = ordersData.map(order => {
      return {
        _id: order.orderId,
        date: order.invoiceDate.toISOString().split('T')[0],
        customerName: order.address.name,
        products: order.orderedItems.map(item => ({
          name: item.product?.productName || "Unknown Product",
          image: item.product?.productImage?.[0] || "/images/default.jpg",
          quantity: item.quantity || 1,
          itemId: item._id,
          amount: (item.price * item.quantity).toFixed(2),
          status: item.status.charAt(0).toUpperCase() + item.status.slice(1),
          requestStatus: item.requestStatus
        })),
        amount: order.finalAmount,
        status: order.status.charAt(0).toUpperCase() + order.status.slice(1)
      };
    });
    // Total count for pagination
    const totalOrders = await orderModel.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / limit);

    res.render('admin-orders', {
      orders,
      name:orders.
      search,
      statusFilter,
      sortBy,
      currentPage: Number(page),
      totalPages
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({error:messages.ERROR.INTERNAL_SERVER_ERROR});
  }
};
const cancelProductOrder = async (req, res) => {
  try {
    const { orderId, itemId } = req.body;


    // Find the order belonging to the user
    const order = await orderModel.findOne({ orderId: orderId });


    if (!order) {
      return res.status(HttpStatus.NOT_FOUND).json({ message: messages.ERROR.ORDER_NOT_FOUND });
    }

    // Find the item within the orderedItems array
    const itemIndex = order.orderedItems.findIndex(item => item._id.toString() === itemId);
    if (itemIndex === -1) {
      return res.status(HttpStatus.NOT_FOUND).json({ message: messages.ERROR.ORDER_NOT_FOUND });
    }

    const item = order.orderedItems[itemIndex];

    // If already cancelled
    if (item.status === "cancelled") {
      return res.status(HttpStatus.BAD_REQUEST).json({ message: messages.ERROR.ALREADY_CANCELLED });
    }

    // Update item status to cancelled
    order.orderedItems[itemIndex].status = "cancelled";
    order.orderedItems[itemIndex].cancelledAt = new Date();

     // Adjust total and final price
     const cancelledAmount = item.totalProductPrice || (item.price * item.quantity);
     order.totalOrderPrice -= cancelledAmount;
     order.finalAmount -= cancelledAmount;
 
     // Ensure prices don’t go negative
     if (order.totalOrderPrice < 0) order.totalOrderPrice = 0;
     if (order.finalAmount < 0) order.finalAmount = 0;

    // Restore stock
    const product = await productModel.findById(item.product);
    if (product) {
      product.stock += item.quantity;
      await product.save();
    }

    // Check if all products are cancelled
    const allItemsCancelled = order.orderedItems.every(i => i.status === "cancelled");
    if (allItemsCancelled) {
      order.status = "cancelled"; // update order status
      order.cancelledAt = new Date();
    }

    // Save updated order
    await order.save();

    // Refund to wallet if applicable
    if (['online', 'wallet'].includes(order.paymentMethod)) {
      await creditWallet({
        userId: order.userId,
        amount: item.price * item.quantity,
        orderId: order.orderId,
        productId: item._id.toString(),
        purpose: 'cancellation',
        description: `Refund for cancelled product: ${item.productName}`
      });
    }
  
    res.status(HttpStatus.OK).json({ success: true, message: messages.SUCCESS.CANCELLED});
  } catch (error) {
    console.error("Error cancelling order:", error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: messages.ERROR.INTERNAL_SERVER_ERROR });
  }
}

const updateProductOrderStatus = async (req, res) => {
  try {
    const { orderId, status, itemId } = req.body;

    const order = await orderModel.findOne({ orderId: orderId })

    const itemIndex = order.orderedItems.findIndex(item => item._id.toString() === itemId)

    if (itemIndex === -1) {
      return res.status(HttpStatus.NOT_FOUND).json({ message: messages.ERROR.ITEM_NOT_FOUND });
    }

    const item = order.orderedItems[itemIndex];

    if (item.status === 'cancelled') {
      return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: messages.ERROR.CANNOT_UPDATE_CANCELLED_ORDER })
    }

    item.status = status

    item.updatedOn = new Date()

    if (status === 'delivered') {
      item.deliveredOn = new Date()
    }

    await order.save()

    // Check if all items now have the same status
    const allSameStatus = order.orderedItems.every(
      p => p.status === status || p.status === 'cancelled'
    );

    // Only update the order status if all non-cancelled products match the updated status
    if (allSameStatus && status !== 'cancelled') {
      order.status = status;
      order.updatedOn = new Date();

      if (status === 'delivered') {
        order.deliveredOn = new Date();
      }

      await order.save(); // save again with updated order status
    }

    res.json({ success: true, message: messages.SUCCESS.PRODUCT_DELETED });

  } catch (error) {
    console.error("Error updating order status:", error)
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ success: false, message: messages.ERROR.INTERNAL_SERVER_ERROR })
  }
}

//admin orders

const viewOrderDetails = async (req, res) => {
  try {
    const orderId = req.params.id;

    const order = await orderModel.findOne({ orderId })
      .populate('orderedItems.product')
      .lean();

    if (!order) {
      return res.status(HttpStatus.NOT_FOUND).json({message:messages.ERROR.ORDER_NOT_FOUND});
    }

    const couponName = order.couponName;
    let couponDiscount = 0;

    // Get coupon discount if applied
    if (order.couponApplied && couponName) {
      const coupon = await couponModel.findOne({ name: couponName });

      if (coupon) {
        couponDiscount = Math.round(order.totalOrderPrice * (coupon.offerPrice / 100));
      }
    }

    const userId = order.userId;
    const userData = await userModel.findById(userId);

    // Compute returned amount:
    const totalOrderAmountBeforeDiscount = order.orderedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    let returnedAmount = 0;

    order.orderedItems.forEach(item => {
      if (item.status === 'returned') {
        const itemTotal = item.price * item.quantity;

        // Proportional discount for this item:
        let proportionalDiscount = 0;
        if (order.couponApplied && order.discount > 0) {
          const discountRatio = itemTotal / totalOrderAmountBeforeDiscount;
          proportionalDiscount = order.discount * discountRatio;
        }

        // Final refund for this product:
        const refundAmount = itemTotal - proportionalDiscount;

        returnedAmount += refundAmount;
      }
    });

    // Round returnedAmount to 2 decimals
    returnedAmount = Math.round(returnedAmount * 100) / 100;

    // Final amount after returns
    const finalAmountAfterReturn = Math.max(order.finalAmount - returnedAmount, 0);

    const formattedOrder = {
      _id: order.orderId,
      status: order.status,
      shipping: order.deliveryCharge,
      customerName: order.address?.name || 'Customer',
      address: `${order.address?.streetAddress || ''}, ${order.address?.town || ''}, ${order.address?.city || ''}, ${order.address?.state || ''}, ${order.address?.country || ''}, ${order.address?.pincode || ''}`,
      phone: order.address?.phone,
      email: userData.email || 'Not Provided',
      products: order.orderedItems.map(item => ({
        productId: item.product._id,
        itemId: item._id,
        name: item.productName,
        quantity: item.quantity,
        price: item.price,
        image: item.productImages?.[0] || item.product?.productImage?.[0] || '/images/no-image.png',
        status: item.status,
        amount: item.totalProductPrice,
        returnReason: item.returnReason,
        returnDescription: item.returnDescription,
        returnImages: item.returnImages,
        requestStatus: item.requestStatus,
        restocked: item.restocked,
        deliveredOn: item.deliveredOn,
        returnedOn:item.returnedOn
      })),
      total: order.totalOrderPrice,
      couponDiscount, // add discount value
      finalAmount: order.finalAmount,
      returnedAmount, // NEW: returned amount
      finalAmountAfterReturn, // NEW: final amount after subtracting returnedAmount
      paymentMethod: order.paymentMethod,
      couponApplied: order.couponApplied,
      couponName: order.couponName,
      createdOn: order.createdOn,
      deliveredOn:order.deliveredOn
    };

    res.render('admin-orderDetails', { order: formattedOrder });

  } catch (error) {
    console.error('Error loading order details:', error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({message:messages.ERROR.INTERNAL_SERVER_ERROR});
  }
};


const updateOrderStatus = async (req, res) => {
  try {
    const { orderId, status } = req.body;

    const order = await orderModel.findOne({ orderId });

    if (!order) {
      return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: messages.ERROR.ORDER_NOT_FOUND });
    }

    const currentTime = new Date();

    // Update order-level status
    order.status = status;
    order.updatedOn = currentTime;

    if (status === 'delivered') {
      order.deliveredOn = currentTime;
    }

    // Update status for all non-cancelled products in orderedItems
    order.orderedItems = order.orderedItems.map(item => {
      if (item.status === 'cancelled') {
        return item; // leave cancelled item unchanged
      }

      return {
        ...item.toObject(),
        status,
        updatedOn: currentTime,
        deliveredOn: status === 'delivered' ? currentTime : item.deliveredOn,
      };
    });

    await order.save();

    return res.status(HttpStatus.OK).json({ success: true, message: messages.SUCCESS.ORDER_PRODUCT_STATUS });
  } catch (error) {
    console.error('Error updating order status:', error);
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ success: false, message: messages.ERROR.INTERNAL_SERVER_ERROR });
  }
};


const cancelOrder = async (req, res) => {
  try {
    const { orderId, reason } = req.body;

    const order = await orderModel.findOne({ orderId });
    if (!order) {
      return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: messages.ERROR.ORDER_NOT_FOUND });
    }

    if (order.status === 'cancelled') {
      return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: messages.ERROR.ALREADY_CANCELLED });
    }

    // Cancel each item and restock
    for (const item of order.orderedItems) {
      if (item.status !== 'cancelled') {
        item.status = 'cancelled';
        item.cancelReason = reason || 'Cancelled by admin';
        item.cancelledAt = new Date();
        item.updatedOn = new Date();

        const product = await productModel.findById(item.product);
        if (product) {
          product.stock += item.quantity;
          await product.save();
        }
      }
    }

    // Update order status
    order.status = 'cancelled';
    order.cancelReason = reason || 'Cancelled by admin';
    order.updatedOn = new Date();
    await order.save();

    // Refund if payment was made online or via wallet
    if (['online', 'wallet'].includes(order.paymentMethod)) {
      for (const item of order.orderedItems) {
        // Only refund non-cancelled items (already marked above)
        if (item.status === 'cancelled') {
          await creditWallet({
            userId: order.userId,
            amount: item.price * item.quantity,
            orderId: order.orderId,
            productId: item._id.toString(),
            purpose: 'cancellation',
            description: `Refund for cancelled item By Admin: ${item.productName}`
          });
        }
      }
    }

    res.json({ success: true, message: messages.SUCCESS.ORDER_CANCELLED_STOCK_UPDATED_REFUND_PROCESSED });
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ success: false, message: messages.ERROR.INTERNAL_SERVER_ERROR });
  }
};


const handleReturnRequest = async (req, res) => {
  try {
    const { orderId, productId, action, rejectionCategory, rejectionReason } = req.body;

    const order = await orderModel.findOne({orderId});
    if (!order) {
      return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: messages.ERROR.ORDER_NOT_FOUND });
    }

    const itemIndex = order.orderedItems.findIndex(
      (item) => item._id.toString() === productId
    );

    if (itemIndex === -1) {
      return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: messages.ERROR.PRODUCT_NOT_FOUND });
    }

    const item = order.orderedItems[itemIndex];

    if (item.status !== 'return_requested') {
      return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: messages.ERROR.NOT_RETUNABLE });
    }

    if (action === 'approve') {
      item.requestStatus = 'approved';
      item.status = 'returning';
    } else if (action === 'reject') {
      item.requestStatus = 'rejected';
      item.status = 'delivered'; // Rollback to previous delivered state
      item.rejectionCategory = rejectionCategory;
      item.rejectionReason = rejectionReason;
      item.returnImages = [];
    } else {
      return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: messages.VALIDATION.INVALID_ACTION });
    }

    // Update overall order status if any item is still in return_requested or returning state
    const hasReturnRequestedItem = order.orderedItems.some(
      (item) => item.status === 'return_requested' || item.status === 'returning'
    );

    order.status = hasReturnRequestedItem ? 'return_requested' : 'delivered';
    item.updatedOn = new Date();

    await order.save();

    res.json({
      success: true,
      message: `Return ${action === 'approve' ? 'approved' : 'rejected'} successfully.`,
    });
  } catch (error) {
    console.error("Error handling return request:", error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: messages.ERROR.INTERNAL_SERVER_ERROR,
    });
  }
};

const updateReturnStatus = async (req, res) => {
  try {
    const { orderId, productId, status } = req.body;

    const order = await orderModel.findOne({ orderId });

    if (!order) {
      return res.status(HttpStatus.NOT_FOUND).json({
        success: false,
        message: messages.ERROR.ORDER_NOT_FOUND,
      });
    }

    const itemIndex = order.orderedItems.findIndex(
      (item) => item._id.toString() === productId
    );

    if (itemIndex === -1) {
      return res.status(HttpStatus.NOT_FOUND).json({
        success: false,
        message: messages.ERROR.PRODUCT_NOT_FOUND,
      });
    }

    const item = order.orderedItems[itemIndex];

    // Only allow status updates to 'returning' or 'returned'
    if (!['returning', 'returned'].includes(status)) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: messages.VALIDATION.INVALID_STATUS,
      });
    }

    const currentTime = new Date();

    item.status = status;
    item.updatedOn = currentTime;

    if (status === 'returned') {
      item.returnedOn = currentTime;
    }

    // Update overall order status if any item is still in return flow
    const stillReturning = order.orderedItems.some(
      (i) => i.status === 'return_requested' || i.status === 'returning'
    );

    order.status = stillReturning ? 'return_requested' : 'delivered';

    await order.save();

     // Refund to wallet only when status becomes 'returned'
     if (status === 'returned') {
      await creditWallet({
        userId: order.userId,
        amount: item.totalProductPrice,
        orderId: order.orderId,
        productId,
        purpose: 'return',
        description: 'Refund for returned product'
      });
    }

    res.status(HttpStatus.OK).json({
      success: true,
      message: `Return status updated to '${status}' successfully.`,
    });
  } catch (error) {
    console.error("Error updating return status:", error);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: messages.ERROR.INTERNAL_SERVER_ERROR,
    });
  }
};


const addToStock = async (req, res) => {
  try {
    const { orderId, productId } = req.body;

    // Find the order by ID
    const order = await orderModel.findOne({ orderId });
    if (!order) {
      return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: messages.ERROR.ORDER_NOT_FOUND });
    }


    // Find the product in orderedItems
    const orderedItem = order.orderedItems.find(
      item => item.product.toString() === productId
    );

    if (!orderedItem) {
      return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: messages.ERROR.ITEM_NOT_FOUND });
    }

    // Check if return was approved
    if (orderedItem.requestStatus !== 'approved') {
      return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: messages.ERROR.NOT_RETUNABLE });
    }

    // Optional: add a flag so restock only happens once (if not using already)
    if (orderedItem.restocked) {
      return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: messages.ERROR.ALREADY_RE_STOCKED });
    }

    // Update product stock
    const product = await productModel.findById(productId);
    if (!product) {
      return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: messages.ERROR.PRODUCT_NOT_FOUND });
    }

    product.stock += orderedItem.quantity;
    await product.save();

    // Mark item as restocked (if not in schema, add this to orderedItems schema)
    orderedItem.restocked = true;
    await order.save();

    return res.status(HttpStatus.OK).json({ success: true, message: messages.SUCCESS.STOCK_UPDATED });
  } catch (error) {
    console.error('Error in addToStock:', error);
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ success: false, message: messages.ERROR.INTERNAL_SERVER_ERROR });
  }
};

module.exports = {
  getOrders,
  cancelProductOrder,
  updateProductOrderStatus,
  viewOrderDetails,
  updateOrderStatus,
  cancelOrder,
  handleReturnRequest,
  updateReturnStatus,
  addToStock
};