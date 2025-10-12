const userModel = require("../models/userSchema");
const cartModel = require('../models/cartSchema');
const wishlistModel = require('../models/wishlistSchema');

const userAuth = (req, res, next) => {
   
    if (req.session.user) {
        userModel.findById(req.session.user)
            .then((data) => {
                if (data && !data.isBlocked) {
                    next()
                } else {
                    res.redirect('/login');
                }
            }).catch(error => {
                console.log('error in user auth middleware', error);
                res.status(500).send('Internal server error')
            })
    } else {
        res.redirect('/login')
    }
}

const adminAuth = (req, res, next) => {
    if (req.session.admin) {

        userModel.findById(req.session.admin)
            .then((admin) => {
                if (admin && admin.isAdmin) {
                    next()
                }else{
                    req.session.destroy();
                    res.redirect('/admin/login')
                }
            }).catch(error =>{
                console.error('Admin Auth Error',error);
                res.redirect('/admin/login');
            })
    }else{
        res.redirect('/admin/login');
    }
}

const isUserBlocked = async (req,res, next)=>{

    try {
        if(req.session.user){
            const user = await userModel.findById(req.session.user)
     
            if(user && user.isBlocked){
                 delete req.session.user;
                 return res.redirect('/login');
            }
         }
     
         next();
    } catch (error) {
        console.error("Error checking blocked user:", error);
        res.status(500).send('Server Error');
    }
}

const isUserLoggedIn = async(req, res, next)=>{

    if(req.session.user){
        return res.redirect('/')
    }else{
        next()
    }
}

const ajaxAuth = (req, res, next) => {
    if (req.session.user) {
      userModel.findById(req.session.user)
        .then((user) => {
          if (user && !user.isBlocked) {
            next();
          } else {
            delete req.session.user;
            res.status(401).json({ 
              status: false, 
              message: "User is blocked or not found" 
            });
          }
        })
        .catch((error) => {
          console.log("Ajax Auth Error", error);
          res.status(500).json({ 
            status: false, 
            message: "Internal server error" 
          });
        });
    } else {
      res.json({ 
        success: false, 
        message: "User not logged in" 
      });
    }
  };

const setUserCounts = async (req, res, next) => {
  try {
    if (req.session.user) {
      const userId = req.session.user;

      const cart = await cartModel.findOne({ userId });
      const wishlist = await wishlistModel.findOne({ userId });

      res.locals.cartCount = cart ? cart.cartItems.length : 0;
      res.locals.wishlistCount = wishlist ? wishlist.product.length : 0;
    } else {
      res.locals.cartCount = 0;
      res.locals.wishlistCount = 0;
    }

    next();
  } catch (err) {
    console.error("Error setting user counts:", err);
    res.locals.cartCount = 0;
    res.locals.wishlistCount = 0;
    next();
  }
};


module.exports = { 
    userAuth, 
    adminAuth, 
    isUserBlocked,
    isUserLoggedIn,
    ajaxAuth,
    setUserCounts
};