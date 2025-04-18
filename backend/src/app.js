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

// --- Configuração do Swagger/OpenAPI ---
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API de E-commerce',
      version: '1.0.0',
      description: 'API RESTful base para funcionalidades de e-commerce, incluindo autenticação, usuários, categorias e produtos.',
      contact: { name: 'Cláudio de Lima Tosta', email: 'eng-soft-claudio@gmail.com' }, // Opcional
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 5000}`,
        description: 'Servidor de Desenvolvimento'
      },
      // Adicionar URL de produção aqui quando tiver
      // { url: 'https://sua-api-producao.com', description: 'Servidor de Produção'}
    ],
    
    // --- Componentes Reutilizáveis ---
    components: {
      // Schemas (Modelos de Dados)
      schemas: {
        // Usuários
        UserInputRegister: { // Específico para Registro
          type: 'object',
          required: ['name', 'email', 'password', 'passwordConfirm'],
          properties: {
            name: { type: 'string', example: 'João Silva' },
            email: { type: 'string', format: 'email', example: 'joao.silva@email.com' },
            password: { type: 'string', format: 'password', minLength: 8, example: 'senhaForte123' },
            passwordConfirm: { type: 'string', format: 'password', example: 'senhaForte123' },
          }
        },
        UserInputLogin: { // Específico para Login
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'joao.silva@email.com' },
            password: { type: 'string', format: 'password', example: 'senhaForte123' },
          }
        },
         UserInputUpdateMe: { // Específico para atualizar próprio perfil
            type: 'object',
            properties: {
                name: { type: 'string', example: 'João da Silva Sauro' },
                email: { type: 'string', format: 'email', example: 'joao.sauro@email.com' },
            }
         },
         UserUpdatePasswordInput: { // Específico para mudar senha
             type: 'object',
             required: ['currentPassword', 'password', 'passwordConfirm'],
             properties: {
                 currentPassword: { type: 'string', format: 'password', example: 'senhaAntiga123' },
                 password: { type: 'string', format: 'password', minLength: 8, example: 'novaSenhaForte456' },
                 passwordConfirm: { type: 'string', format: 'password', example: 'novaSenhaForte456' },
             }
         },
        UserOutput: { // Representação do usuário na resposta
          type: 'object',
          properties: {
            _id: { type: 'string', format: 'objectid', example: '68015a91320b9fa9419079be' },
            name: { type: 'string', example: 'João Silva' },
            email: { type: 'string', format: 'email', example: 'joao.silva@email.com' },
            role: { type: 'string', enum: ['user', 'admin'], example: 'user' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          }
        },
        // Categorias
        CategoryInput: {
            type: 'object',
            required: ['name'],
            properties: {
                 name: { type: 'string', example: 'Eletrônicos' },
                 description: { type: 'string', example: 'Dispositivos eletrônicos e acessórios' },
            }
        },
        CategoryOutput: {
            type: 'object',
             properties: {
                _id: { type: 'string', format: 'objectid', example: '6801350d65d4d9e110605dbaf' },
                 name: { type: 'string', example: 'Eletrônicos' },
                 slug: { type: 'string', example: 'eletronicos' },
                 description: { type: 'string', example: 'Dispositivos eletrônicos e acessórios' },
                 createdAt: { type: 'string', format: 'date-time' },
                 updatedAt: { type: 'string', format: 'date-time' },
            }
        },
        // Produtos
        ProductInput: {
            type: 'object',
            required: ['name', 'price', 'category', 'image'], // Assumindo imagem obrigatória na criação
            properties: {
                 name: { type: 'string', example: 'Laptop XPTO Pro' },
                 description: { type: 'string', example: 'Laptop de alta performance.' },
                 price: { type: 'number', format: 'float', minimum: 0.01, example: 1599.99 },
                 category: { type: 'string', format: 'objectid', description: 'ID da Categoria', example: '6801350d65d4d9e110605dbaf' },
                 stock: { type: 'integer', minimum: 0, example: 50 },
                 image: { type: 'string', format: 'binary', description: '(Via form-data) Arquivo de imagem do produto.' }, // Indicar que é via form-data
            }
        },
         ProductUpdateInput: { // Para atualização, campos são opcionais
            type: 'object',
            properties: {
                 name: { type: 'string', example: 'Laptop XPTO Pro Max' },
                 description: { type: 'string', example: 'Laptop de alta performance atualizado.' },
                 price: { type: 'number', format: 'float', minimum: 0.01, example: 1699.99 },
                 category: { type: 'string', format: 'objectid', description: 'ID da Categoria', example: '6801350d65d4d9e110605dbaf' },
                 stock: { type: 'integer', minimum: 0, example: 45 },
                 image: { type: 'string', format: 'binary', description: '(Via form-data) Nova imagem (opcional).' },
            }
        },
        ProductOutput: {
            type: 'object',
             properties: {
                _id: { type: 'string', format: 'objectid', example: '6801a...' },
                 name: { type: 'string', example: 'Laptop XPTO Pro' },
                 description: { type: 'string', example: 'Laptop de alta performance.' },
                 price: { type: 'number', format: 'float', example: 1599.99 },
                 category: { $ref: '#/components/schemas/CategoryOutput' }, // Referencia o output da Categoria
                 stock: { type: 'integer', example: 50 },
                 image: { type: 'string', format: 'url', example: 'https://res.cloudinary.com/...' },
                 imagePublicId: { type: 'string', example: 'ecommerce/products/...' },
                 createdAt: { type: 'string', format: 'date-time' },
                 updatedAt: { type: 'string', format: 'date-time' },
            }
        },
        // Respostas Genéricas
        AuthResponse: { // Resposta de Login/Registro
          type: 'object',
          properties: {
            status: { type: 'string', example: 'success' },
            token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
            data: { // Opcional incluir usuário no registro
              type: 'object',
              properties: { user: { $ref: '#/components/schemas/UserOutput' } }
            }
          }
        },
        SuccessResponse: { // Resposta genérica de sucesso (ex: delete)
            type: 'object',
            properties: {
                status: { type: 'string', example: 'success' },
                message: { type: 'string', example: 'Operação realizada com sucesso.' },
            }
        },
        ErrorValidationResponse: { // Erro de validação express-validator
             type: 'object',
               properties: {
                 errors: {
                    type: 'array',
                    items: { type: 'object' }
                 }
             }
        },
        ErrorResponse: { // Erro padrão do AppError
           type: 'object',
           properties: {
             status: { type: 'string', example: 'fail' },
             message: { type: 'string', example: 'Mensagem de erro descritiva.' },
           }
         }
      },
      // Esquemas de Segurança
      securitySchemes: {
        bearerAuth: { 
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Autenticação via Token JWT (incluir "Bearer " antes do token).',
        }
      }
    },
     
  },
  apis: ['./routes/*.js'], // Arquivos onde buscar as anotações das rotas
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

export default app; 
