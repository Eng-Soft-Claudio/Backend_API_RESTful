//src/app.js
import express from 'express';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/usersRoutes.js';
import productRoutes from './routes/productsRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import addressRoutes from './routes/addressRoutes.js';
import cartRoutes from './routes/cartRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import router from './routes/webhooksRoutes.js';
import swaggerUI from 'swagger-ui-express';
import swaggerJSDoc from 'swagger-jsdoc';
import { apiLimiter, corsOptions } from './config/security.js';
import cors from 'cors';
import globalErrorHandler from './middleware/errorHandler.js';
import configRoutes from './routes/configRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';

// .env
dotenv.config();

// Declaração de Constantes
const app = express();
app.set('trust proxy', 1);

// --- Configuração do Swagger/OpenAPI ---
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'API de E-commerce',
            version: '1.0.0',
            description: 'API RESTful base para funcionalidades de e-commerce.',
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
                // --- Usuários ---
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
                // --- Categorias ---
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
                // --- Produtos ---
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
                // --- Endereços ---
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
                // --- Carrinho de Compras ---
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
                            example: '6901b...',
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
                // --- Pedidos ---
                OrderInput: {
                    type: 'object',
                    required: ['shippingAddressId', 'paymentMethod'],
                    properties: {
                        shippingAddressId: { type: 'string', format: 'objectid', description: 'ID do endereço de entrega cadastrado.' },
                        paymentMethod: { type: 'string', example: 'Cartão de Crédito', description: 'Método de pagamento escolhido inicialmente.' }
                    }
                },
                OrderPaymentInput: {
                    type: 'object',
                    description: 'Dados necessários para processar o pagamento via API MP, geralmente obtidos do SDK JS V2.',
                    required: ['token', 'payment_method_id', 'installments', 'payer'],
                    properties: {
                        token: {
                            type: 'string',
                            description: "Card Token (gerado pelo SDK JS para cartões) ou identificador similar para outros métodos.",
                            example: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
                        },
                        payment_method_id: {
                            type: 'string',
                            description: "ID do método de pagamento escolhido no frontend (ex: 'visa', 'master', 'pix', 'bolbradesco').",
                            example: "visa"
                        },
                        issuer_id: {
                            type: 'string',
                            description: "ID do banco emissor (geralmente necessário para cartões de débito/crédito, obtido do SDK JS).",
                            example: "24"
                        },
                        installments: {
                            type: 'integer',
                            description: 'Número de parcelas escolhido pelo usuário (mínimo 1).',
                            example: 1,
                            minimum: 1
                        },
                        payer: {
                            type: 'object',
                            description: 'Informações do pagador (alguns campos podem ser obrigatórios pelo MP).',
                            required: ['email'],
                            properties: {
                                email: { type: 'string', format: 'email', description: 'Email do pagador (obrigatório).', example: 'comprador@email.com' },
                                identification: {
                                    type: 'object',
                                    description: 'Identificação (CPF/CNPJ) do pagador (obrigatório para alguns métodos/países).',
                                    properties: {
                                        type: { type: 'string', description: "Tipo de documento ('CPF' ou 'CNPJ').", example: 'CPF' },
                                        number: { type: 'string', description: "Número do documento.", example: '12345678900' }
                                    }
                                }
                                // Poderia adicionar first_name, last_name se necessário/coletado
                            }
                        }
                    }
                },
                OrderItemOutput: {
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
                OrderShippingAddressOutput: {
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
                OrderPaymentResultOutput: {
                    type: 'object',
                    nullable: true,
                    description: 'Detalhes do resultado do pagamento (se aplicável).',
                    properties: {
                        id: { type: 'string', description: 'ID da transação no gateway.', example: 'pi_123...' },
                        status: { type: 'string', description: 'Status do pagamento no gateway.', example: 'succeeded' },
                        update_time: { type: 'string', description: 'Timestamp da atualização do pagamento.', example: '2023-10-27T10:00:00Z' },
                        email_address: { type: 'string', format: 'email', description: 'Email do pagador (se fornecido pelo gateway).', example: 'pagador@email.com' },
                        card_brand: { type: 'string', nullable: true, description: 'Bandeira do cartão ou método (ex: visa, master, pix)', example: 'visa' },
                        card_last_four: { type: 'string', nullable: true, description: 'Últimos 4 dígitos do cartão (se aplicável)', example: '1234' }
                    }
                },
                OrderOutput: {
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
                        installments: { type: 'integer', description: 'Número de parcelas.', example: 1, default: 1 },
                        totalPrice: { type: 'number', format: 'float', example: 1659.99 },
                        orderStatus: {
                            type: 'string',
                            enum: ['pending_payment', 'failed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
                            example: 'processing'
                        },
                        paidAt: { type: 'string', format: 'date-time', nullable: true },
                        deliveredAt: { type: 'string', format: 'date-time', nullable: true },
                        createdAt: { type: 'string', format: 'date-time' },
                        updatedAt: { type: 'string', format: 'date-time' },
                    }
                },
                // --- Avaliações ---
                ReviewInput: {
                    type: 'object',
                    required: ['rating'],
                    properties: {
                        rating: {
                            type: 'integer',
                            minimum: 1,
                            maximum: 5,
                            description: 'Nota da avaliação (1 a 5 estrelas).',
                            example: 5
                        },
                        comment: {
                            type: 'string',
                            maxLength: 1000,
                            description: 'Comentário textual (opcional).',
                            example: 'Excelente produto!'
                        }
                    }
                },
                ReviewOutput: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string', format: 'objectid' },
                        user: { type: 'string', format: 'objectid', description: "ID do usuário que fez a avaliação." },
                        name: { type: 'string', description: "Nome do usuário.", example: "João Silva" },
                        product: { type: 'string', format: 'objectid', description: "ID do produto avaliado." },
                        rating: { type: 'integer', minimum: 1, maximum: 5, example: 5 },
                        comment: { type: 'string', example: "Excelente produto!" },
                        createdAt: { type: 'string', format: 'date-time' },
                        updatedAt: { type: 'string', format: 'date-time' }
                    }
                },
                ReviewListOutput: {
                    type: 'object',
                    properties: {
                        status: { type: 'string', example: 'success' },
                        results: { type: 'integer', example: 5 },
                        pagination: {
                            type: 'object',
                            properties: {
                                totalReviews: { type: 'integer', example: 25 },
                                totalPages: { type: 'integer', example: 3 },
                                currentPage: { type: 'integer', example: 1 },
                                limit: { type: 'integer', example: 10 }
                            }
                        },
                        data: {
                            type: 'object',
                            properties: {
                                reviews: {
                                    type: 'array',
                                    items: { $ref: '#/components/schemas/ReviewOutput' }
                                }
                            }
                        }
                    }
                },
                // --- Respostas Genéricas ---
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
                },
                // --- Webhooks ---
                WebhookInput: {
                    type: 'object',
                    properties: {
                        type: { type: 'string', description: 'Tipo do evento (ex: payment)' },
                        action: { type: 'string', description: 'Ação do evento (ex: payment.created)' },
                        data: { type: 'object', properties: { id: { type: 'string' } } }
                        // ... outros campos dependendo do serviço ...
                    }
                },
                WebhookResponse: {
                    type: 'object',
                    properties: {
                        received: { type: 'boolean', example: true },
                        message: { type: 'string', example: 'Event processed.', nullable: true }
                    }
                },
                // --- Configurações ---
                MpPublicKeyOutput: {
                    type: 'object',
                    properties: {
                        publicKey: { type: 'string', example: 'TEST-ea4bed3f-...' }
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
            },
            // Parâmetros Reutilizáveis
            parameters: {
                UserIdParam: {
                    in: 'path',
                    name: 'id',
                    required: true,
                    schema: { type: 'string', format: 'objectid' },
                    description: 'O ID MongoDB do usuário.',
                    example: '68015a91320b9fa9419079be'
                },
                ProductIdParam: {
                    in: 'path',
                    name: 'id', 
                    required: true,
                    schema: { type: 'string', format: 'objectid' },
                    description: 'O ID MongoDB do produto.',
                    example: '6701a...'
                },
                CategoryIdParam: {
                    in: 'path',
                    name: 'id',
                    required: true,
                    schema: { type: 'string', format: 'objectid' },
                    description: 'O ID MongoDB da categoria.',
                    example: '68013...'
                },
                AddressIdParam: {
                    in: 'path',
                    name: 'id',
                    required: true,
                    schema: { type: 'string', format: 'objectid' },
                    description: 'O ID MongoDB do endereço.',
                    example: '6901b...'
                },
                OrderIdParam: {
                    in: 'path',
                    name: 'id',
                    required: true,
                    schema: { type: 'string', format: 'objectid' },
                    description: 'O ID MongoDB do pedido.',
                    example: '6a02c...'
                },
                ReviewIdParam: {
                    in: 'path',
                    name: 'reviewId',
                    required: true,
                    schema: { type: 'string', format: 'objectid' },
                    description: 'O ID MongoDB da avaliação.',
                    example: '6b03d...'
                }
            },
        },
    },
    apis: ['.src/routes/*.js'],
};

// --- Middlewares ---
app.use(cors(corsOptions));
app.use('/api/', apiLimiter);

// --- Rota do Webhook ---
app.use('/api/webhooks', router);

// --- Body parsers globais ---
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: true, limit: '20kb' }));

// --- Montagem das Rotas ---
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/config', configRoutes);

// --- Rota Swagger ---
app.use('/api-docs', swaggerUI.serve, swaggerUI.setup(swaggerJSDoc(swaggerOptions)));

// --- Middleware de Erro Global ---
app.use(globalErrorHandler);

export default app;


