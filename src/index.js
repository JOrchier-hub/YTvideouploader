import express from 'express';
import cors from 'cors';
import { config } from './config/config.js';
import uploadRoutes from './routes/upload.routes.js';
import authRoutes from './routes/auth.routes.js';

const app = express();

// Enable CORS for all routes
app.use(cors());

// Parse JSON and form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static('public'));

// Routes
app.use('/upload', uploadRoutes);
app.use('/', authRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    details: err.message
  });
});

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});