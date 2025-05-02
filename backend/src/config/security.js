//src/config/security.js
import rateLimit from 'express-rate-limit';

// Configuração de Rate Limiting
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100,
  message: 'Muitas requisições deste IP. Tente novamente após 15 minutos.',
  standardHeaders: true,
  legacyHeaders: false
});

// Configuração de CORS
export const corsOptions = {
    origin: process.env.ALLOWED_ORIGINS?.split(','),
    methods: ['GET,HEAD,PUT,PATCH,POST,DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  };