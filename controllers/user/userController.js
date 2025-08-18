
const pageNotFound = async(req,res)=>{
    try {
        return res.render('page-404');
        
    } catch (error) {
        redirect('/pageNotFound')
    }
}


const loadHomepage = async(req,res)=>{
    try {

        return res.render("home")
        
    } catch (error) {
        console.log("error loading home page"); //to display error in backend
        res.status(500).send("Server error"); //to send the message to the front end
    }
}
module.exports = {
    pageNotFound,
    loadHomepage
}