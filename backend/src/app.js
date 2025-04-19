import express from 'express';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import productRoutes from './routes/products.js';
import categoryRoutes from './routes/category.js'; 
import addressRoutes from './routes/addressRoutes.js';
import cartRoutes from './routes/cartRoutes.js';
import orderRoutes from './routes/orderRoutes.js';  
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
  // Esquemas de Carrinho de Compras
    CartItemOutput: {
      type: 'object',
      description: 'Representa um item dentro do carrinho de compras.',
      properties: {
          product: {
              $ref: '#/components/schemas/ProductOutput', 
              description: 'Detalhes do produto neste item do carrinho.'
          },
          quantity: {
              type: 'integer',
              example: 2,
              description: 'Quantidade deste produto no carrinho.'
          },
          subtotal: {
              type: 'number',
              format: 'float',
              example: 3199.98,
              description: 'Subtotal calculado para este item (preço * quantidade). Campo virtual.'
          }
      }
  },
  CartOutput: {
      type: 'object',
      description: 'Representa o carrinho de compras de um usuário.',
      properties: {
          _id: {
              type: 'string',
              format: 'objectid',
              nullable: true, 
              example: '6901b...' ,
              description: 'ID único do carrinho (null se ainda não salvo).'
          },
          user: {
              type: 'string',
              format: 'objectid',
              example: '68015a91320b9fa9419079be',
              description: 'ID do usuário dono do carrinho.'
          },
          items: {
              type: 'array',
              description: 'Lista de itens no carrinho.',
              items: {
                  $ref: '#/components/schemas/CartItemOutput' 
              }
          },
          createdAt: {
              type: 'string',
              format: 'date-time',
              nullable: true, 
              description: 'Data de criação do carrinho.'
          },
          updatedAt: {
              type: 'string',
              format: 'date-time',
              nullable: true, 
              description: 'Data da última atualização do carrinho.'
          }
      }
  },
  // Esquemas de pedidos
  OrderItemOutput: { // Schema para os itens DENTRO da resposta do pedido
    type: 'object',
    description: 'Representa um item dentro de um pedido.',
    properties: {
        productId: {
            type: 'string',
            format: 'objectid',
            description: 'ID do produto original.',
            example: '6801a...'
        },
        name: {
            type: 'string',
            description: 'Nome do produto no momento da compra.',
            example: 'Laptop XPTO Pro'
        },
        quantity: {
            type: 'integer',
            description: 'Quantidade comprada.',
            example: 1
        },
        price: {
            type: 'number',
            format: 'float',
            description: 'Preço unitário no momento da compra.',
            example: 1599.99
        },
        image: {
            type: 'string',
            format: 'url',
            description: 'URL da imagem do produto.',
            example: 'https://res.cloudinary.com/...'
        }
    }
 },
 OrderShippingAddressOutput: { // Schema para o endereço EMBUTIDO no pedido
     type: 'object',
     description: 'Endereço de entrega registrado no pedido.',
     properties: {
         label: { type: 'string', example: 'Casa' },
         street: { type: 'string', example: 'Rua das Flores' },
         number: { type: 'string', example: '123A' },
         complement: { type: 'string', example: 'Apto 42', nullable: true },
         neighborhood: { type: 'string', example: 'Centro' },
         city: { type: 'string', example: 'Cidade Exemplo' },
         state: { type: 'string', example: 'SP' },
         postalCode: { type: 'string', example: '12345-678' },
         country: { type: 'string', example: 'Brasil' },
         phone: { type: 'string', example: '(11) 98765-4321', nullable: true }
     }
 },
 OrderPaymentResultOutput: { // Schema para o resultado do pagamento
      type: 'object',
      nullable: true, 
      description: 'Detalhes do resultado do pagamento (se aplicável).',
      properties: {
          id: { type: 'string', description: 'ID da transação no gateway.', example: 'pi_123...' },
          status: { type: 'string', description: 'Status do pagamento no gateway.', example: 'succeeded' },
          update_time: { type: 'string', description: 'Timestamp da atualização do pagamento.', example: '2023-10-27T10:00:00Z' },
          email_address: { type: 'string', format: 'email', description: 'Email do pagador (se fornecido pelo gateway).', example: 'pagador@email.com' }
      }
 },
 OrderOutput: { // Schema principal para a resposta do pedido
     type: 'object',
     description: 'Representa um pedido realizado.',
     properties: {
         _id: { type: 'string', format: 'objectid', example: '6a02c...' },
         user: { 
             oneOf: [
                 { type: 'string', format: 'objectid' },
                 { $ref: '#/components/schemas/UserOutput' }
             ],
            description: 'ID ou detalhes do usuário que fez o pedido.'
         },
         orderItems: {
             type: 'array',
             items: { $ref: '#/components/schemas/OrderItemOutput' }
         },
         shippingAddress: {
             $ref: '#/components/schemas/OrderShippingAddressOutput'
         },
         paymentMethod: { type: 'string', example: 'PIX' },
         paymentResult: {
             $ref: '#/components/schemas/OrderPaymentResultOutput'
         },
         itemsPrice: { type: 'number', format: 'float', example: 1649.99 },
         shippingPrice: { type: 'number', format: 'float', example: 10.00 },
         totalPrice: { type: 'number', format: 'float', example: 1659.99 },
         orderStatus: {
             type: 'string',
             enum: ['pending_payment', 'failed', 'processing', 'shipped', 'delivered', 'cancelled'],
             example: 'processing'
         },
         paidAt: { type: 'string', format: 'date-time', nullable: true },
         deliveredAt: { type: 'string', format: 'date-time', nullable: true },
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
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);  
app.use('/api/webhooks', webhookRoutes);
app.use('/api-docs', swaggerUI.serve, swaggerUI.setup(swaggerJSDoc(options)));

// Middleware de Erro GLOBAL
app.use(globalErrorHandler); 

export default app; 
