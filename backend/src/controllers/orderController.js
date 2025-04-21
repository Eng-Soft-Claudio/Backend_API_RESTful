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
        if (!cart || cart.items.length === 0) { /* ... erro carrinho vazio ... */ }

        const shippingAddress = await Address.findOne({ _id: shippingAddressId, user: userId }).setOptions(sessionOptions);
        if (!shippingAddress) { /* ... erro endereço inválido ... */ }

        let itemsPrice = 0;
        const orderItems = [];
        const stockErrors = [];

        for (const item of cart.items) {
            const product = item.product;
            if (!product) { /* ... erro produto não encontrado ... */ continue; }
            if (product.stock < item.quantity) { stockErrors.push(/*...*/); }
            else {
                itemsPrice += item.quantity * product.price;
                orderItems.push({ /* ... dados do item ... */ });
            }
        }

        if (stockErrors.length > 0) { /* ... erro estoque insuficiente ... */ }

        const shippingPrice = itemsPrice > 100 ? 0 : 10;
        const totalPrice = itemsPrice + shippingPrice;

        const orderData = {
            user: userId,
            orderItems,
            shippingAddress: { /* ... copia endereço ... */ },
            paymentMethod,
            itemsPrice: parseFloat(itemsPrice.toFixed(2)),
            shippingPrice: parseFloat(shippingPrice.toFixed(2)),
            totalPrice: parseFloat(totalPrice.toFixed(2)),
            orderStatus: 'pending_payment',
            installments: 1
        };

        const createdOrderArray = await Order.create([orderData], sessionOptions);
        const createdOrder = createdOrderArray[0];

        // Decrementar Estoque (Mantém aqui)
        for (const item of createdOrder.orderItems) {
            await Product.findByIdAndUpdate(item.productId, { $inc: { stock: -item.quantity } }, sessionOptions);
        }

        // Limpar o Carrinho (Mantém aqui)
        cart.items = [];
        await cart.save(sessionOptions);

        if (session) { await session.commitTransaction(); session.endSession(); }

        // Retorna o pedido criado (frontend usará o ID para iniciar o pagamento)
        res.status(201).json({
            status: 'success',
            data: {
                order: createdOrder
            }
        });

    } catch (err) {
        if (session) { /* ... abort transaction ... */ }
        console.error("Erro ao criar pedido:", err);
        next(new AppError('Não foi possível criar o pedido...', 500));
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
    // Dados recebidos do frontend (SDK JS V2 do MP)
    const { token, payment_method_id, issuer_id, installments, payer } = req.body;

    try {
        if (!isMercadoPagoConfigured() || !mpClient) { /* ... erro config SDK ... */ }

        const order = await Order.findOne({ _id: orderId, user: userId });
        if (!order) { return next(new AppError('Pedido não encontrado ou não pertence a você.', 404)); }
        if (order.orderStatus !== 'pending_payment') { return next(new AppError(`Pedido não pode ser pago (Status: ${order.orderStatus}).`, 400)); }

        // Montar corpo para a API de Pagamentos V1 do MP
        const paymentData = {
            transaction_amount: order.totalPrice,
            token: token, // O cardToken gerado pelo frontend SDK
            description: `Pedido #${order._id.toString().slice(-6)} - E-commerce`,
            installments: installments, // Número de parcelas escolhido no frontend
            payment_method_id: payment_method_id, // Ex: 'visa', 'master', 'pix', 'bolbradesco'
            issuer_id: issuer_id, // Necessário para alguns cartões
            payer: { // Informações do pagador (email é essencial, outras podem ser necessárias)
                email: payer.email,
                // Enviar identificação (CPF/CNPJ) se coletado no frontend e exigido
                // identification: { type: payer.identification?.type, number: payer.identification?.number }
            },
            external_reference: order._id.toString(),
            notification_url: process.env.MERCADOPAGO_WEBHOOK_URL
        };

        console.log("DEBUG: Enviando dados de pagamento para API MP:", paymentData);

        const payment = new Payment(mpClient);
        const mpResponse = await payment.create({ body: paymentData }); // Usa a instância correta

        console.log("DEBUG: Resposta síncrona da API de Pagamento MP:", mpResponse);

        // Analisar a resposta SÍNCRONA do MP
        if (!mpResponse || !mpResponse.id || !mpResponse.status) {
            console.error("ERRO: Resposta inesperada da API de Pagamento MP:", mpResponse);
            return next(new AppError('Falha ao processar pagamento junto ao Mercado Pago (resposta inválida).', 502));
        }

        // Atualizar pedido com base na resposta síncrona
        order.mercadopagoPaymentId = mpResponse.id.toString();
        order.paymentResult = {
            id: mpResponse.id.toString(),
            status: mpResponse.status, // Status síncrono (pode ser 'approved', 'rejected', 'in_process')
            update_time: mpResponse.date_last_updated || new Date().toISOString(),
            email_address: mpResponse.payer?.email || null,
            card_brand: mpResponse.payment_method_id, // Salva a bandeira/método
            card_last_four: mpResponse.card?.last_four_digits || null // Salva últimos 4 digitos se cartão
        };
        order.installments = mpResponse.installments || 1; // Salva parcelas

        // Atualiza status do pedido local
        if (mpResponse.status === 'approved') {
            order.orderStatus = 'processing'; // Ou 'paid'
            order.paidAt = new Date();
        } else if (['rejected', 'cancelled', 'failed', 'charged_back'].includes(mpResponse.status)) {
            order.orderStatus = 'failed';
            // Considerar retornar estoque aqui se o pagamento for rejeitado imediatamente?
        } else {
            // Mantém 'pending_payment' para status como 'in_process' ou 'pending'
            // O webhook confirmará o resultado final depois.
            console.log(`Pagamento ${mpResponse.id} com status ${mpResponse.status}. Aguardando confirmação final via webhook.`);
        }

        await order.save();

        // Retorna sucesso para o frontend, incluindo o status atual do pedido/pagamento
        res.status(200).json({
            status: 'success',
            message: `Pagamento processado com status: ${mpResponse.status}`,
            data: {
                order: order // Retorna o pedido atualizado
            }
        });

    } catch (err) {
        console.error("Erro ao processar pagamento:", err?.cause || err.error || err);
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