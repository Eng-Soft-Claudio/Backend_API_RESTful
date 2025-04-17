import express from 'express';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import productRoutes from './routes/products.js';
import categoryRoutes from './routes/category.js'; 
import swaggerUI from 'swagger-ui-express';
import swaggerJSDoc from 'swagger-jsdoc';
import { apiLimiter, corsOptions } from './config/security.js';
import cors from 'cors';
import webhookRoutes from './routes/webhooks.js';
import globalErrorHandler from './middleware/errorHandler.js';

// .env
dotenv.config();

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
app.use(globalErrorHandler); 

// Rotas
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api-docs', swaggerUI.serve, swaggerUI.setup(swaggerJSDoc(options)));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));

export default app;

if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
}