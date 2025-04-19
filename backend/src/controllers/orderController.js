//src/controllers/orderController.js
import Order from '../models/Order.js';
import Cart from '../models/Cart.js';
import Product from '../models/Product.js';
import Address from '../models/Address.js';
import AppError from '../utils/appError.js';
import { validationResult } from 'express-validator';
import mongoose from 'mongoose'; 

// --- Criar um Novo Pedido ---
export const createOrder = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { shippingAddressId, paymentMethod } = req.body;
    const userId = req.user.id;

    // --- Iniciar Transação ---
    const isTestEnv = process.env.NODE_ENV === 'test';
    let session = null; 
    if (!isTestEnv) { 
        session = await mongoose.startSession();
        session.startTransaction();
        console.log("INFO: Iniciando transação MongoDB."); 
    }

    try {
        // --- Operações do DB agora usam 'session' apenas se não for teste ---
        const sessionOptions = session ? { session } : {};
        // 1. Buscar Carrinho e popular produtos
        const cart = await Cart.findOne({ user: userId }).populate('items.product').setOptions(sessionOptions); 
        if (!cart || cart.items.length === 0) {
            // Abortar/Encerrar sessão apenas se ela foi iniciada
            if (session) { await session.abortTransaction(); session.endSession(); }
            return next(new AppError('Seu carrinho está vazio...', 400));
        }

        // 2. Buscar Endereço de Entrega e verificar propriedade
        const shippingAddress = await Address.findOne({ _id: shippingAddressId, user: userId }).setOptions(sessionOptions); 
        if (!shippingAddress) {
             if (session) { await session.abortTransaction(); session.endSession(); }
             return next(new AppError('Endereço de entrega inválido...', 400));
        }

        // 3. Calcular Preços e Preparar Itens do Pedido + Verificar Estoque
        let itemsPrice = 0;
        const orderItems = [];
        const stockErrors = []; 
        console.log("DEBUG: Iniciando verificação de itens do carrinho...");

        for (const item of cart.items) {
            console.log(`DEBUG: Verificando item - Produto ID: ${item.product?._id}, Qtd: ${item.quantity}`);
            const product = item.product; 
            if (!product) { 
                console.error(`ERRO: Produto não encontrado no item do carrinho: ${item.product}`);
                stockErrors.push(`Produto com ID ${item.product} não encontrado.`);
                 continue;
            }
            console.log(`DEBUG: Produto encontrado - Nome: ${product.name}, Estoque: ${product.stock}`);

            // Verificar estoque ANTES de adicionar ao pedido
            if (product.stock < item.quantity) {
                console.warn(`AVISO: Estoque insuficiente detectado para ${product.name}`);
                stockErrors.push(`Estoque insuficiente para ${product.name} (Disponível: ${product.stock}, Solicitado: ${item.quantity}).`);
            }else { 
                console.log(`DEBUG: Adicionando ${product.name} aos orderItems.`);
                itemsPrice += item.quantity * product.price;
                orderItems.push({
                    productId: product._id,
                    name: product.name,
                    quantity: item.quantity,
                    price: product.price,
                    image: product.image
                });
            }
        }
        console.log("DEBUG: Verificação de itens concluída. Erros de estoque:", stockErrors);
        console.log("DEBUG: orderItems montado:", JSON.stringify(orderItems, null, 2));

        // Se houve erros de estoque, abortar
        if (stockErrors.length > 0) {
            console.log("DEBUG: Abortando transação devido a erros de estoque.");
            if (session) { await session.abortTransaction(); session.endSession(); }
            return next(new AppError(`Problemas de estoque: ${stockErrors.join('; ')}`, 400));
        }


        // 4. Calcular Frete (Exemplo simples - Lógica real pode ser complexa)
        const shippingPrice = itemsPrice > 100 ? 0 : 10; 
        const totalPrice = itemsPrice + shippingPrice;

        // 5. Criar o Pedido
        const orderData = {
            user: userId,
            orderItems,
            shippingAddress: { 
                label: shippingAddress.label,
                street: shippingAddress.street,
                number: shippingAddress.number,
                complement: shippingAddress.complement,
                neighborhood: shippingAddress.neighborhood,
                city: shippingAddress.city,
                state: shippingAddress.state,
                postalCode: shippingAddress.postalCode,
                country: shippingAddress.country,
                phone: shippingAddress.phone
            },
            paymentMethod,
            itemsPrice: parseFloat(itemsPrice.toFixed(2)),
            shippingPrice: parseFloat(shippingPrice.toFixed(2)),
            totalPrice: parseFloat(totalPrice.toFixed(2)),
            orderStatus: 'pending_payment' 
        };

        console.log("DEBUG: Dados do pedido ANTES de Order.create:", JSON.stringify(orderData, null, 2));

        const createdOrderArray = await Order.create([orderData], sessionOptions);
        const createdOrder = createdOrderArray[0]; 

        // 6. Decrementar Estoque dos Produtos 
        console.log("DEBUG: Decrementando estoque...");
        for (const item of createdOrder.orderItems) {
            console.log(`DEBUG: Decrementando ${item.quantity} do estoque do produto ${item.name} (${item.productId})`);
            await Product.findByIdAndUpdate(
                item.productId,
                { $inc: { stock: -item.quantity } },
                sessionOptions // Passa opções
            );
        }

        // 7. Limpar o Carrinho do Usuário
        console.log("DEBUG: Limpando carrinho...");
        cart.items = [];
        await cart.save(sessionOptions); 

        // 8. Commit da Transação
        if (session) {
            await session.commitTransaction();
            session.endSession();
            console.log("INFO: Transação MongoDB commitada.");
        }

        // 9. Retornar o Pedido Criado
        res.status(201).json({
            status: 'success',
            data: {
                order: createdOrder
            }
        });

    } catch (err) {
        if (session) {
            try { 
                 await session.abortTransaction();
                 session.endSession();
                 console.log("INFO: Transação MongoDB abortada devido a erro.");
            } catch (abortErr) {
                 console.error("Erro ao abortar transação:", abortErr);
            }
        }
        console.error("Erro ao criar pedido:", err);
        next(new AppError('Não foi possível criar o pedido...', 500));
    }
};


