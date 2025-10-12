const categoryModel = require("../../models/categorySchema");
const brandModel = require("../../models/brandSchema");
const productModel = require("../../models/productSchema");
const userModel = require("../../models/userSchema");
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const HttpStatus = require("../../constants/httpStatus");
const messages = require("../../constants/messages");





const getProductAddPage = async (req, res) => {
    try {

        const categories = await categoryModel.find({ isListed: true });
        const brands = await brandModel.find({});

        res.render('addProduct', {
            categories,
            brands
        });
    } catch (error) {
        return res.redirect('/pageerror');
    }
}

const addProducts = async (req, res) => {
    try {

        const products = req.body;

        const productExists = await productModel.findOne({
            productName: products.productName
        });

        if (!productExists) {

            const imageFilenames = [];

for (let i = 0; i < req.files.length; i++) {
    
  const originalImagePath = req.files[i].path;
  const originalName = req.files[i].originalname;
  const timestamp = Date.now();
  const uniqueName = `resized_${timestamp}_${i}_${originalName}`;
  
  const resizedImagePath = path.join('public', 'uploads', 'products', uniqueName);

  // Resize and save
  await sharp(originalImagePath)
    .resize({ width: 440, height: 440 })
    .toFile(resizedImagePath);

  // Delete original multer upload
  await fsPromises.unlink(originalImagePath);

  // Save path to DB (public-facing path)
  imageFilenames.push(`/uploads/products/${uniqueName}`);
}


            const categoryId = await categoryModel.findOne({ categoryName: products.category });
            // const brandId = await brandModel.findOne({name:products.brand})

            if (!categoryId) {
                return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: messages.ERROR.CATEGORY_NOT_FOUND });
            }

            const newProduct = new productModel({
                productName: products.productName,
                description: products.description,
                category: categoryId._id,
                discount: products.discount,
                price: products.price,
                stock: products.stock,
                productQuantity: products.quantity,
                unit:products.unit,
                productImage: imageFilenames,
                status: 'available'
            })

            await newProduct.save();

            return res.status(HttpStatus.OK).json({ success: true, message: messages.SUCCESS.PRODUCT_ADDED });
        } else {
            return res.status(HttpStatus.BAD_REQUEST).json({ success: false, message: messages.ERROR.PRODUCT_ALREADY_EXIST })
        }


    } catch (error) {
        console.error('error saving product', error);
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ success: false, message:messages.ERROR.INTERNAL_SERVER_ERROR });
    }
}

const displayProducts = async (req, res) => {
    try {

        const search = req.query.search || '';

        const page = req.query.page || 1;
        const limit = 4;

        const productData = await productModel.find(
            {
                productName: { $regex: new RegExp('.*' + search + '.*', 'i') }
            }
        ).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit * 1).populate('category').exec();

        const categories = await categoryModel.find({isListed:true});
        const brands = await brandModel.find({});

        const count = await productModel.find(
            {
                productName: { $regex: new RegExp('.*' + search + '.*', 'i') }
            }
        ).countDocuments();

        const category = await categoryModel.find({ isListed: true });
        // const brand = await brandModel.find({ isBlocked: false })

        if (category) {
            res.render('product', {
                products: productData,
                currentPage: page,
                totalPages: Math.ceil(count / limit),
                categories,
                brands

            })
        }

    } catch (error) {
        console.error("Error displaying products:", error);
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).render('errorPage', { message: messages.ERROR.INTERNAL_SERVER_ERROR });

    }
}

