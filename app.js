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
app.use(passport.session());

app.use((req, res, next) => {
  res.locals.user = req.user || null;
  next();
});


app.use((req,res,next) => {
    res.set('Cache-Control','no-store')
    next();
})

app.set('view engine','ejs');
app.set('views',[path.join(__dirname,'views/user'),path.join(__dirname,'views/admin')]);
app.use(express.static(path.join(__dirname,'public')))


app.use('/',userRouter);
app.use('/admin',adminRouter);

// 404 Handler (Route not found)
app.use((req, res, next) => {
  res.status(404).render('page-404', {
    message: 'Page not found',
    currentPage: null
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack || err);

  res.status(err.status || 500);

  
  // render a custom error page
  res.render('page-404', {
    message: err.message || 'Something went wrong',
    status: err.status || 500,
    currentPage: null
  });
});

connectDB();

const PORT = 5000 || process.env.PORT
app.listen(PORT,()=>{
    console.log('server is running');
})