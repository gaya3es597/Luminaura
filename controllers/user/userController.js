const userModel = require("../../models/userSchema");
const categoryModel = require("../../models/categorySchema");
const productModel = require("../../models/productSchema");
const wishlistModel = require("../../models/wishlistSchema");
const couponModel = require("../../models/couponSchema");
const bcrypt = require('bcrypt')
const env = require('dotenv').config();
const nodemailer = require('nodemailer');
const HttpStatus = require('../../constants/httpStatus');
const messages = require('../../constants/messages');



const pageNotFound = async (req, res) => {
    try {
        return res.render('page-404')
    } catch (error) {
        return redirect('/pageNotFound');
    }
}

const loadLogin = (req, res) => {
    try {
        res.render('login');
    } catch (error) {
        console.log('login page not found');
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({message:messages.ERROR.INTERNAL_SERVER_ERROR})
    }
}

const loadHome = async (req, res) => {
    try {
        const userId = req.session.user;

        // Get all listed categories
        const categories = await categoryModel.find({ isListed: true });

        // Get products under listed categories
        const products = await productModel.find({
            isBlocked: false,
            category: { $in: categories.map(category => category._id) }
        }).populate("category");

        // Sort by newest
        products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Add wishlist status and effective discount
        const wishlistProductIds = [];
        if (userId) {
            const wishlist = await wishlistModel.findOne({ userId });
            if (wishlist) {
                wishlistProductIds.push(...wishlist.product.map(id => id.toString()));
            }
        }

        products.forEach(product => {
            // Mark if in wishlist
            product.inWishlist = wishlistProductIds.includes(product._id.toString());

            // Compare category offer with product discount
            const productDiscount = product.discount || 0;
            const categoryOffer = product.category?.categoryOffer || 0;
            product.effectiveDiscount = Math.max(productDiscount, categoryOffer);
        });


        const renderData = {
            categories,
            products,
        };

        if (userId) {
            renderData.user = await userModel.findById(userId);
        }

        return res.render("home", renderData);

    } catch (error) {
        console.log("Home page error:", error);
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({message:messages.ERROR.INTERNAL_SERVER_ERROR});
    }
};


const loadSignup = (req, res) => {
    try {
        res.render('signup');
    } catch (error) {
        console.log('signup page not found');
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({message:messages.ERROR.INTERNAL_SERVER_ERROR})
    }
}
const loadForgotPassword = (req, res) => {
    try {
        res.render('forgot-password');
    } catch (error) {
        console.log('forgot-password page not found');
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({message:messages.ERROR.INTERNAL_SERVER_ERROR});
    }
}

function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// async function sendVerificationEmail(email, otp) {
//     try {
//         const transporter = nodemailer.createTransport({
//             service: 'gmail',
//             port: 587,
//             secure: false,
//             requireTLS: true,
//             auth: {
//                 user: process.env.NODEMAILER_EMAIL,
//                 pass: process.env.NODEMAILER_PASSWORD
//             }
//         })

//         const info = await transporter.sendMail({
//             from: process.env.NODEMAILER_EMAIL,
//             to: email,
//             subject: "OTP for Verification",
//             text: `Your OTP is ${otp}`,
//             html: `<b>Your OTP is ${otp}</b>`
//         })

//         return info.accepted.length > 0;

//     } catch (error) {
//         console.error("Error for sending email", error)
//         return false
//     }
// }

