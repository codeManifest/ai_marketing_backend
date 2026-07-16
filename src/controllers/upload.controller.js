import { v2 as cloudinary } from 'cloudinary';

// Initialize Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * POST /api/upload
 * Uploads a base64 string or file URL to Cloudinary and returns the secure URL.
 */
export async function uploadFile(req, res) {
  try {
    const { file } = req.body;

    if (!file) {
      return res.status(400).json({ error: "File content payload is required" });
    }

    const uploadResponse = await cloudinary.uploader.upload(file, {
      folder: "postly_uploads",
    });

    return res.json({ url: uploadResponse.secure_url });
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    return res.status(500).json({ error: error.message });
  }
}
