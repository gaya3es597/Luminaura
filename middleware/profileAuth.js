
function forgotPassLogout(req, res, next) {
    if (req.session.user) {
        
        delete req.session.user;

        return res.redirect("/forgot-password"); 
        
    } else {
        next(); 
    }
}

module.exports ={
    forgotPassLogout
}