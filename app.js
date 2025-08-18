const express = require('express');
const app =express();
const env = require('dotenv').config();
const db = require("./config/db")


app.listen(process.env.PORT, ()=>{
    console.log("Server 5000 is running");
});
module.exports=app;
