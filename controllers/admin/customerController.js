const userModel = require("../../models/userSchema");



const displayCustomer = async (req, res) => {

    let search = '';

    if (req.query.search) {
        search = req.query.search;
    }
    let page = 1
    if (req.query.page) {
        page = req.query.page
    }

    const limit = 5;

    const users = await userModel.find(
        {
            isAdmin: false,
            $or: [
                { name: { $regex: '.*' + search + '.*' } },
                { email: { $regex: '.*' + search + '.*' } }
            ]
        }
    ).sort({ createdAt: -1 }).limit(limit * 1).skip((page - 1) * limit).exec();

    const count = await userModel.find({
        isAdmin: false,
        $or: [
            { name: { $regex: ".*" + search + ".*" } },
            { email: { $regex: ".*" + search + ".*" } },
        ]
    }).countDocuments();


    return res.render('customers', {
        data: users,
        totalPages: Math.ceil(count / limit),
        currentPage: page
    })
}

const blockCustomer = async (req, res) => {
    try {
        const userid = req.query.id;

        blockUser = await userModel.updateOne({ _id: userid }, { $set: { isBlocked: true } })

        return res.redirect('/admin/users')
    } catch (error) {
        res.redirect('/pageerror')
    }
}

const unblockCustomer = async (req, res) => {

    try {
        const userid = req.query.id;

        unblockUser = await userModel.updateOne({ _id: userid }, { $set: { isBlocked: false } });

        return res.redirect('/admin/users');
    } catch (error) {
        return res.redirect('/pageerror')
    }
}

module.exports = {
    displayCustomer,
    blockCustomer,
    unblockCustomer
}