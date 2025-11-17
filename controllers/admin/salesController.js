const Order = require('../../models/orderSchema'); // Adjust path as needed
const PDFDocument = require('pdfkit');
const productModel = require('../../models/productSchema');
const categoryModel = require("../../models/categorySchema")
const ExcelJS = require('exceljs');


const loadSalesPage = async (req, res) => {
  try {
    const { reportType, startDate, endDate, format } = req.query;
    const now = new Date();
    let query = { status: 'delivered' };

    // Apply filters
    switch (reportType) {
      case 'daily':
        query.createdOn = {
          $gte: new Date(now.setHours(0, 0, 0, 0)),
          $lt: new Date(now.setHours(23, 59, 59, 999))
        };
        break;

      case 'weekly':
        const weekAgo = new Date();
        weekAgo.setDate(now.getDate() - 7);
        query.createdOn = { $gte: weekAgo, $lt: new Date() };
        break;

      case 'monthly':
        query.createdOn = {
          $gte: new Date(now.getFullYear(), now.getMonth(), 1),
          $lt: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
        };
        break;

      case 'custom':
        if (startDate && endDate) {
          query.createdOn = {
            $gte: new Date(startDate),
            $lt: new Date(new Date(endDate).setHours(23, 59, 59, 999))
          };
        }
        break;
    }

    const orders = await Order.find(query)
      .populate('orderedItems.product')
      .sort({ createdOn: 1 });

    // Build sales data
    let totalRegularPrice = 0;
    let totalFinalAmount = 0;

    const sales = orders.map(order => {
      const validItems = order.orderedItems.filter(i => i.status !== 'returned');

      const orderRegularPrice = validItems.reduce((sum, item) => sum + (item.regularPrice * item.quantity), 0);
      const orderAmount = validItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const couponDiscount = order.couponApplied ? (order.totalOrderPrice - order.finalAmount) : 0;
      const finalAmount = orderAmount - couponDiscount;
      const actualDiscount = orderRegularPrice - finalAmount;

      totalRegularPrice += orderRegularPrice;
      totalFinalAmount += finalAmount;

      return {
        orderId: order.orderId,
        date: order.createdOn,
        paymentMethod: order.paymentMethod,
        amount: finalAmount,
        lessPrice: actualDiscount,
        discount: order.discount || 0,
        coupon: couponDiscount,
        items: validItems.map(i => ({
          name: i.product ? i.product.productName : 'N/A',
          quantity: i.quantity,
          price: i.price,
          regularPrice: i.regularPrice
        }))
      };
    });

    const salesData = {
      sales,
      totalSales: totalFinalAmount,
      orderCount: sales.length,
      discounts: sales.reduce((sum, s) => sum + s.discount, 0),
      coupons: sales.reduce((sum, s) => sum + s.coupon, 0),
      lessPrices: totalRegularPrice - totalFinalAmount
    };

    // Export options
    if (format === 'pdf') return generatePDF(res, salesData);
    if (format === 'excel') return generateExcel(res, salesData);

    // Render EJS
    res.render('sales-report', {
      selectedReportType: reportType || 'daily',
      startDate,
      endDate,
      salesData
    });

  } catch (err) {
    console.error('Error loading sales page:', err);
    res.status(500).render('admin-error', { message: 'Failed to load sales report' });
  }
};

const generatePDF = async (res, salesData) => {
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ margin: 40, size: "A4", layout: "portrait" });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=sales-report.pdf");
  doc.pipe(res);

  const formatCurrency = (num) =>
    `₹${Number(num).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

  // ===== Header =====
  doc.font("Helvetica-Bold").fontSize(24).fillColor("#27AE60").text("Luminaura Sales Report", { align: "center" });
  doc.moveDown(1);

  // ===== Summary =====
  doc.fontSize(13).fillColor("black").text(`Total Sales: ${formatCurrency(salesData.totalSales)}`);
  doc.text(`Total Orders: ${salesData.orderCount}`);
  doc.text(`Discounts: ${formatCurrency(salesData.lessPrices)}`);
  doc.text(`Coupons: ${formatCurrency(salesData.coupons)}`);
  doc.moveDown(1.5);

  // ===== Table Header =====
  const tableTop = doc.y;
  const colWidths = [80, 120, 80, 80, 80, 90];
  const headers = ["Date", "Order ID", "Amount", "Discount", "Coupon", "Payment"];

  doc.font("Helvetica-Bold").fontSize(11).fillColor("#000000");
  let x = 40;
  headers.forEach((header, i) => {
    doc.text(header, x, tableTop, { width: colWidths[i], align: "center" });
    x += colWidths[i];
  });

  // Divider line
  doc.moveTo(40, tableTop + 15).lineTo(550, tableTop + 15).strokeColor("#888").stroke();
  let y = tableTop + 25;

  // ===== Table Rows =====
  doc.font("Helvetica").fontSize(10).fillColor("#000");
  salesData.sales.forEach((sale) => {
    const row = [
      new Date(sale.date).toLocaleDateString("en-IN"),
      sale.orderId,
      formatCurrency(sale.amount),
      formatCurrency(sale.lessPrice),
      formatCurrency(sale.coupon),
      sale.paymentMethod
    ];

    x = 40;
    row.forEach((text, i) => {
      doc.text(text, x, y, { width: colWidths[i], align: "center" });
      x += colWidths[i];
    });

    y += 20;
    if (y > 750) {
      doc.addPage();
      y = 50;
    }
  });

  // ===== Footer =====
  doc.moveDown(2);
  doc.fontSize(10).fillColor("gray").text(`Generated on: ${new Date().toLocaleString("en-IN")}`, 40, 780);

  doc.end();
};


// =================== EXCEL EXPORT ===================
const generateExcel = async (res, salesData) => {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Sales Report');

  ws.columns = [
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Order ID', key: 'orderId', width: 25 },
    { header: 'Payment', key: 'payment', width: 15 },
    { header: 'Item', key: 'item', width: 25 },
    { header: 'Qty', key: 'qty', width: 10 },
    { header: 'Price', key: 'price', width: 15 },
    { header: 'Total', key: 'total', width: 15 }
  ];

  // Rows per item
  salesData.sales.forEach(sale => {
    sale.items.forEach(item => {
      ws.addRow({
        date: new Date(sale.date).toLocaleDateString(),
        orderId: sale.orderId,
        payment: sale.paymentMethod,
        item: item.name,
        qty: item.quantity,
        price: item.price,
        total: item.price * item.quantity
      });
    });
  });

  // Summary row
  ws.addRow([]);
  ws.addRow(["", "", "", "Total Sales", "", "", salesData.totalSales]);

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", "attachment; filename=sales-report.xlsx");

  await workbook.xlsx.write(res);
};


module.exports = {
  loadSalesPage,
};