const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const {MongoClient} = require('mongodb');
const path = require('path');
const fs = require('fs');
const { error, timeStamp } = require('console');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

let db;
const client = new MongoClient(process.env.MONGODB_URI);

async function connectDB() {
    try {
        await client.connect();
        db = client.db();
        console.log("Connected to MongoDB successfully!");
    } catch (error) {
        console.error("MongoDB connection error:", error);
        process.exit(1);
    }
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/heif', 'image/heic'];
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.heif', '.heic'];
    
    const fileExtension = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    
    console.log('File upload attempt:');
    console.log('  Name:', file.originalname);
    console.log('  MIME type:', file.mimetype);
    console.log('  Extension:', fileExtension);
    
    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
        console.log('  ✅ File accepted');
        cb(null, true);
    } else {
        console.log('  ❌ File rejected');
        cb(new Error('Only JPEG, PNG, and HEIF images are allowed!'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {fileSize: 10 * 1024 * 1024} // 10MB max file size
});

app.use(express.json());
app.use(express.static('public'));

const folders = ['uploads', 'compressed'];
folders.forEach(folder => {
    if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder);
        console.log(`Created ${folder} folder`);
    }
});

app.get('/api/health', (req, res) => {
    res.json({status: 'OK', message: 'Server is running'});
});

app.post('/api/compress', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file uploaded' });
        }

        const outputFormat = req.body.format || 'jpeg';
        const timestamp = Date.now();
        const randomNum = Math.floor(Math.random() * 10000);
        const outputFilename = `compressed-${timestamp}-${randomNum}.${outputFormat}`;
        const outputPath = path.join(__dirname, 'compressed', outputFilename);

        const originalPath = path.join(__dirname, req.file.path);

        const originalSize = fs.statSync(originalPath).size;

        let sharpInstance = sharp(originalPath);

        if (outputFormat === 'png') {
            await sharpInstance
                .png({ 
                    compressionLevel: 9,
                    effort: 10
                })
                .toFile(outputPath);
        } else if (outputFormat === 'jpeg' || outputFormat === 'jpg') {
            await sharpInstance
                .jpeg({ 
                    quality: 90,
                    mozjpeg: true
                })
                .toFile(outputPath);
        } else if (outputFormat === 'heif' || outputFormat === 'heic') {
            await sharpInstance
                .heif({ 
                    quality: 90,
                    compression: 'av1',
                    effort: 9
                })
                .toFile(outputPath);
        } else {
            return res.status(400).json({ error: 'Invalid format. Use jpeg, png, or heif' });
        }

        const compressedSize = fs.statSync(outputPath).size;

        let compressionRatio = ((originalSize - compressedSize) / originalSize * 100).toFixed(2);
        
        if (compressedSize > originalSize) {
            compressionRatio = ((compressedSize - originalSize) / originalSize * 100).toFixed(2);
            compressionRatio = '-' + compressionRatio;
        }

        const imageData = {
            originalName: req.file.originalname,
            originalSize: originalSize,
            compressedSize: compressedSize,
            compressionRatio: compressionRatio + '%',
            originalFormat: req.file.mimetype,
            outputFormat: outputFormat,
            timestamp: new Date(),
            downloadPath: outputFilename
        };

        await db.collection('compressions').insertOne(imageData);

        res.json({
            success: true,
            message: 'Image compressed successfully',
            originalSize: (originalSize / 1024).toFixed(2) + ' KB',
            compressedSize: (compressedSize / 1024).toFixed(2) + ' KB',
            compressionRatio: compressionRatio + '%',
            downloadUrl: `/api/download/${outputFilename}`
        });

    } catch (error) {
        console.error('Compression error:', error);
        
        res.status(500).json({ 
            error: 'Failed to compress image', 
            details: error.message 
        });
    }
});

app.get('/api/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'compressed', filename);

    if (fs.existsSync(filePath)) {
        res.download(filePath, (err) => {
            if (err) {
                console.error('Download error:', error);
                res.status(500).json({error: 'Failed to dowanload file'});
            }
        });
    } else {
        res.status(404).json({error: 'File not found'});
    }
});

app.get('/api/history', async (req, res) => {
    try {
        const history = await db.collection('compressions')
        .find()
        .sort({timeStamp: -1})
        .limit(10)
        .toArray();

        res.json({success: true, history: history});
    } catch (error) {
        console.error('History error:', error);
        res.status(500).json({error: 'Failed to fetch history'});
    }
});

function cleanupOldFiles() {
    const folders = ['uploads', 'compressed'];
    const maxAge = 60 * 60 * 1000;
    
    folders.forEach(folder => {
        const folderPath = path.join(__dirname, folder);
        
        if (!fs.existsSync(folderPath)) return;
        
        fs.readdir(folderPath, (err, files) => {
            if (err) {
                console.log('Error reading folder:', folder);
                return;
            }
            
            files.forEach(file => {
                const filePath = path.join(folderPath, file);
                
                fs.stat(filePath, (err, stats) => {
                    if (err) return;
                    
                    const fileAge = Date.now() - stats.mtimeMs;
                    
                    if (fileAge > maxAge) {
                        fs.unlink(filePath, (err) => {
                            if (err) {
                                console.log(`Could not delete ${file}`);
                            } else {
                                console.log(`Deleted old file: ${file}`);
                            }
                        });
                    }
                });
            });
        });
    });
}

setInterval(cleanupOldFiles, 30 * 60 * 1000);

cleanupOldFiles();

connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
});