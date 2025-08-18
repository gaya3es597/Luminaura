const express = require('express');
const app =express();
const path = require("path")
const env = require('dotenv').config();
const db = require("./config/db");
const userRouter = require("./routes/userRouter");
db();

//middlewares

app.use(express.json()); //to parse data from body
app.use(express.urlencoded({extended:true})) //to retrieve data from the url query

// add View engine
app.set("view engine","ejs");
app.set("views",[path.join(__dirname,"/views/user"),path.join(__dirname,"/views/admin")]);
app.use(express.static(path.join(__dirname,"public")));


//routes

app.use('/',userRouter);



app.listen(process.env.PORT, ()=>{
    console.log("Server 5000 is running");
});
module.exports=app;
