import express from 'express';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import productRoutes from './routes/products.js';
import swaggerUI from 'swagger-ui-express';
import swaggerJSDoc from 'swagger-jsdoc';
import { apiLimiter, corsOptions } from './config/security.js';
import cors from 'cors';
import { createWebhook } from '../controllers/webhooks.js'; 
import { v2 as cloudinary } from 'cloudinary'; // TEMPORARIO

// .env
dotenv.config();

// TEMPORARIO
cloudinary.config({ 
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET
});



// Banco de Dados
connectDB();

// Declaração de Constantes
const app = express();

const options = {
  definition: {
    openapi: '3.0.0',
    info: { title: 'API de E-commerce', version: '1.0.0' },
  },
  apis: ['./routes/*.js'],
};

// Middlewares
app.use(express.json());
app.use(cors(corsOptions));
app.use('/api/', apiLimiter);

// Rotas
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.post('/api/webhooks', createWebhook);

// Teste 
app.use('/api-docs', swaggerUI.serve, swaggerUI.setup(swaggerJSDoc(options)));

// Error handling centralizado
app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));