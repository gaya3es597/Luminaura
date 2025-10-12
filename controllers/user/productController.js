const categoryModel = require('../../models/categorySchema');
const productModel = require('../../models/productSchema');
const userModel = require('../../models/userSchema');
const brandModel = require('../../models/brandSchema');
const wishlistModel = require('../../models/wishlistSchema');
const HttpStatus = require('../../constants/httpStatus');
const messages = require('../../constants/messages');


const productDetails = async (req, res) => {
    try {

        const userId = req.session.user;
        const productId = req.params.id;

        const product = await productModel.findOne({ _id: productId }).populate('category');


        if (!product) {
            return res.redirect("/pageNotFound");
        }

        if(product.isBlocked){
            return res.redirect('/allProducts');
        }

        // 🟡 Calculate effectiveDiscount
        const productDiscount = Number(product.discount) || 0;
        const categoryOffer = Number(product.category?.categoryOffer) || 0;
        product.effectiveDiscount = Math.max(productDiscount, categoryOffer);

        // 🔵 Fetch and process recommended products
        let recommendedProducts = await productModel.find({
          category: product.category._id,
          _id: { $ne: product._id }
        }).populate('category').limit(4).lean();

        recommendedProducts.forEach(prod => {
            const prodDiscount = Number(prod.discount) || 0;
            const catOffer = Number(prod.category?.categoryOffer) || 0;
            prod.effectiveDiscount = Math.max(prodDiscount, catOffer);
        });


        const userData = userId ? await userModel.findById(userId) : null;

        let inWishlist = false;
        if (userId) {
          const wishlist = await wishlistModel.findOne({ userId });
          if (wishlist && wishlist.product.includes(product._id)) {
            inWishlist = true;
          }
        }
    
        // Inject this flag into product object
        product.inWishlist = inWishlist;

        return res.render('product-details', {
            product,
            recommendedProducts,
            user: userData
        });

    } catch (error) {
        console.error("Error for fetching product details", error)
        res.redirect("/pageNotFound")
    }
}

  
const filterProduct = async (req, res) => {
    try {

        const user = req.session.user;
        const category = req.query.category;
        const brand = req.query.brand;
        const findCategory = category ? await categoryModel.findOne({ _id: category}) : null;
        const findBrand = brand ? await brandModel.findOne({ _id: brand }) : null;

        const selectCategoryName = findCategory ? findCategory.categoryName : '';

        const query = {
            isBlocked: false
        }

        if (findCategory) {
            query.category = findCategory._id;
        }

        if (findBrand) {
            query.brand = findBrand.brandName;
        }

        let findProducts = await productModel.find(query).lean();

         // Fetch only listed categories
         const listedCategories = await categoryModel.find({ isListed: true });

         // Filter out products whose category is not listed
         const listedCategoryIds = listedCategories.map(cat => cat._id.toString());

         findProducts = findProducts.filter(prod => listedCategoryIds.includes(prod.category.toString()));

         if (user) {
          const wishlist = await wishlistModel.findOne({ userId: user });
          const wishlistProductIds = wishlist ? wishlist.product.map(id => id.toString()) : [];
        
          findProducts.forEach(product => {
            product.inWishlist = wishlistProductIds.includes(product._id.toString());
          });
        } else {
          findProducts.forEach(product => {
            product.inWishlist = false;
          });
        }
        
        for (const product of findProducts) {
          const productDiscount = Number(product.discount) || 0;
        
          const categoryDoc = await categoryModel.findById(product.category);
          const categoryOffer = Number(categoryDoc?.categoryOffer) || 0;
        
          product.effectiveDiscount = Math.max(productDiscount, categoryOffer);
        }
 
         // Sort by latest
         findProducts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        let limit = 8;
        let page = parseInt(req.query.page) || 1;
        let startIndex = (page - 1) * limit;
        let endIndex = startIndex + limit;
        let totalPages = Math.ceil(findProducts.length / limit);

        const currentProduct = findProducts.slice(startIndex, endIndex);

        let userData = null;
        if (user) {
            userData = await userModel.findOne({ _id: user });
            if (userData) {
                const searchEntry = {
                    category: findCategory ? findCategory._id : null,
                    brand: findBrand ? findBrand.brandName : null,
                    searchedOn: new Date(),
                }
                userData.searchHistory.push(searchEntry);
                await userData.save();
            }
        }

        req.session.filteredProducts = currentProduct;

        if (user) {
            return res.render('allProducts', {
                user: userData,
                products: currentProduct,
                categories:listedCategories,
                brands: ['Rajgiraattad', 'Pampers', 'Amul', 'Nestle', 'Parle', 'Britannia'],
                totalPages,
                currentPage: page,
                selectedCategory: category || null,
                selectedBrand: brand || null,
                selectCategoryName: selectCategoryName  || null
            })
        }else{
           return res.render('allProducts', {
                user: userData,
                products: currentProduct,
                categories:listedCategories,
                brands: ['Rajgiraattad', 'Pampers', 'Amul', 'Nestle', 'Parle', 'Britannia'],
                totalPages,
                currentPage: page,
                selectedCategory: category || '',
                selectedBrand: brand || '',
                selectCategoryName: selectCategoryName  || null
            })
        }
        
    } catch (error) {
        console.log(error);
        res.redirect('/pageNotFound');
    }
}