// --- Listar Pedidos do Usuário Logado ---
export const getMyOrders = async (req, res, next) => {
    try {
        const userId = req.user.id;
        // Busca os pedidos do usuário, ordenados do mais recente para o mais antigo
        const orders = await Order.find({ user: userId }).sort('-createdAt');

        res.status(200).json({
            status: 'success',
            results: orders.length,
            data: {
                orders
            }
        });
    } catch (err) {
        next(err);
    }
};

// --- Obter um Pedido Específico por ID ---
export const getOrderById = async (req, res, next) => {
    // Validação do ID feita na rota
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const orderId = req.params.id;
        const userId = req.user.id;
        const userRole = req.user.role;

        let query = {};
        // Admin pode ver qualquer pedido, usuário normal só pode ver os seus
        if (userRole === 'admin') {
            query = { _id: orderId };
        } else {
            query = { _id: orderId, user: userId };
        }

        // Busca o pedido. Pode popular o usuário se quiser mostrar nome/email.
        const order = await Order.findOne(query).populate('user', 'name email');

        if (!order) {
            // Mensagem genérica para não vazar informação se o pedido existe mas não é do usuário
            return next(new AppError('Pedido não encontrado.', 404));
        }

        res.status(200).json({
            status: 'success',
            data: {
                order
            }
        });

    } catch (err) {
        if (err.name === 'CastError') {
            return next(new AppError(`ID de pedido inválido: ${req.params.id}`, 400));
        }
        next(err);
    }
};

// --- Funções Futuras (Exemplos) ---
// export const updateOrderStatus = async (req, res, next) => { /* ... Lógica Admin ... */ };
// export const markOrderAsPaid = async (req, res, next) => { /* ... Chamado pelo Webhook ou Admin ... */ };
// export const markOrderAsDelivered = async (req, res, next) => { /* ... Lógica Admin ... */ };