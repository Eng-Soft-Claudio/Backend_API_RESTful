//src/controllers/orderController.js
import Order from '../models/Order.js';
import Cart from '../models/Cart.js';
import Product from '../models/Product.js';
import Address from '../models/Address.js';
import AppError from '../utils/appError.js';
import { validationResult } from 'express-validator';
import mongoose from 'mongoose';
import mpClient, { Payment, isMercadoPagoConfigured } from '../config/mercadopago.js';
import User from '../models/User.js';

// --- FUNÇÃO AUXILIAR PARA RETORNAR ESTOQUE ---
async function returnStockForOrderItems(orderItems, sessionOptions = {}) {
    if (!orderItems || orderItems.length === 0) {
        return;
    }
    console.log(`Tentando retornar estoque para ${orderItems.length} itens.`);
    try {
        const stockUpdates = orderItems.map(item => ({
            updateOne: {
                filter: { _id: item.productId },
                // Apenas incrementa o estoque
                update: { $inc: { stock: item.quantity } },
            }
        }));
        // Executa todas as atualizações de estoque em lote
        await Product.bulkWrite(stockUpdates, sessionOptions);
        console.log(`Estoque retornado com sucesso para ${orderItems.length} itens.`);
    } catch (stockErr) {
        console.error("!!! ERRO CRÍTICO AO RETORNAR ESTOQUE !!!:", stockErr);
        // Considerar adicionar a um log/fila para retentativa manual/automática
    }
}

/**
 * @description Cria um novo pedido com status 'pending_payment'.
 *              Não interage mais com o gateway de pagamento nesta etapa.
 * @route POST /api/orders
 * @access Usuário Logado
 */
