const express = require('express')
const userController = require('../controllers/user/userController')
const productController = require('../controllers/user/productController')
const profileController = require('../controllers/user/profileController')
const addressController = require('../controllers/user/addressController')
const cartController = require('../controllers/user/cartController')
const checkoutController = require('../controllers/user/checkoutController')
const orderController = require('../controllers/user/orderController')
const wishlistController = require('../controllers/user/wishlistController')
const walletController = require('../controllers/user/walletController')
const couponsController = require('../controllers/user/couponsController')
const passport = require('passport')
const { userAuth, isUserBlocked, isUserLoggedIn, ajaxAuth } = require('../middleware/auth')
const { forgotPassLogout } = require('../middleware/profileAuth')
const router = express.Router()
const multer = require("multer");
const path = require("path");



// Multer setup for profile image upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, "public/uploads/profileImages/");
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const filename = `${req.session.user}_${Date.now()}${ext}`;
      cb(null, filename);
    },
  });
  
  const upload = multer({ storage });


//Return Image
const storageReturnImage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, "public/uploads/returnImages/");
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const filename = `${req.session.user}_${Date.now()}${ext}`;
      cb(null, filename);
    },
  });
  
  const uploadReturnImage = multer({ storage:storageReturnImage });



router.get('/pageNotFound',userController.pageNotFound)
router.get('/login',isUserLoggedIn,userController.loadLogin);
router.get('/signup',isUserLoggedIn,userController.loadSignup);
router.post('/signup',userController.userSignUp);
router.post('/verify-otp',userController.verifyOtp);
router.post('/resend-otp',userController.resendOtp);
router.get('/forgot-password',isUserLoggedIn,userController.loadForgotPassword);
router.post('/forgot-password-email',userController.forgotPassEmailVerify);
router.post('/forgotPass-otp-verify',userController.forgotPassOtpVerify);
router.get('/change-password',isUserLoggedIn,userController.changePassword);
router.post('/forgotPass-resend-otp',userController.forgotPassResendOtp);
router.post('/new-password',userController.newPassword);

router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'],prompt: 'select_account' }));

router.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/signup' }), (req, res) => {
  
    try {
        req.session.user = req.user._id
        res.redirect('/');
    } catch (error) {
        console.log("Google login error:", error);
        res.redirect('/signup');
    }
    
});

router.post('/login',userController.userLogin);
router.get('/logout',userController.logOut);

router.get('/',isUserBlocked,userController.loadHome)
router.get('/productDetails/:id',isUserBlocked,productController.productDetails)
router.get('/allProducts',isUserBlocked,productController.allProducts)



// Profile Management
router.get('/userProfile',userAuth,profileController.userProfile)
router.post('/update-profile',userAuth,upload.single("profileImage"),profileController.updateProfile);
router.get('/change-email',userAuth,profileController.changeEmail);
router.post('/change-email',userAuth,profileController.changeEmailValid);
router.post('/verify-email-otp',userAuth,profileController.verifyEmailOtp);
router.post('/resend-email-otp',userAuth,profileController.resendEmailOtp);
router.post('/change-password',userAuth,profileController.changePassword);
router.get('/forgot-password-logout',forgotPassLogout,profileController.getForgotPassPage);


//Address Management
router.get('/userAddress',userAuth,addressController.loadAddressPage)
router.post('/addAddress',userAuth,addressController.addAddress)
router.post('/editAddress',userAuth,addressController.editAddress)
router.post('/address-delete/:id',userAuth,addressController.deleteAddress)

//Cart Management
router.get('/cart',userAuth,cartController.getCartPage)
router.post('/addToCart',ajaxAuth,cartController.addToCart)
router.post('/changeQuantity',userAuth,cartController.changeQuantity)
router.post('/deleteItem/:id',userAuth,cartController.deleteItem)

//Checkout
router.get('/checkout',userAuth,checkoutController.getCheckoutPage)
router.get('/check-stock',userAuth, checkoutController.checkStock);

//Order
router.post('/placeOrder',userAuth,orderController.placeOrder);
router.get('/placeOrder/retry/:orderId', userAuth,orderController.placeOrder);
router.get('/orders',userAuth,orderController.getOrders);
router.get('/order-details/:id',userAuth,orderController.orderDetails);


//routes for order cancellation and returns
router.post('/orders/cancel',userAuth,orderController.cancelOrder)
router.post('/orders/return',userAuth, uploadReturnImage.array('images', 3),orderController.retrunProduct)
router.post('/orders/cancel-return',userAuth,orderController.cancelReturnRequest)
router.get('/orders/invoice/:id',userAuth,orderController.generateInvoice)
//razorpay
router.post('/create-razorpay-order', userAuth, orderController.createRazorpayOrder);
router.post('/verify-payment', userAuth, orderController.verifyPayment);
router.post('/orders/save-failed-order', orderController.saveFailedOrder);


//Wishlist
router.get('/wishlist',userAuth,wishlistController.getWishlist);
router.post('/addToWishlist',ajaxAuth,wishlistController.addToWishlist)
router.get("/removeFromWishList",userAuth,wishlistController.removeProduct)
router.post('/wishlist/moveToCart', wishlistController.moveToCart);




//Coupons
router.get('/coupons',userAuth,couponsController.loadCoupon)
router.post('/apply-coupon',userAuth,couponsController.applyCoupon)



//Wallet
router.get('/wallet',userAuth,walletController.getWallet)
router.post('/wallet/create-razorpay-order',userAuth,walletController.createWalletRazorpayOrder)
router.post('/wallet/verify-payment',userAuth,walletController.verifyPayment)
router.post('/place-wallet-order',userAuth,walletController.placeWalletOrder)



module.exports = router