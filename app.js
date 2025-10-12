const express = require('express')
const app = express()
const session = require('express-session')
const passport = require('./config/passport')
const dotenv = require('dotenv')
dotenv.config()
const path = require('path')
const connectDB = require('./config/connectDB')
const { setUserCounts } = require('./middleware/auth'); // ✅ Add this line above routes



const userRouter = require('./routes/userRouter')
const adminRouter = require('./routes/adminRouter')


app.use(express.json())
app.use(express.urlencoded({extended:true}))
app.use(session({
    secret:process.env.SESSION_SECRET,
    saveUninitialized:true,
    resave:false,
    cookie:{
        secure:false,
        httpOnly:true,
        maxAge:72*60*60*1000
    }
}))

// 🔽 Add this line before using userRouter
app.use(setUserCounts);
app.use(passport.initialize());
app.use(passport.session())

app.use((req,res,next) => {
    res.set('Cache-Control','no-store')
    next();
})

app.set('view engine','ejs');
app.set('views',[path.join(__dirname,'views/user'),path.join(__dirname,'views/admin')]);
app.use(express.static(path.join(__dirname,'public')))


app.use('/',userRouter);
app.use('/admin',adminRouter);


connectDB();

const PORT = 5000 || process.env.PORT
app.listen(PORT,()=>{
    console.log('server is running');
})