export const createOrder = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { return res.status(400).json({ errors: errors.array() }); }

    const { shippingAddressId, paymentMethod } = req.body;
    const userId = req.user.id;

    const isTestEnv = process.env.NODE_ENV === 'test';
    let session = null;
    if (!isTestEnv) {
        session = await mongoose.startSession();
        session.startTransaction();
    }
    const sessionOptions = session ? { session } : {};

    try {
        const cart = await Cart.findOne({ user: userId }).populate('items.product').setOptions(sessionOptions);

        if (!cart) {
            if (session) { await session.abortTransaction(); session.endSession(); }
            return next(new AppError('Carrinho não encontrado.', 404));
        }
        if (cart.items.length === 0) {
            if (session) { await session.abortTransaction(); session.endSession(); }
            return next(new AppError('Seu carrinho está vazio...', 400));
        }

        const shippingAddress = await Address.findOne({ _id: shippingAddressId, user: userId }).setOptions(sessionOptions);
        if (!shippingAddress) { /* ... erro endereço inválido ... */ }

        let itemsPrice = 0;
        const orderItems = [];
        const stockErrors = [];

        for (const item of cart.items) {
            const product = item.product;
            if (!product) { /* ... erro produto não encontrado ... */ continue; }
            if (product.stock < item.quantity) {
                stockErrors.push(`Estoque insuficiente para ${product.name} (Disponível: ${product.stock}, Solicitado: ${item.quantity}).`);
            }
            else {
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

        if (stockErrors.length > 0) {
            if (session) { await session.abortTransaction(); session.endSession(); }
            return next(new AppError(`Problemas de estoque: ${stockErrors.join('; ')}`, 400));
        }

        if (orderItems.length === 0) {
            if (session) { await session.abortTransaction(); session.endSession(); }
            return next(new AppError('Nenhum item válido para criar o pedido devido a problemas de estoque.', 400));
        }

        const shippingPrice = itemsPrice > 100 ? 0 : 10;
        const totalPrice = itemsPrice + shippingPrice;

        const orderData = {
            user: userId,
            orderItems,
            shippingAddress: {
                label: shippingAddress?.label,
                street: shippingAddress?.street,
                number: shippingAddress?.number,
                complement: shippingAddress?.complement,
                neighborhood: shippingAddress?.neighborhood,
                city: shippingAddress?.city,
                state: shippingAddress?.state,
                postalCode: shippingAddress?.postalCode,
                country: shippingAddress?.country,
                phone: shippingAddress?.phone
            },
            paymentMethod,
            itemsPrice: parseFloat(itemsPrice.toFixed(2)),
            shippingPrice: parseFloat(shippingPrice.toFixed(2)),
            totalPrice: parseFloat(totalPrice.toFixed(2)),
            orderStatus: 'pending_payment',
            installments: 1
        };

        const createdOrderArray = await Order.create([orderData], sessionOptions);
        const createdOrder = createdOrderArray[0];

        // --- Decrementar Estoque ---
        for (const item of createdOrder.orderItems) {
            await Product.findByIdAndUpdate(item.productId, { $inc: { stock: -item.quantity } }, sessionOptions);
            const productUpdateResult = await Product.findByIdAndUpdate(
                item.productId,
                { $inc: { stock: -item.quantity } },
                { ...sessionOptions, new: true }
            );
            if (!productUpdateResult) throw new Error(`Produto ${item.productId} não encontrado durante decremento de estoque.`);
            if (productUpdateResult.stock < 0) throw new Error(`Estoque negativo para ${item.productId} após decremento.`);
        }

        // --- Limpar o Carrinho ---
        cart.items = [];
        await cart.save(sessionOptions);

        // --- Commit da Transação ---
        if (session) { await session.commitTransaction(); session.endSession(); }

        // --- Resposta ---
        res.status(201).json({
            status: 'success',
            data: {
                order: createdOrder
            }
        });

    } catch (err) {
        // --- Rollback da Transação ---
        if (session) {
            try { await session.abortTransaction(); session.endSession(); } catch (abortErr) { console.error("Erro ao abortar transação:", abortErr); }
        }
        console.error("Erro ao criar pedido:", err);
        next(err);
    }
};


/**
 * @description Processa o pagamento de um pedido usando dados tokenizados do frontend.
 * @route POST /api/orders/:id/pay
 * @access Usuário Logado
 */
export const payOrder = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { return res.status(400).json({ errors: errors.array() }); }

    const orderId = req.params.id;
    const userId = req.user.id;
    const { token, payment_method_id, issuer_id, installments, payer } = req.body;

    let order;

    try {
        if (!isMercadoPagoConfigured() || !mpClient) { /* ... erro config SDK ... */ }

        order = await Order.findOne({ _id: orderId, user: userId });
        if (!order) { return next(new AppError('Pedido não encontrado ou não pertence a você.', 404)); }
        if (order.orderStatus !== 'pending_payment') { return next(new AppError(`Pedido não pode ser pago (Status: ${order.orderStatus}).`, 400)); }
        if (order.mercadopagoPaymentId) {
            return next(new AppError(`Pagamento para este pedido já foi iniciado ou processado.`, 400));
        }

        // --- Interação com Mercado Pago ---
        const paymentData = {
            transaction_amount: 'string',
            token: 'string',
            description: 'string',
            installments: number,
            payment_method_id: 'string',
            issuer_id: 'string' || null,
            payer: {
              email: 'string',
              identification: {
                type: 'string',
                number: 'string'
              }
            }
          };
        const payment = new Payment(mpClient);
        const mpResponse = await payment.create({ body: paymentData });

        // --- Processamento da Resposta Síncrona MP ---
        if (!mpResponse || !mpResponse.id || !mpResponse.status) {
            return next(new AppError('Falha ao processar pagamento junto ao Mercado Pago (resposta inválida).', 502));
        }

        // --- Atualizar pedido com dados do MP ---
        order.mercadopagoPaymentId = mpResponse.id.toString();
        order.paymentResult = { /* ... preencher com dados mpResponse ... */ };
        order.installments = mpResponse.installments || 1;

        const paymentFailed = ['rejected', 'cancelled', 'failed', 'charged_back'].includes(mpResponse.status);

        // --- Atualiza status do pedido local ---
        if (mpResponse.status === 'approved') {
            order.orderStatus = 'processing'; // Ou 'paid' dependendo da regra de negócio
            order.paidAt = new Date();
        } else if (paymentFailed) {
            order.orderStatus = 'failed';
            // ----> INÍCIO: Lógica para retornar estoque em caso de falha SÍNCRONA <----
            console.log(`Pagamento SÍNCRONO falhou para pedido ${order._id} (Status MP: ${mpResponse.status}). Tentando retornar estoque...`);
            await returnStockForOrderItems(order.orderItems);
            order.paymentResult.status = mpResponse.status;
        }

        await order.save();

        res.status(200).json({
            status: 'success',
            message: `Pagamento processado com status: ${mpResponse.status}`,
            data: {
                order: order
            }
        });

    } catch (err) {
        console.error(`Erro no processamento de pagamento para pedido ${orderId}:`, err);
        let message = 'Falha ao processar o pagamento.';
        const mpErrorMessage = err.cause?.error?.message || err.error?.message;
        if (mpErrorMessage) { message = `Erro do Mercado Pago: ${mpErrorMessage}`; }
        else if (err.message) { message = err.message; }
        next(new AppError(message, err.statusCode || 500));
    }
};

/**
 * @description Lista os pedidos de um usuário logado.
 * @route POST /api/orders/:id/getMyOrders
 * @access Usuário Logado
 */
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

/**
 * @description Obter um pedido específico po ID.
 * @route POST /api/orders/:id/getOrderById
 * @access Usuário Logado
 */
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

export { returnStockForOrderItems };