async function sendVerificationEmail(email, otp, details = {}) {
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }
        })

        const info = await transporter.sendMail({
            from: `"Devu's App" <${process.env.NODEMAILER_EMAIL}>`,
            to: email,
            subject: details.subject || "OTP for Verification",
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <h2>${details.greeting || 'Hello!'}</h2>
                    <p>${details.instructions || 'Use the OTP below to verify your DreaMore account:'}</p>
                    <h1 style="color: #4CAF50;">${otp}</h1>
                    <p>${details.footer || 'Thank you for using our service!'}</p>
                    <hr/>
                    <small>This is an automated message. Please do not reply.</small>
                </div>
            `
        })

        return info.accepted.length > 0;
    } catch (error) {
        console.error("Error for sending email", error)
        return false
    }
}


const generateReferralCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase(); // e.g., "K8FH29"
};

const userSignUp = async (req, res) => {
    try {

        const { name, email, phone, password, confirmPassword, referralCode } = req.body;

        if (!name || !email || !phone || !password || !confirmPassword) {
            return res.render('signup', { message: messages.VALIDATION.REQUIRED_FIELDS })
        }

        const userExist = await userModel.findOne({ email });

        if (userExist) {
            return res.render('signup', { message: messages.ERROR.USER_ALREADY_REGISTERED});
        }

        if (password !== confirmPassword) {
            return res.render('signup', { message: messages.VALIDATION.PASSWORDS_DO_NOT_MATCH })
        }

        const otp = generateOtp();
        console.log("Sign Up OTP:", otp);

        const emailSend = await sendVerificationEmail(email, otp)
        if (!emailSend) {
            return res.json({message:messages.ERROR.EMAIL_SENDING_ERROR})
        }

        req.session.userOtp = otp;
        req.session.otpExpiresAt = Date.now() + 60 * 1000; // 60 seconds from now
        req.session.userData = { name, email, phone, password, referredBy: referralCode };

        res.render('verify-otp');

    } catch (error) {
        console.error('signup error', error)
        res.redirect('/pageNotFound')
    }
}
/**
 * 
 * @param {*} req 
 * @param {*} res 
 */
const verifyOtp = async (req, res) => {

    try {
        const { otp } = req.body

        if (
            req.session.userOtp === otp &&
            req.session.otpExpiresAt &&
            Date.now() <= req.session.otpExpiresAt
        ) {

            const user = req.session.userData

            const hashedPassword = await bcrypt.hash(user.password, 10)

            let referrer = null;
            if (user.referredBy) {
                referrer = await userModel.findOne({ referralCode: user.referredBy });
            }

            const userData = {
                name: user.name,
                email: user.email,
                phone: user.phone,
                password: hashedPassword,
                referralCode: generateReferralCode(),
                referredBy: user.referredBy && referrer ? user.referredBy : null
            }

            const newUser = new userModel(userData)

            await newUser.save();

            if (referrer) {
                const coupon = new couponModel({
                    name: "REF" + Math.random().toString(36).substring(2, 8).toUpperCase(),
                    offerPrice: 25, // ₹100 or % discount
                    userId: referrer._id,
                    expireOn: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
                    isReferralCoupon: true
                });

                await coupon.save();
            }


            req.session.user = newUser._id;

            res.json({ success: true, redirectUrl: '/login' })
        } else {
            res.status(HttpStatus.BAD_REQUEST).json({
                success: false,
                message: messages.VALIDATION.INVALID_OTP
            })
        }
    } catch (error) {
        console.error('Error verifying OTP', error);
        res.status(HttpStatus.BAD_REQUEST).json({
            success: false,
            message: messages.ERROR.ERROR_OTP
        })
    }

}

const resendOtp = async (req, res) => {
    try {

        const { email } = req.session.userData;
        console.log(email)

        const resendOtp = generateOtp()
        console.log("Resend OTP:", resendOtp);

        const emailSend = await sendVerificationEmail(email, resendOtp, {
            subject: "Your OTP for Login Verification",
            greeting: "Hi there!",
            instructions: "Use the OTP below to verify your DreaMore login. This OTP is valid for 1 minute.",
            footer: "If you did not request this, please ignore this email."
        })

        req.session.userOtp = resendOtp
        req.session.otpExpiresAt = Date.now() + 60 * 1000; // 60 seconds validity again

        if (emailSend) {
           return res.status(HttpStatus.OK).json({
            success: true
            });

        } else {
            return res.status(HttpStatus.BAD_REQUEST).json({
                success: false,
                message: messages.VALIDATION.FAILED_RESEND
            })
        }

    } catch (error) {
        console.error('Error resending OTP', error);
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ success: false, message: messages.VALIDATION.FAILED_RESEND });
    }
}

//user login
const userLogin = async (req, res) => {
    try {
        const { email, password } = req.body


        const findUser = await userModel.findOne({ email });

        if (!findUser) {
            return res.render('login', { message: messages.VALIDATION.LOGIN_EXPIRED })
        }

        if (findUser.isBlocked) {
            return res.render('login', { message: messages.VALIDATION.BLOCKED_BY_ADMIN })
        }

        const checkPassword = await bcrypt.compare(password, findUser.password)

        if (!checkPassword) {
            return res.render('login', { messages: messages.ERROR.INVALID_CREDENTIALS })
        }

        const name = findUser.name;

        req.session.user = findUser._id;

        return res.redirect('/');
    } catch (error) {
        console.error('Login Error', error);
        res.render('login', { message:messages.VALIDATION.LOGIN_EXPIRED });
    }

}

const logOut = async (req, res) => {
    try {

        req.session.destroy((err) => {
            if (err) {
                console.log('Session destruction error', err.message);
                return res.redirect('/pageNotFound');
            }
            return res.redirect('/');
        })

    } catch (error) {
        console.log('logout error', error);
        res.redirect('/pageNotFound')
    }
}

const forgotPassEmailVerify = async (req, res) => {
    try {
        const { email } = req.body;

        const user = await userModel.findOne({ email });

        if (!user) {
            return res.status(HttpStatus.NOT_FOUND).json({
            success: false,
            message: messages.VALIDATION.USER_NOT_FOUND
        });

        }

        const otp = generateOtp();
        console.log("Forgot Password OTP:", otp);
        const emailSend = await sendVerificationEmail(user.email, otp)

        if (emailSend) {
            req.session.userOtp = otp;
            req.session.email = email;

            return res.render('forgotPass-otp');
        } else {
            return res.render('forgot-password', { message: messages.VALIDATION.USER_NOT_EXISTS });
        }


    } catch (error) {
        console.log('forgot email verify error', error);
        return res.redirect('/pageNotFound')
    }
}

const forgotPassOtpVerify = async (req, res) => {
    try {
        const { otp } = req.body;

        if (req.session.userOtp === otp) {
            return res.json({
                success: true,
                redirectUrl: '/change-password'
            })
        } else {
            return res.json({
                success: false,
            })
        }
    } catch (error) {
        console.log('forgot password otp verify error', error);
        return res.redirect('/pageNotFound')
    }
}

const changePassword = async (req, res) => {
    try {

        res.render("change-password");

    } catch (error) {

        res.redirect("/pageNotFound")

    }
}

const forgotPassResendOtp = async (req, res) => {

    try {
        const otp = generateOtp();
        const email = req.session.email;

        const sendEmail = await sendVerificationEmail(email, otp);

        if (sendEmail) {
            req.session.userOtp = otp;
            return res.status(HttpStatus.OK).json({
                success: true,
                message: messages.SUCCESS.RESEND_OTP
            })
        }
    } catch (error) {
        console.error('error in forgot password resend otp', error);
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: messages.ERROR.INTERNAL_SERVER_ERROR
        })
    }

}

const newPassword = async (req, res) => {
    try {
        const { newPassword, confirmPassword } = req.body;

        if (newPassword !== confirmPassword) {
           return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: messages.VALIDATION.PASSWORDS_DO_NOT_MATCH })
        }

        const email = req.session.email;

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        const updateNewPassword = await userModel.updateOne({ email }, { $set: { password: hashedPassword } });

        if (updateNewPassword) {
            return res.status(HttpStatus.OK).json({
                success: true,
                message: messages.SUCCESS.PASSWORD_UPDATED
            })
        }

    } catch (error) {
        console.error("Error in newPassword:", error);
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: messages.ERROR.INTERNAL_SERVER_ERROR

    })
}
}

module.exports = {
    loadHome,
    pageNotFound,
    loadLogin,
    loadSignup,
    loadForgotPassword,
    userSignUp,
    verifyOtp,
    resendOtp,
    userLogin,
    logOut,
    forgotPassEmailVerify,
    forgotPassOtpVerify,
    changePassword,
    forgotPassResendOtp,
    newPassword
}