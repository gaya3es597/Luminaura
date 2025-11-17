const userModel = require("../../models/userSchema")
const Product = require("../../models/productSchema")
const Order = require("../../models/orderSchema")
const Category = require("../../models/categorySchema")
const bcrypt = require('bcrypt');
const HttpStatus = require("../../constants/httpStatus");
const messages = require("../../constants/messages");


const pageerror = (req, res) => {
    res.render('admin-error')
}

const loadLogin = async (req, res) => {

    if (req.session.admin) {
        return res.redirect('/admin/dashboard')
    }
    res.render('adminLogin' , {showSidebar: false})

}

const adminLogin = async (req, res) => {

    try {

        const { email, password } = req.body;

        const findAdmin = await userModel.findOne({ email, isAdmin: true });

        if (!findAdmin) {
            return res.render('adminLogin', { message: messages.ERROR.INVALID_CREDENTIALS });
        }

        const checkPassword = await bcrypt.compare(password, findAdmin.password);

        if (!checkPassword) {
            return res.render('adminLogin', { message: messages.ERROR.INVALID_CREDENTIALS })
        }

        req.session.admin = findAdmin._id;

        return res.redirect('/admin/dashboard');

    } catch (error) {
        console.log('admin login error', error);
        return res.redirect('/pageeroor');
    }
}


const getSalesChartData = async (filter) => {
    let matchStage = { status: "delivered" };
    let groupStage;
    let sortStage;
    let dateLimit = new Date();

    if (filter === 'last30') {
        dateLimit.setDate(dateLimit.getDate() - 30);
        matchStage.createdOn = { $gte: dateLimit };

        groupStage = {
            _id: {
                year: { $year: "$createdOn" },
                month: { $month: "$createdOn" },
                day: { $dayOfMonth: "$createdOn" }
            },
            totalSales: { $sum: "$finalAmount" }
        };

        sortStage = { "_id.year": 1, "_id.month": 1, "_id.day": 1 };

    } else if (filter === 'yearly') {
        groupStage = {
            _id: { year: { $year: "$createdOn" } },
            totalSales: { $sum: "$finalAmount" }
        };

        sortStage = { "_id.year": 1 };

    } else {
        // monthly
        groupStage = {
            _id: { year: { $year: "$createdOn" }, month: { $month: "$createdOn" } },
            totalSales: { $sum: "$finalAmount" }
        };

        sortStage = { "_id.year": 1, "_id.month": 1 };
    }

    const sales = await Order.aggregate([
        { $match: matchStage },
        { $group: groupStage },
        { $sort: sortStage }
    ]);

    const labels = sales.map(s => {
        if (filter === 'yearly') return s._id.year.toString();
        if (filter === 'last30') return `${s._id.day}/${s._id.month}`;
        return `${s._id.month}/${s._id.year}`;
    });

    const data = sales.map(s => s.totalSales);

    return { labels, data };
};

const loadSalesPage = async (req, res) => {
  try {
    const reportType = req.query.reportType || 'daily';
    const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : null;

    let matchStage = { status: "delivered" };

    // Handle date filters
    const now = new Date();
    if (reportType === 'daily') {
      matchStage.createdOn = { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) };
    } else if (reportType === 'weekly') {
      const weekAgo = new Date();
      weekAgo.setDate(now.getDate() - 7);
      matchStage.createdOn = { $gte: weekAgo };
    } else if (reportType === 'monthly') {
      const monthAgo = new Date();
      monthAgo.setMonth(now.getMonth() - 1);
      matchStage.createdOn = { $gte: monthAgo };
    } else if (reportType === 'custom' && startDate && endDate) {
      matchStage.createdOn = { $gte: startDate, $lte: endDate };
    }

    // Fetch orders
    const orders = await Order.aggregate([
      { $match: matchStage },
      {
        $project: {
          orderId: 1,
          paymentMethod: 1,
          finalAmount: 1,
          lessPrice: 1,
          discount: 1,
          createdOn: 1
        }
      }
    ]);

    const totalSales = orders.reduce((sum, o) => sum + o.finalAmount, 0);
    const orderCount = orders.length;
    const lessPrices = orders.reduce((sum, o) => sum + (o.lessPrice || 0), 0);
    const discounts = orders.reduce((sum, o) => sum + (o.discount || 0), 0);

    const salesData = {
      totalSales,
      orderCount,
      lessPrices,
      discounts,
      sales: orders.map(o => ({
        date: o.createdOn,
        orderId: o.orderId,
        amount: o.finalAmount,
        lessPrice: o.lessPrice || 0,
        discount: o.discount || 0,
        paymentMethod: o.paymentMethod
      }))
    };

    // sending selectedReportType
    res.render("sales-report", {
      selectedReportType: reportType,
      startDate: req.query.startDate || '',
      endDate: req.query.endDate || '',
      salesData
    });

  } catch (error) {
    console.error("Error loading sales report:", error);
    res.status(500).render("admin-error", { message: "Failed to load sales report" });
  }
};


