const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const { MongoClient } = require("mongodb");
const cloudinary = require("cloudinary").v2;
const cors = require("cors");
require("dotenv").config();

const app = express();

//
// ✅ CORS (Allow Vercel + Localhost)
//
app.use(
  cors({
    origin: [
      "https://image-compressor-pied-gamma.vercel.app",
      "http://localhost:3000",
      "http://localhost:5500",
      "http://127.0.0.1:3000",
      "http://localhost:5173" // Add any other ports you use
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    credentials: true
  })
);

app.options(/.*/, cors());

const PORT = process.env.PORT || 3000;

//
// ✅ Cloudinary Config
//
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

//
// ✅ MongoDB Connection
//
let db;
const client = new MongoClient(process.env.MONGODB_URI);

async function connectDB() {
  try {
    await client.connect();
    db = client.db();
    console.log("✅ Connected to MongoDB successfully!");
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    process.exit(1);
  }
}

//
// ✅ Middleware
//
app.use(express.json());
app.use(express.static("public"));



//
// ✅ Multer Setup with File Validation
//
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/jpg",
    "image/heif",
    "image/heic",
    "application/pdf"
  ];
  
  const allowedExtensions = [".jpg", ".jpeg", ".png", ".heif", ".heic", ".pdf"];
  const fileExtension = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf("."));
  
  if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPEG, PNG, HEIF, and PDF files are allowed!"), false);
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

//
// ✅ Health Check Route
//
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "Server is running ✅" });
});

//
// ✅ Compression Route
//
app.post("/api/compress", upload.single("image"), async (req, res) => {
  let uploadedPublicId = null;

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }

    console.log("\n========================================");
    console.log("📤 Uploaded:", req.file.originalname);

    const isPDF =
      req.file.mimetype === "application/pdf" ||
      req.file.originalname.toLowerCase().endsWith(".pdf");

    let outputFormat = isPDF ? "pdf" : (req.body.format || "jpeg");
    const shouldCompress = req.body.compress === "true";

    // Normalize format names
    if (outputFormat === "jpg") outputFormat = "jpeg";
    if (outputFormat === "heic") outputFormat = "heif";

    console.log("⚙️ Output Format:", outputFormat.toUpperCase());
    console.log("⚙️ Compression:", shouldCompress ? "ON" : "OFF");

    const originalSize = req.file.size;
    let processedBuffer;

    //
    // ✅ PDF: No processing
    //
    if (isPDF) {
      processedBuffer = req.file.buffer;
    }

    //
    // ✅ Image Processing
    //
    else {
      const sharpInstance = sharp(req.file.buffer);

      // ✅ PNG
      if (outputFormat === "png") {
        processedBuffer = shouldCompress
          ? await sharpInstance.png({ compressionLevel: 6, effort: 1 }).toBuffer()
          : await sharpInstance.png().toBuffer();
      }

      // ✅ JPEG
      else if (outputFormat === "jpeg") {
        processedBuffer = shouldCompress
          ? await sharpInstance.jpeg({ quality: 80, progressive: true }).toBuffer()
          : await sharpInstance.jpeg({ quality: 95 }).toBuffer();
      }

      // ❌ Invalid format
      else {
        return res.status(400).json({
          success: false,
          error: "Invalid format. Use jpeg, png, or heif."
        });
      }
    }

    //
    // ✅ Upload to Cloudinary
    //
    console.log("☁️ Uploading to Cloudinary...");

    const cloudinaryResult = await new Promise((resolve, reject) => {
      const uploadOptions = {
        folder: "compressor",
        public_id: `file-${Date.now()}`,
        timeout: 60000
      };

      if (isPDF) {
        uploadOptions.resource_type = "raw";
      } else {
        uploadOptions.resource_type = "image";
      }

      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) {
            console.error("❌ Cloudinary upload failed:", error);
            reject(error);
          } else {
            console.log("✅ Uploaded:", result.secure_url);
            resolve(result);
          }
        }
      );

      uploadStream.end(processedBuffer);
    });

    uploadedPublicId = cloudinaryResult.public_id;

    //
    // ✅ Force Direct Download (No Tab Open)
    //
    const forcedDownloadUrl = cloudinaryResult.secure_url.replace(
      "/upload/",
      "/upload/fl_attachment/"
    );

    //
    // ✅ Calculate Compression Ratio
    //
    const processedSize = processedBuffer.length;
    let compressionRatio = (
      ((originalSize - processedSize) / originalSize) * 100
    ).toFixed(2);

    if (processedSize > originalSize) {
      compressionRatio = "-" + Math.abs(compressionRatio);
    }

    //
    // ✅ Save Metadata to MongoDB
    //
    db.collection("compressions")
      .insertOne({
        filename: req.file.originalname,
        originalSize,
        processedSize,
        compressionRatio: compressionRatio + "%",
        format: outputFormat,
        cloudinaryUrl: cloudinaryResult.secure_url,
        cloudinaryPublicId: uploadedPublicId,
        downloadUrl: forcedDownloadUrl,
        timestamp: new Date()
      })
      .catch((err) => console.error("DB Insert Error:", err.message));

    //
    // ✅ Response to Frontend
    //
    res.json({
      success: true,
      message: "File processed successfully ✅",
      originalSize: (originalSize / 1024).toFixed(2) + " KB",
      compressedSize: (processedSize / 1024).toFixed(2) + " KB",
      compressionRatio: compressionRatio + "%",
      downloadUrl: forcedDownloadUrl
    });

    console.log("✅ Complete - Ratio:", compressionRatio + "%");
    console.log("========================================\n");

  } catch (error) {
    console.error("========== ERROR ==========");
    console.error(error.message);
    console.error("===========================");

    // Cleanup Cloudinary upload on error
    if (uploadedPublicId) {
      cloudinary.uploader.destroy(uploadedPublicId, {
        resource_type: "image"
      }).catch(() => {});
    }

    res.status(500).json({
      success: false,
      error: "Server failed to process file",
      details: error.message
    });
  }
});

//
// ✅ History Route
//
app.get("/api/history", async (req, res) => {
  try {
    const history = await db
      .collection("compressions")
      .find()
      .sort({ timestamp: -1 })
      .limit(10)
      .toArray();

    res.json({ success: true, history });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to load history" });
  }
});

// ✅ Cleanup Old Files (runs every 24 hours)
async function cleanupOldCloudinaryFiles() {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const oldFiles = await db.collection("compressions")
      .find({ timestamp: { $lt: oneDayAgo } })
      .toArray();

    for (const file of oldFiles) {
      if (file.cloudinaryPublicId) {
        try {
          await cloudinary.uploader.destroy(file.cloudinaryPublicId, {
            resource_type: file.format === "pdf" ? "raw" : "image"
          });
          console.log("🗑️ Deleted:", file.cloudinaryPublicId);
        } catch (error) {
          console.log("Could not delete:", file.cloudinaryPublicId);
        }
      }
    }

    await db.collection("compressions").deleteMany({ timestamp: { $lt: oneDayAgo } });
    console.log("✅ Cleanup completed");
  } catch (error) {
    console.error("Cleanup error:", error);
  }
}

setInterval(cleanupOldCloudinaryFiles, 24 * 60 * 60 * 1000);

//
// ✅ Start Server
//
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log("\n========================================");
    console.log("🚀 Image Compressor Server Started");
    console.log("📍 Running at: http://localhost:" + PORT);
    console.log("✅ MongoDB Connected");
    console.log("✅ Cloudinary:", process.env.CLOUDINARY_CLOUD_NAME || "NOT SET");
    console.log("========================================\n");
  });
});