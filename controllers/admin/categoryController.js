const categoryModel = require("../../models/categorySchema")
const fs = require('fs');
const path = require("path");
const sharp = require('sharp');
const HttpStatus = require("../../constants/httpStatus");
const messages = require("../../constants/messages");


const categoryInfo = async (req, res) => {

    try {

        const query = {}

        const search = req.query.search || '';

        if(req.query.search){
            query.categoryName = {$regex: new RegExp('.*' + search + '.*', 'i')}
        }


        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const categoryData = await categoryModel.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);  

        const totalCategories = await categoryModel.countDocuments();

        const totalPages = Math.ceil(totalCategories / limit);


        res.render('category', {
            categories: categoryData,
            currentPage: page,
            totalPages: totalPages,
            totalCategories: totalCategories
        })
    } catch (error) {
        console.error(error);
        res.redirect('/pageerror');
    }
}

const addCategory = async (req, res) => {
 
    try {

        const { categoryName, offer } = req.body;

        const existsCategory = await categoryModel.findOne({
            categoryName: { $regex: new RegExp(`^${categoryName}$`, 'i') }
          });
          
    
        if(existsCategory){
            return res.status(HttpStatus.BAD_REQUEST).json({
                success:false,
                message:messages
            })
        }
    

        const originalImagePath = req.file.path;
    
        const resizeImagePath = path.join('public', 'uploads', 'category', req.file.filename);
        await sharp(originalImagePath).resize({ width: 440, height: 440 }).toFile(resizeImagePath);
    
        const imagePath = path.join('/','uploads', 'category', req.file.filename)
    
        const newCategory = new categoryModel({
            categoryName:categoryName,
            categoryImage:imagePath,
            categoryOffer: offer
        })
    
        await newCategory.save();

        return res.status(HttpStatus.OK).json({ success: messages.SUCCESS.CATEGORY_ADDED});

    
        // return res.redirect('/admin/category');

    } catch (error) {
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: messages.ERROR.INTERNAL_SERVER_ERROR })
    }

}

const editCategory = async (req,res)=>{

    try {

        const categoryId = req.params.id;

        const {categoryName, offer} = req.body

        const existingCategory = await categoryModel.findOne({
            _id: { $ne: categoryId },
            categoryName: categoryName
          });
          
          if (existingCategory) {
            return res.status(HttpStatus.BAD_REQUEST).json({
              success: false,
              message: messages.ERROR.CATEGORY_ERROR_NOT_ALLWED
            });
          }

        if(req.file){
            const originalImagePath = req.file.path;
        
            const resizeImagePath = path.join('public', 'uploads', 'category', req.file.filename);
            await sharp(originalImagePath).resize({ width: 440, height: 440 }).toFile(resizeImagePath);
        
            const imagePath = path.join('/','uploads', 'category', req.file.filename)

            const updateData = {
                categoryName:categoryName,
                categoryImage:imagePath,
                categoryOffer: offer
            }

            await categoryModel.updateOne({_id:categoryId},{$set:updateData})
        }else{
            
            await categoryModel.updateOne({_id:categoryId},{categoryName:categoryName, categoryOffer:offer});
        }

        return res.status(HttpStatus.OK).json({ success:true, message:messages.SUCCESS.CATEGORY_UPDATED });

    } catch (error) {
        console.log('edit category error')
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: messages.ERROR.INTERNAL_SERVER_ERROR })
    }
}

const deleteCategory = async (req,res)=>{
    
    try {
        const categoryId = req.params.id

        await categoryModel.deleteOne({_id:categoryId});

        res.status(HttpStatus.OK).json({success:messages.SUCCESS.CATEGORY_DELETED})

    } catch (error) {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({error:messages.INTERNAL_SERVER_ERROR})
    }
}

const listOrUnlistCategory = async (req,res)=>{
    try {
        const categoryId = req.params.id;

        const category = await categoryModel.findById(categoryId);

        if(!category) return res.status(HttpStatus.NOT_FOUND).json({error:messages.ERROR.CATEGORY_NOT_FOUND});

        category.isListed = !category.isListed;

        await category.save();

        res.json({ success: `Category has been ${category.isListed ? 'listed' : 'unlisted'}` });
    } catch (error) {
        console.error('category list or unlist error')
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: messages.ERROR.INTERNAL_SERVER_ERROR })
    }
}

module.exports = {
    categoryInfo,
    addCategory,
    editCategory,
    deleteCategory,
    listOrUnlistCategory
}