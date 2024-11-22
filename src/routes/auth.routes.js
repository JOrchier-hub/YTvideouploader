import express from 'express';
import { handleOAuthCallback } from '../services/youtube.service.js';

const router = express.Router();

router.get('/oauth2callback', async (req, res) => {
  try {
    const { code } = req.query;
    await handleOAuthCallback(code);
    res.redirect('/');
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;