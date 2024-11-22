import express from 'express';
import multer from 'multer';
import fs from 'fs';
import { generateMetadata } from '../services/openai.service.js';
import { uploadVideo, uploadVideoFromUrl, validateVideoUrl } from '../services/youtube.service.js';

const router = express.Router();
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 128 * 1024 * 1024 // 128MB
  }
});

router.post('/', upload.single('video'), async (req, res) => {
  const uploadedFile = req.file;
  
  try {
    const { title, videoUrl } = req.body;

    // Validate input
    if (!videoUrl && !uploadedFile) {
      return res.status(400).json({
        error: 'Missing video',
        details: 'Please provide either a video file or URL'
      });
    }

    // Validate URL if provided
    if (videoUrl) {
      const validationError = await validateVideoUrl(videoUrl);
      if (validationError) {
        return res.status(400).json({
          error: 'Invalid video URL',
          details: validationError
        });
      }
    }

    // Generate metadata
    let metadata;
    try {
      metadata = await generateMetadata(title);
    } catch (error) {
      console.warn('Metadata generation failed:', error);
      metadata = {
        title,
        description: `Uploaded video: ${title}`,
        tags: []
      };
    }

    // Upload video
    let result;
    try {
      if (videoUrl) {
        result = await uploadVideoFromUrl(videoUrl, metadata);
      } else {
        result = await uploadVideo(uploadedFile.path, metadata);
      }

      res.json({
        success: true,
        videoId: result.id,
        metadata
      });
    } catch (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      error: 'Upload failed',
      details: error.message
    });
  } finally {
    // Clean up uploaded file
    if (uploadedFile && fs.existsSync(uploadedFile.path)) {
      fs.unlink(uploadedFile.path, (err) => {
        if (err) console.error('Error cleaning up uploaded file:', err);
      });
    }
  }
});

export default router;