const editProduct = async (req, res) => {
    try {
        const productId = req.params.id;

        const {
            productName,
            price,
            stock,
            discount,
            brandId,
            quantity,
            unit,
            description,
            categoryId,
            existingImages // This is a JSON string
        } = req.body;

        // Parse existingImages string to array
        let existingImagesArray = [];
        try {
            existingImagesArray = JSON.parse(existingImages);
        } catch (err) {
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                message: messages.ERROR.INVALID_IMAGE_FORMAT
            });
        }

        // New images (uploaded files)
        // const newImages = req.files?.map(file => `/uploads/${file.filename}`) || [];

        const newImages = [];
        if(req.files){

            for (let i = 0; i < req.files.length; i++) {

                const newImagePath = req.files[i].path;
    
                const resizedImagePath = path.join('public', 'uploads', 'products', req.files[i].filename);
                await sharp(newImagePath).resize({ width: 440, height: 440 }).toFile(resizedImagePath);
    
                const imagePath = path.join('/', 'uploads', 'products', req.files[i].filename);
    
                newImages.push(imagePath);
            }
        }
        

        // Combine existing + new
        const allImages = [...existingImagesArray, ...newImages];

        const existingProduct = await productModel.findOne({
            _id: { $ne: productId },
            productName: productName
        });

        if (existingProduct) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                success: false,
                message: messages.ERROR.PRODUCT_ALREADY_EXIST
            });
        }

        const product = await productModel.findOne({ _id: productId });

        if (
            product.productName == productName &&
            product.price == price &&
            product.stock == stock &&
            product.discount == discount &&
            product.brand == brandId &&
            product.productQuantity == quantity &&
            product.unit == unit &&
            product.description == description &&
            product.category.toString() == categoryId &&
            JSON.stringify(product.productImage) == JSON.stringify(allImages)
        ) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                success: false,
                message: messages.ERROR.UPDATE_ATLEAST_ONE_FIELD
            });
        }

        const updatedProduct = await productModel.findByIdAndUpdate(
            productId,
            {
                productName,
                price,
                stock,
                discount,
                brand:brandId,
                description,
                productQuantity:quantity,
                unit,
                category:categoryId,
                productImage: allImages
            },
            { new: true }
        );

        if (!updatedProduct) {
            return res.status(HttpStatus.NOT_FOUND).json({
                success: false,
                message: messages.ERROR.PRODUCT_NOT_FOUND
            });
        }

        return res.status(HttpStatus.OK).json({
            success: true,
            message: messages.SUCCESS.PRODUCT_UPDATED,
            product: updatedProduct
        });

    } catch (error) {
        console.error("Error updating product:", error);
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: messages.ERROR.INTERNAL_SERVER_ERROR
        });
    }
};

const deleteProduct = async (req, res) => {
  try {
    const productId = req.params.id;

    const product = await productModel.findById(productId);
    if (!product) {
      return res.status(HttpStatus.NOT_FOUND).json({ success: false, message: messages.ERROR.PRODUCT_NOT_FOUND });
    }

    // Delete all images (if any)
    if (Array.isArray(product.productImage) && product.productImage.length > 0) {
  const deletePromises = product.productImage.map(async (imagePath) => {
    // imagePath is something like "/uploads/products/xyz.jpg"
    const filename = path.basename(imagePath); // get just "xyz.jpg"
    const fullImagePath = path.join(__dirname, '..', '..', 'public', 'uploads', 'products', filename);

    try {
      await fsPromises.access(fullImagePath);
      await fsPromises.unlink(fullImagePath);
      console.log(`✅ Deleted image: ${filename}`);
    } catch (err) {
      console.warn(`⚠️ Could not delete image "${filename}":`, err.message);
    }
  });

  await Promise.all(deletePromises);
}

console.log("Images to delete:", product.productImage);
    // Now delete the product
    await productModel.findByIdAndDelete(productId);

    return res.json({
      success: true,
      message: messages.SUCCESS.PRODUCT_DELETED,
    });

  } catch (error) {
    console.error('❌ Error deleting product:', error);
    return res.status(HttpStatus.BAD_REQUEST).json({
      success: false,
      message: messages.ERROR.PRODUCT_DELETE_ERROR
    });
  }
};


const isBlockedProduct = async (req, res) => {
    try {
        const productId = req.params.id;

        const product = await productModel.findById(productId);

        if (!product) return res.status(HttpStatus.NOT_FOUND).json({ error: messages.ERROR.PRODUCT_NOT_FOUND});

        product.isBlocked = !product.isBlocked;

        await product.save();

        res.json({ success: `Product has been ${product.isBlocked ? 'Blocked' : 'Available'}` });

    } catch (error) {
        console.error('product block or unblock error')
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: messages.ERROR.INTERNAL_SERVER_ERROR })
    }
}

module.exports = {
    getProductAddPage,
    addProducts,
    displayProducts,
    editProduct,
    deleteProduct,
    isBlockedProduct
}