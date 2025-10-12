const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads folder exists
const uploadPath = 'uploads/temp';
if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath,{ recursive: true });
}

// Define storage strategy
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});


// Set up multer with storage and basic file type filter (optional)
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Optional: limit to 5MB
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png|gif/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only image files are allowed!'));
    }
});

module.exports = upload;