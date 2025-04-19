import express from 'express';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import productRoutes from './routes/products.js';
import categoryRoutes from './routes/category.js'; 
import addressRoutes from './routes/addressRoutes.js'; 
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
      contact: { name: 'Cláudio de Lima Tosta', email: 'eng-soft-claudio@gmail.com' },
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 5000}`,
        description: 'Servidor de Desenvolvimento'
      },
    ],
    
    // --- Componentes Reutilizáveis ---
    components: {
      // Schemas (Modelos de Dados)
      schemas: {
        // Usuários
        UserInputRegister: { 
          type: 'object',
          required: ['name', 'email', 'password', 'passwordConfirm'],
          properties: {
            name: { type: 'string', example: 'João Silva' },
            email: { type: 'string', format: 'email', example: 'joao.silva@email.com' },
            password: { type: 'string', format: 'password', minLength: 8, example: 'senhaForte123' },
            passwordConfirm: { type: 'string', format: 'password', example: 'senhaForte123' },
          }
        },
        UserInputLogin: { 
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'joao.silva@email.com' },
            password: { type: 'string', format: 'password', example: 'senhaForte123' },
          }
        },
         UserInputUpdateMe: { 
            type: 'object',
            properties: {
                name: { type: 'string', example: 'João da Silva Sauro' },
                email: { type: 'string', format: 'email', example: 'joao.sauro@email.com' },
            }
         },
         UserUpdatePasswordInput: { 
             type: 'object',
             required: ['currentPassword', 'password', 'passwordConfirm'],
             properties: {
                 currentPassword: { type: 'string', format: 'password', example: 'senhaAntiga123' },
                 password: { type: 'string', format: 'password', minLength: 8, example: 'novaSenhaForte456' },
                 passwordConfirm: { type: 'string', format: 'password', example: 'novaSenhaForte456' },
             }
         },
        UserOutput: { 
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
            required: ['name', 'price', 'category', 'image'], 
            properties: {
                 name: { type: 'string', example: 'Laptop XPTO Pro' },
                 description: { type: 'string', example: 'Laptop de alta performance.' },
                 price: { type: 'number', format: 'float', minimum: 0.01, example: 1599.99 },
                 category: { type: 'string', format: 'objectid', description: 'ID da Categoria', example: '6801350d65d4d9e110605dbaf' },
                 stock: { type: 'integer', minimum: 0, example: 50 },
                 image: { type: 'string', format: 'binary', description: '(Via form-data) Arquivo de imagem do produto.' }, 
            }
        },
         ProductUpdateInput: { 
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
                 category: { $ref: '#/components/schemas/CategoryOutput' }, 
                 stock: { type: 'integer', example: 50 },
                 image: { type: 'string', format: 'url', example: 'https://res.cloudinary.com/...' },
                 imagePublicId: { type: 'string', example: 'ecommerce/products/...' },
                 createdAt: { type: 'string', format: 'date-time' },
                 updatedAt: { type: 'string', format: 'date-time' },
            }
        },
        // Respostas Genéricas
        AuthResponse: { 
          type: 'object',
          properties: {
            status: { type: 'string', example: 'success' },
            token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
            data: {
              type: 'object',
              properties: { user: { $ref: '#/components/schemas/UserOutput' } }
            }
          }
        },
        SuccessResponse: { 
            type: 'object',
            properties: {
                status: { type: 'string', example: 'success' },
                message: { type: 'string', example: 'Operação realizada com sucesso.' },
            }
        },
        ErrorValidationResponse: { 
             type: 'object',
               properties: {
                 errors: {
                    type: 'array',
                    items: { type: 'object' }
                 }
             }
        },
        ErrorResponse: { 
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
     // Esquemas de Endereço
     AddressInput: {
      type: 'object',
      required: ['street', 'number', 'neighborhood', 'city', 'state', 'postalCode'], 
      properties: {
          label: { type: 'string', maxLength: 50, example: 'Casa', description: 'Rótulo opcional para identificar o endereço.' },
          street: { type: 'string', maxLength: 200, example: 'Rua das Flores', description: 'Nome da rua, avenida, etc.' },
          number: { type: 'string', maxLength: 20, example: '123A', description: 'Número do imóvel (ou S/N).' },
          complement: { type: 'string', maxLength: 100, example: 'Apto 42', description: 'Complemento (opcional).' },
          neighborhood: { type: 'string', maxLength: 100, example: 'Centro', description: 'Bairro.' },
          city: { type: 'string', maxLength: 100, example: 'Cidade Exemplo', description: 'Município.' },
          state: { type: 'string', minLength: 2, maxLength: 2, example: 'SP', description: 'Sigla do Estado (UF).' },
          postalCode: { type: 'string', example: '12345-678', description: 'CEP (formato XXXXX-XXX ou XXXXXXXXX).' },
          country: { type: 'string', maxLength: 50, example: 'Brasil', default: 'Brasil', description: 'País.' },
          phone: { type: 'string', maxLength: 20, example: '(11) 98765-4321', description: 'Telefone de contato (opcional).' },
          isDefault: { type: 'boolean', example: false, default: false, description: 'Marcar como endereço padrão?' }
      }
  },
    AddressOutput: {
      type: 'object',
      properties: {
          _id: { type: 'string', format: 'objectid', example: '6701a...' },
          user: { type: 'string', format: 'objectid', description: 'ID do usuário proprietário.', example: '68015a91320b9fa9419079be' },
          label: { type: 'string', example: 'Casa' },
          street: { type: 'string', example: 'Rua das Flores' },
          number: { type: 'string', example: '123A' },
          complement: { type: 'string', example: 'Apto 42' },
          neighborhood: { type: 'string', example: 'Centro' },
          city: { type: 'string', example: 'Cidade Exemplo' },
          state: { type: 'string', example: 'SP' },
          postalCode: { type: 'string', example: '12345-678' },
          country: { type: 'string', example: 'Brasil' },
          phone: { type: 'string', example: '(11) 98765-4321' },
          isDefault: { type: 'boolean', example: false },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
      }
  },
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
app.use('/api/categories', categoryRoutes);
app.use('/api/addresses', addressRoutes); 
app.use('/api/webhooks', webhookRoutes);
app.use('/api-docs', swaggerUI.serve, swaggerUI.setup(swaggerJSDoc(options)));

// Middleware de Erro GLOBAL
app.use(globalErrorHandler); 

export default app; 
