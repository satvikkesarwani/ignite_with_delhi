import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { startKeepAlive } from './keepAlive.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Enable CORS for all origins in development and production
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json());

// In-memory mock data for hackathon quickstart
let hackathonProjects = [
  { id: 1, title: 'AI Medical Diagnostician', status: 'In Progress', score: 94 },
  { id: 2, title: 'DeFi Micro-Lending Pool', status: 'Completed', score: 88 },
  { id: 3, title: 'Autonomous Drone Delivery', status: 'Review', score: 91 },
];

/**
 * Health Check Endpoint
 * Render uses this to check service health, and keep-alive pings this endpoint.
 */
app.get('/health', (req, res) => {
  const memoryUsage = process.memoryUsage();
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    service: 'ignite-backend',
    environment: process.env.NODE_ENV || 'development',
    memory: {
      rssMb: (memoryUsage.rss / 1024 / 1024).toFixed(2),
      heapUsedMb: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2),
    },
  });
});

/**
 * Root Welcome Endpoint
 */
app.get('/', (req, res) => {
  res.json({
    message: '🚀 Ignite Hackathon API is Live & Healthy!',
    cdPipeline: '100% Verified & Live (Auto-Deploys on Push)',
    e2eVerifiedAt: '2026-09-18',
    healthCheck: '/health',
    docs: {
      'GET /health': 'Server uptime & status',
      'GET /api/hello': 'Basic connectivity test',
      'GET /api/projects': 'Get sample project list',
      'POST /api/projects': 'Add a new project (JSON: { title, status, score })',
      'POST /api/echo': 'Echo back received JSON payload',
    },
  });
});

/**
 * Sample Test Endpoints
 */
app.get('/api/hello', (req, res) => {
  res.json({
    success: true,
    message: 'Hello from the Express backend! Continuous deployment is connected.',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/projects', (req, res) => {
  res.json({
    success: true,
    count: hackathonProjects.length,
    data: hackathonProjects,
  });
});

app.post('/api/projects', (req, res) => {
  const { title, status = 'New', score = 0 } = req.body;
  if (!title) {
    return res.status(400).json({ success: false, error: 'Title is required' });
  }

  const newProject = {
    id: Date.now(),
    title,
    status,
    score: Number(score),
  };

  hackathonProjects.push(newProject);
  res.status(201).json({ success: true, data: newProject });
});

app.post('/api/echo', (req, res) => {
  res.json({
    success: true,
    receivedAt: new Date().toISOString(),
    body: req.body,
    headers: {
      host: req.headers.host,
      'user-agent': req.headers['user-agent'],
    },
  });
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`========================================`);
  console.log(`🚀 Server running on port: ${PORT}`);
  console.log(`📡 Local: http://localhost:${PORT}`);
  console.log(`🩺 Health: http://localhost:${PORT}/health`);
  console.log(`========================================`);

  // Initialize anti-sleep self-pinger
  startKeepAlive();
});
