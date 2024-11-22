import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import fs from 'fs';
import { config } from '../config/config.js';
import fetch from 'node-fetch';
import ytdl from 'ytdl-core';
import pRetry from 'p-retry';
import pTimeout from 'p-timeout';

const oauth2Client = new OAuth2Client(
  config.google.clientId,
  config.google.clientSecret,
  config.google.redirectUri
);

const MAX_FILE_SIZE = 128 * 1024 * 1024; // 128MB
const DOWNLOAD_TIMEOUT = 300000; // 5 minutes
const MAX_RETRIES = 3;

async function downloadWithRetry(url, filePath) {
  return pRetry(
    async () => {
      const response = await fetch(url, {
        timeout: DOWNLOAD_TIMEOUT,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const fileStream = fs.createWriteStream(filePath);
      await new Promise((resolve, reject) => {
        response.body.pipe(fileStream);
        response.body.on('error', reject);
        fileStream.on('finish', resolve);
      });
    },
    {
      retries: MAX_RETRIES,
      onFailedAttempt: error => {
        console.warn(
          `Download attempt failed (${error.attemptNumber}/${MAX_RETRIES + 1}): ${error.message}`
        );
      }
    }
  );
}

export async function validateVideoUrl(url) {
  if (!url) {
    return 'URL is required';
  }

  try {
    const cleanUrl = url.trim();
    
    // Check if it's a YouTube URL
    if (ytdl.validateURL(cleanUrl)) {
      try {
        const info = await pRetry(
          async () => {
            const videoInfo = await ytdl.getInfo(cleanUrl);
            const format = ytdl.chooseFormat(videoInfo.formats, { quality: 'highest' });
            
            if (!format) {
              throw new Error('No suitable video format found');
            }

            if (format.contentLength && parseInt(format.contentLength) > MAX_FILE_SIZE) {
              throw new Error('Video size exceeds 128MB limit');
            }

            return videoInfo;
          },
          {
            retries: MAX_RETRIES,
            onFailedAttempt: error => {
              console.warn(`YouTube info attempt failed: ${error.message}`);
            }
          }
        );
        return null;
      } catch (error) {
        return `YouTube video validation failed: ${error.message}`;
      }
    }

    // For direct URLs
    try {
      const response = await fetch(cleanUrl, { 
        method: 'HEAD',
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      if (!response.ok) {
        return 'Invalid video URL';
      }

      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('video/')) {
        return 'URL does not point to a video file';
      }

      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
        return 'Video size exceeds 128MB limit';
      }

      return null;
    } catch (error) {
      return `URL validation failed: ${error.message}`;
    }
  } catch (error) {
    return `Invalid URL: ${error.message}`;
  }
}

export async function uploadVideoFromUrl(videoUrl, metadata) {
  try {
    const tempFilePath = `uploads/temp-${Date.now()}.mp4`;
    
    // Ensure uploads directory exists
    if (!fs.existsSync('uploads')) {
      fs.mkdirSync('uploads', { recursive: true });
    }

    // Download video
    if (ytdl.validateURL(videoUrl)) {
      try {
        await new Promise((resolve, reject) => {
          const stream = ytdl(videoUrl, {
            quality: 'highest',
            filter: 'videoandaudio'
          });
          
          stream.pipe(fs.createWriteStream(tempFilePath));
          stream.on('end', resolve);
          stream.on('error', reject);
        });
      } catch (error) {
        // If ytdl-core fails, try direct download
        await downloadWithRetry(videoUrl, tempFilePath);
      }
    } else {
      // Download direct URL with retry mechanism
      await downloadWithRetry(videoUrl, tempFilePath);
    }

    try {
      // Check file size after download
      const stats = fs.statSync(tempFilePath);
      if (stats.size > MAX_FILE_SIZE) {
        fs.unlinkSync(tempFilePath);
        throw new Error('Downloaded video exceeds 128MB limit');
      }

      if (stats.size === 0) {
        fs.unlinkSync(tempFilePath);
        throw new Error('Downloaded file is empty');
      }

      // Upload to YouTube
      const result = await uploadVideo(tempFilePath, metadata);
      
      // Clean up
      fs.unlinkSync(tempFilePath);
      
      return result;
    } catch (error) {
      // Clean up on error
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      throw error;
    }
  } catch (error) {
    throw new Error(`Video upload failed: ${error.message}`);
  }
}

export async function uploadVideo(filePath, metadata) {
  try {
    const youtube = google.youtube('v3');
    
    const res = await youtube.videos.insert({
      auth: oauth2Client,
      part: 'snippet,status',
      requestBody: {
        snippet: {
          title: metadata.title,
          description: metadata.description,
          tags: metadata.tags
        },
        status: {
          privacyStatus: 'private'
        }
      },
      media: {
        body: fs.createReadStream(filePath)
      }
    });

    return res.data;
  } catch (error) {
    throw new Error(`YouTube API error: ${error.message}`);
  }
}

export async function handleOAuthCallback(code) {
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    return tokens;
  } catch (error) {
    throw new Error(`Authentication failed: ${error.message}`);
  }
}