const filterByPrice = async(req,res)=>{
    try {
        
        const user = req.session.user;
        const userData = await userModel.findOne({_id:user});
        const brands = await brandModel.find({}).lean();
        const categories = await categoryModel.find({isListed:true});
        
        let findProduct = await productModel.find({
            price:{$gt:req.query.gt,$lt:req.query.lt},
            isBlocked:false
        }).lean();

        findProduct.sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt));

        // Add this:
        if (user) {
          const wishlist = await wishlistModel.findOne({ userId: user });
          const wishlistProductIds = wishlist ? wishlist.product.map(id => id.toString()) : [];

          findProduct.forEach(product => {
            product.inWishlist = wishlistProductIds.includes(product._id.toString());
          });
        } else {
          findProduct.forEach(product => {
            product.inWishlist = false;
          });
        }

        for (const product of findProduct) {
          const productDiscount = Number(product.discount) || 0;
          const categoryObj = await categoryModel.findById(product.category);
          const categoryOffer = Number(categoryObj?.categoryOffer) || 0;
          product.effectiveDiscount = Math.max(productDiscount, categoryOffer);
        }
        

        let limit = 8;
        let page = parseInt(req.query.page) || 1;
        let startIndex = (page-1) * limit;
        let endIndex = startIndex + limit;
      
        let totalPages = Math.ceil(findProduct.length/limit);

        const currentProduct = findProduct.slice(startIndex,endIndex);
 
        req.session.filteredProducts = findProduct;

        if(user){
            return res.render('allProducts',{
                user:userData,
                products: currentProduct,
                categories,
                brands: ['Rajgiraattad', 'Pampers', 'Amul', 'Nestle', 'Parle', 'Britannia'],
                totalPages,
                currentPage: page,
                selectedCategory: '',
                selectedBrand:'',
                selectCategoryName: null
            })   
        }else{
            return res.render('allProducts',{
                products: currentProduct,
                categories,
                brands: ['Rajgiraattad', 'Pampers', 'Amul', 'Nestle', 'Parle', 'Britannia'],
                totalPages,
                currentPage: page,
                selectedCategory: '',
                selectedBrand:'',
                selectCategoryName: null
            }) 
        }


    } catch (error) {
        console.log(error);
        res.redirect('/pageNotFound');
    }
}


const allProducts = async (req, res) => {
  try {
    const userId = req.session.user;
    const page = parseInt(req.query.page) || 1;
    const limit = 8;
    const skip = (page - 1) * limit;

    const search = req.query.search || '';
    const category = req.query.category || '';
    const brand = req.query.brand || '';
    const priceGt = req.query.gt || null;
    const priceLt = req.query.lt || null;
    const sortOption = req.query.sort || '';

    const query = { isBlocked: false };

    // Search
    if (search) {
      query.productName = { $regex: search, $options: 'i' };
    }

    // Category filter
    if (category) {
      query.category = category;
    }

    // Brand filter
    if (brand) {
      query.brand = brand;
    }

    // Price range filter
    if (priceGt && priceLt) {
      query.price = {
        $gt: parseFloat(priceGt),
        $lt: parseFloat(priceLt)
      };
  }
  

    // Fetch only listed categories
    const categories = await categoryModel.find({ isListed: true });
    const brands = await brandModel.find({});

    // Sorting logic
    let sort = {};
    switch (sortOption) {
      case 'price_asc':
        sort = { price: 1 };
        break;
      case 'price_desc':
        sort = { price: -1 };
        break;
      case 'name_asc':
        sort = { productName: 1 };
        break;
      case 'name_desc':
        sort = { productName: -1 };
        break;
      default:
        sort = { createdAt: -1 };
    }

    // Fetch products
    const products = await productModel.find(query)
      .populate("category")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();

    const totalProducts = await productModel.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limit);

    // Handle wishlist flag
    if (userId) {
      const wishlist = await wishlistModel.findOne({ userId });
      const wishlistProductIds = wishlist ? wishlist.product.map(id => id.toString()) : [];

      products.forEach(product => {
        product.inWishlist = wishlistProductIds.includes(product._id.toString());
      });
    } else {
      products.forEach(product => {
        product.inWishlist = false;
      });
    }

    // Add effectiveDiscount for each product
    for (let product of products) {
      const productDiscount = product.discount || 0;
      const categoryOffer = product.category?.categoryOffer || 0;
      product.effectiveDiscount = Math.max(productDiscount, categoryOffer);
    }

    // Find user data if logged in
    const userData = userId ? await userModel.findById(userId) : null;

    // Get selected category name for display
    const selectedCategoryDoc = category
      ? await categoryModel.findById(category)
      : null;

    const renderData = {
      user: userData,
      products,
      categories,
      brands,
      currentPage: page,
      totalPages,
      selectedCategory: category || null,
      selectedBrand: brand || null,
      selectCategoryName: selectedCategoryDoc ? selectedCategoryDoc.categoryName : null,
      sort: sortOption,
      search,
      priceGt,
      priceLt
    };

    res.render("allProducts", renderData);
  } catch (error) {
    console.error("Error showing all products:", error);
    res.redirect("/pageNotFound");
  }
};


module.exports = {
    productDetails,
    allProducts,
    filterProduct,
    filterByPrice
}