const loadDashboard = async (req, res) => {
    try {
        const filter = req.query.filter || 'monthly';
        const salesData = await getSalesChartData(filter);

        // Top products
        const topProducts = await Order.aggregate([
            { $unwind: "$orderedItems" },
            { $match: { status: "delivered" } },
            {
                $group: {
                    _id: "$orderedItems.product",
                    totalQuantity: { $sum: "$orderedItems.quantity" }
                }
            },
            { $sort: { totalQuantity: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: "products",
                    localField: "_id",
                    foreignField: "_id",
                    as: "productDetails"
                }
            },
            { $unwind: "$productDetails" },
            {
                $project: {
                    productName: "$productDetails.productName",
                    totalQuantity: 1
                }
            }
        ]);

        // Top categories
        const topCategories = await Order.aggregate([
            { $unwind: "$orderedItems" },
            { $match: { status: "delivered" } },
            {
                $lookup: {
                    from: "products",
                    localField: "orderedItems.product",
                    foreignField: "_id",
                    as: "productDetails"
                }
            },
            { $unwind: "$productDetails" },
            {
                $group: {
                    _id: "$productDetails.category",
                    totalQuantity: { $sum: "$orderedItems.quantity" }
                }
            },
            { $sort: { totalQuantity: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: "categories",
                    localField: "_id",
                    foreignField: "_id",
                    as: "categoryDetails"
                }
            },
            { $unwind: "$categoryDetails" },
            {
                $project: {
                    categoryName: "$categoryDetails.categoryName",
                    totalQuantity: 1
                }
            }
        ]);

        res.render("dashboard", {
            filter,
            salesChartLabels: salesData.labels,
            salesChartData: salesData.data,
            topProducts,
            topCategories,
        });
    } catch (err) {
        console.error("Error loading dashboard:", err);
        res.status(500).render("admin-error", { message: "Failed to load dashboard" });
    }
};

const ledgerBook = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 8;
        const skip = (page - 1) * limit;

        // Fetch all relevant orders (filtered and sorted)
        const allOrders = await Order.find({
            status: { $in: ['delivered', 'cancelled', 'returned'] }
        })
            .populate('orderedItems.product')
            .sort({ createdOn: -1 });

        // Filter out COD cancelled orders
        const filteredOrders = allOrders.filter(order => {
            return !(order.paymentMethod === 'cod' && order.status === 'cancelled');
        });

        const totalRecords = filteredOrders.length;
        const totalPages = Math.ceil(totalRecords / limit);

        // Slice only required records for this page
        const paginatedOrders = filteredOrders.slice(skip, skip + limit);

        // Prepare ledger data
        const ledgerData = paginatedOrders.map(order => {
            let incomeAmount = 0;
            let refundAmount = 0;

            order.orderedItems.forEach(item => {
                const itemTotal = item.price * item.quantity;

                if (item.status === 'returned') {
                    refundAmount += itemTotal;
                } else {
                    incomeAmount += itemTotal;
                }
            });

            let amount = 0;
            if (order.status === 'cancelled') {
                amount = -order.finalAmount;
            } else {
                amount = incomeAmount;
            }

            return {
                orderId: order.orderId,
                createdOn: order.createdOn,
                paymentMethod: order.paymentMethod,
                status: order.status,
                finalAmount: order.finalAmount,
                incomeAmount,
                refundAmount: refundAmount ? -refundAmount : 0,
                amount
            };
        });

        res.render('ledgerBook', {
            ledgerData,
            currentPage: page,
            totalPages
        });

    } catch (err) {
        console.error('Ledger Book error:', err);
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: messages.ERROR.INTERNAL_SERVER_ERROR });
    }
};


const logout = (req, res) => {

    try {
        req.session.destroy((err) => {
            if (err) {
                return res.redirect('/admin/login')
            }
            return res.redirect('/admin/login')
        })
    } catch (error) {
        console.log('error occur while logout', error)
        return res.redirect('/admin/pageerror')
    }

}

module.exports = {
    loadLogin,
    adminLogin,
    loadDashboard,
    loadSalesPage,
    pageerror,
    logout,
    ledgerBook,
    getSalesChartData
}