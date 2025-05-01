//src/controllers/orderController.js
import Order from "../models/Order.js";
import Cart from "../models/Cart.js";
import Product from "../models/Product.js";
import Address from "../models/Address.js";
import AppError from "../utils/appError.js";
import { validationResult } from "express-validator";
import mongoose from "mongoose";
import mpClient, {
  Payment,
  isMercadoPagoConfigured,
} from "../config/mercadopago.js";

// --- FUNÇÃO AUXILIAR PARA RETORNAR ESTOQUE ---
async function returnStockForOrderItems(orderItems, sessionOptions = {}) {
  if (!orderItems || orderItems.length === 0) {
    return;
  }
  try {
    const stockUpdates = orderItems
      .map((item) => {
        if (!item.productId || !item.quantity || item.quantity <= 0) {
          return null;
        }
        return {
          updateOne: {
            filter: { _id: item.productId },
            update: { $inc: { stock: item.quantity } },
          },
        };
      })
      .filter(Boolean);

    if (stockUpdates.length === 0) {
      return;
    }
  } catch (stockErr) {
    console.error(
      "[Stock Return] !!! ERRO CRÍTICO AO RETORNAR ESTOQUE !!!:",
      stockErr
    );
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
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { shippingAddressId, paymentMethod } = req.body;
  const userId = req.user.id;

  const isTestEnv = process.env.NODE_ENV === "test";
  let session = null;

  try {
    // Iniciar sessão apenas se não for teste
    if (process.env.NODE_ENV !== "test") {
      session = await mongoose.startSession();
      session.startTransaction();
    }
    const sessionOptions = session ? { session } : {};

    // 1. Buscar Carrinho e Endereço (dentro da transação)
    const cart = await Cart.findOne({ user: userId })
      .populate("items.product", "_id")
      .setOptions(sessionOptions);
    const shippingAddress = await Address.findOne({
      _id: shippingAddressId,
      user: userId,
    })
      .setOptions(sessionOptions)
      .lean();

    // 2. Validar Carrinho e Endereço
    if (!cart) {
      throw new AppError("Carrinho não encontrado.", 404);
    }
    if (cart.items.length === 0) {
      throw new AppError("Seu carrinho está vazio.", 400);
    }
    if (!shippingAddress) {
      throw new AppError(
        "Endereço de entrega inválido ou não pertence a você.",
        400
      );
    }

    // 3. Verificar Estoque e Preparar Itens do Pedido
    let itemsPrice = 0;
    const orderItems = [];
    const stockErrors = [];
    const productIdsInCart = cart.items.map((item) => item.product._id);
    const productsInCart = await Product.find({
      _id: { $in: productIdsInCart },
    })
      .select("stock name price image")
      .setOptions(sessionOptions);
    const productMap = new Map(
      productsInCart.map((p) => [p._id.toString(), p])
    );

    for (const item of cart.items) {
      const productIdString = item.product._id.toString();
      const currentProductState = productMap.get(productIdString);

      if (!currentProductState) {
        // Este produto estava no carrinho mas não foi encontrado no DB (estado inconsistente?)
        stockErrors.push(
          `Produto com ID ${productIdString} não encontrado no banco de dados.`
        );
        continue; // Pula este item
      }

      if (currentProductState.stock < item.quantity) {
        stockErrors.push(
          `Estoque insuficiente para ${currentProductState.name} (Disponível: ${currentProductState.stock}, Solicitado: ${item.quantity}).`
        );
      } else {
        const itemPrice = item.quantity * currentProductState.price;
        itemsPrice += itemPrice;
        orderItems.push({
          productId: currentProductState._id,
          name: currentProductState.name,
          quantity: item.quantity,
          price: currentProductState.price,
          image: currentProductState.image,
        });
      }
    }

    // 4. Abortar se Houver Erros de Estoque
    if (stockErrors.length > 0) {
      throw new AppError(
        `Problemas de estoque: ${stockErrors.join("; ")}`,
        400
      );
    }
    if (orderItems.length === 0) {
      throw new AppError("Nenhum item válido para criar o pedido.", 400);
    }

    // 5. Calcular Preços Finais
    const shippingPrice = itemsPrice > 100 ? 0 : 10;
    const totalPrice = itemsPrice + shippingPrice;

    // 6. Montar Dados do Pedido
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
        phone: shippingAddress.phone,
      },
      paymentMethod,
      itemsPrice: parseFloat(itemsPrice.toFixed(2)),
      shippingPrice: parseFloat(shippingPrice.toFixed(2)),
      totalPrice: parseFloat(totalPrice.toFixed(2)),
      orderStatus: "pending_payment",
      installments: 1,
    };

    // 7. Criar o Pedido (dentro da transação)
    const createdOrderArray = await Order.create([orderData], sessionOptions);
    const createdOrder = createdOrderArray[0];

    // 8. Decrementar Estoque (dentro da transação)
    for (const item of createdOrder.orderItems) {
      const productUpdateResult = await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { stock: -item.quantity } },
        { ...sessionOptions, new: true, runValidators: true }
      );
      if (!productUpdateResult)
        throw new Error(
          `Produto ${item.productId} não encontrado durante decremento.`
        );
      if (productUpdateResult.stock < 0)
        throw new Error(`Estoque negativo para ${item.productId}.`);
    }
    // 9. Limpar o Carrinho (dentro da transação)
    cart.items = [];
    await cart.save(sessionOptions);

    // 10. Commit da Transação (se não for teste)
    if (session) {
      await session.commitTransaction();
      session.endSession();
    }

    // 11. Resposta
    res.status(201).json({
      status: "success",
      data: {
        order: createdOrder,
      },
    });
  } catch (err) {
    // 12. Rollback em caso de erro
    if (session) {
      try {
        await session.abortTransaction();
      } catch (abortErr) {
      } finally {
        session.endSession();
      }
    }
    // Passa o erro para o global error handler
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
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const orderId = req.params.id;
  const userId = req.user.id;

  // Dados do corpo da requisição (SDK JS V2 do MP)
  const { token, payment_method_id, issuer_id, installments, payer } = req.body;

  let order;
  let mpResponse;
  let paymentApiCalled = false;

  try {
    // 1. Verificar Configuração do SDK
    if (!isMercadoPagoConfigured() || !mpClient) {
      throw new AppError(
        "Configuração do gateway de pagamento indisponível.",
        503
      );
    }

    // 2. Buscar Pedido e Validar Status
    order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) {
      return next(
        new AppError("Pedido não encontrado ou não pertence a você.", 404)
      );
    }
    if (order.orderStatus !== "pending_payment") {
      return next(
        new AppError(
          `Este pedido não está mais pendente de pagamento (Status: ${order.orderStatus}).`,
          400
        )
      );
    }
    // Adicionado verificação para evitar processar novamente se ID MP já existe
    if (order.mercadopagoPaymentId) {
      return next(
        new AppError(
          `Pagamento para este pedido (${orderId
            .toString()
            .slice(-4)}) já foi iniciado ou processado anteriormente.`,
          400
        )
      );
    }

    // 3. Montar Corpo para API de Pagamentos V1 do MP - CORRIGIDO
    const paymentPayload = {
      transaction_amount: order.totalPrice,
      token: token,
      description: `Pedido #${order._id.toString().slice(-6)} - Sua Loja`,
      installments: parseInt(installments) || 1,
      payment_method_id: payment_method_id,
      payer: {
        email: payer?.email,
        ...(payer?.identification &&
          payer?.identification.type &&
          payer?.identification.number && {
            identification: {
              type: payer.identification.type.toUpperCase(),
              number: payer.identification.number.replace(/\D/g, ""),
            },
          }),
      },
      // Incluir issuer_id se fornecido (importante para alguns cartões)
      ...(issuer_id && { issuer_id: issuer_id }),
      external_reference: order._id.toString(),
      notification_url: process.env.MERCADOPAGO_WEBHOOK_URL,
    };

    if (payment_method_id === "pix") {
      const expirationMinutes = 30; // Exemplo: 30 minutos para pagar
      const expirationDate = new Date(
        Date.now() + expirationMinutes * 60 * 1000
      );
      // Formato ISO 8601 com timezone (TZ) - Ajuste se MP esperar outro formato
      paymentPayload.date_of_expiration = expirationDate.toISOString();
    }
    // Adiciona campos específicos de Cartão (se vierem)
    else {
      paymentPayload.token = token; // Adiciona token se não for PIX
      paymentPayload.installments = parseInt(installments) || 1; // Adiciona parcelas se não for PIX
      if (issuer_id) paymentPayload.issuer_id = issuer_id; // Adiciona issuer_id se veio
    }

    console.log("Payload para API MP:", paymentPayload);

    // 4. Chamar API do Mercado Pago
    const paymentAPI = new Payment(mpClient);
    paymentApiCalled = true;
    mpResponse = await paymentAPI.create({ body: paymentPayload });

    // 5. Processar Resposta Síncrona MP
    if (!mpResponse || !mpResponse.id || !mpResponse.status) {
      // Se a resposta do MP for inválida, gerar erro, mas não retornar estoque ainda
      throw new AppError(
        "Falha ao processar pagamento: resposta inválida do gateway.",
        502
      );
    }

    // 6. Atualizar Pedido com dados do MP
    order.mercadopagoPaymentId = mpResponse.id.toString();
    order.paymentResult = {
      id: mpResponse.id?.toString() || null,
      status: mpResponse.status || null,
      update_time:
        mpResponse.date_last_updated ||
        mpResponse.date_created ||
        new Date().toISOString(),
      email_address: mpResponse.payer?.email || null,
      card_brand: mpResponse.payment_method_id || null,
      card_last_four: mpResponse.card?.last_four_digits || null,
    };
    order.installments = mpResponse.installments || order.installments;

    const paymentFailed = [
      "rejected",
      "cancelled",
      "failed",
      "charged_back",
    ].includes(mpResponse.status);
    let needsStockReturn = false;
    // Guarda o status ANTES de atualizar
    const previousStatus = order.orderStatus;

    // 7. Atualizar Status do Pedido Local e Retornar Estoque se Falhar
    if (
      mpResponse.status === "approved" ||
      mpResponse.status === "authorized"
    ) {
      order.orderStatus = "processing";
      order.paidAt = new Date();
    } else if (paymentFailed) {
      // ---- VERIFICAÇÃO IMPORTANTE ----
      if (order.orderStatus === "pending_payment") {
        order.orderStatus = "failed";
        needsStockReturn = true;
      }
      if (order.paymentResult) order.paymentResult.status = mpResponse.status;
    }

    // 8. Salvar o Pedido Atualizado
    await order.save();

    // 9. Retorno de estoque
    if (needsStockReturn) {
      // <<< LOG ANTES DE RETORNAR >>>
      const stockBeforeReturn = await Product.findById(
        order.orderItems[0].productId
      ).select("stock");

      await returnStockForOrderItems(order.orderItems);
      // <<< LOG DEPOIS DE RETORNAR >>>
      const stockAfterReturn = await Product.findById(
        order.orderItems[0].productId
      ).select("stock");
    }

    // 10. Resposta ao Frontend
    res.status(200).json({
      status: "success",
      message: `Pagamento processado com status inicial: ${mpResponse.status}`,
      data: { order: order },
    });
  } catch (err) {
    let statusCode = 500;
    let message = "Falha interna ao processar o pagamento.";

    if (err instanceof AppError) {
      message = err.message;
      statusCode = err.statusCode;
    } else {
      const mpErrorMessage =
        err.cause?.error?.message ||
        err.error?.message ||
        err.response?.data?.message ||
        err.message;

      const isMpApiError =
        paymentApiCalled &&
        (err.cause ||
          err.response ||
          (err.statusCode && err.statusCode >= 400 && err.statusCode < 500));

      if (isMpApiError) {
        message = `Erro do Gateway de Pagamento: ${
          mpErrorMessage || "Erro desconhecido"
        }`;
        statusCode =
          err.statusCode && err.statusCode >= 400 && err.statusCode < 500
            ? err.statusCode
            : 400;
      }
    }

    if (!res.headersSent) {
      next(new AppError(message, statusCode));
    }
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
    const orders = await Order.find({ user: userId }).sort("-createdAt");

    res.status(200).json({
      status: "success",
      results: orders.length,
      data: {
        orders,
      },
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
    if (userRole === "admin") {
      query = { _id: orderId };
    } else {
      query = { _id: orderId, user: userId };
    }

    // Busca o pedido. Pode popular o usuário se quiser mostrar nome/email.
    const order = await Order.findOne(query).populate("user", "name email");

    if (!order) {
      // Mensagem genérica para não vazar informação se o pedido existe mas não é do usuário
      return next(new AppError("Pedido não encontrado.", 404));
    }

    res.status(200).json({
      status: "success",
      data: {
        order,
      },
    });
  } catch (err) {
    if (err.name === "CastError") {
      return next(new AppError(`ID de pedido inválido: ${req.params.id}`, 400));
    }
    next(err);
  }
};

/**
 * @description Lista TODOS os pedidos com paginação (Admin).
 * @route GET /api/orders
 * @access Admin
 */
export const getAllOrders = async (req, res, next) => {
  // Validação de query params (opcional, pode adicionar em routes se precisar)
  // const errors = validationResult(req);
  // if (!errors.isEmpty()) {
  //     return res.status(400).json({ errors: errors.array() });
  // }

  try {
    const { page = 1, limit = 15, sort = "-createdAt" } = req.query;
    const currentPageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 15;

    const filterQuery = {}; // Sem filtro de usuário aqui
    const sortOptions = sort ? String(sort).split(",").join(" ") : "-createdAt";

    const [orders, totalOrders] = await Promise.all([
      Order.find(filterQuery)
        .populate("user", "name email")
        .sort(sortOptions)
        .limit(limitNum)
        .skip((currentPageNum - 1) * limitNum)
        .lean(),
      Order.countDocuments(filterQuery),
    ]);

    const totalPages = Math.ceil(totalOrders / limitNum);

    res.status(200).json({
      status: "success",
      results: orders.length,
      totalOrders: totalOrders,
      totalPages: totalPages,
      currentPage: currentPageNum,
      data: {
        orders,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @description Atualiza o status de um pedido para 'shipped' (Admin).
 * @route PUT /api/orders/:id/ship
 * @access Admin
 */
export const updateOrderToShipped = async (req, res, next) => {
  const errors = validationResult(req); // Valida o ID do pedido da rota
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const orderId = req.params.id;
    const order = await Order.findById(orderId);

    if (!order) {
      return next(new AppError("Pedido não encontrado.", 404));
    }

    if (!["processing", "paid"].includes(order.orderStatus)) {
      return next(
        new AppError(
          `Não é possível marcar como enviado um pedido com status '${order.orderStatus}'.`,
          400
        )
      );
    }

    order.orderStatus = "shipped";
    const updatedOrder = await order.save();

    res.status(200).json({
      status: "success",
      data: {
        order: updatedOrder,
      },
    });
  } catch (err) {
    if (err.name === "CastError") {
      return next(new AppError(`ID de pedido inválido: ${req.params.id}`, 400));
    }
    next(err);
  }
};

/**
 * @description Atualiza o status de um pedido para 'delivered' (Admin).
 * @route PUT /api/orders/:id/deliver
 * @access Admin
 */
export const updateOrderToDelivered = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  try {
    const orderId = req.params.id;
    const order = await Order.findById(orderId);

    if (!order) {
      return next(new AppError("Pedido não encontrado.", 404));
    }

    if (order.orderStatus !== "shipped") {
      return next(
        new AppError(
          `Só é possível marcar como entregue um pedido com status 'shipped'. Status atual: '${order.orderStatus}'.`,
          400
        )
      );
    }

    order.orderStatus = "delivered";
    order.deliveredAt = new Date();
    const updatedOrder = await order.save();

    res.status(200).json({
      status: "success",
      data: {
        order: updatedOrder,
      },
    });
  } catch (err) {
    if (err.name === "CastError") {
      return next(new AppError(`ID de pedido inválido: ${req.params.id}`, 400));
    }
    next(err);
  }
};

export { returnStockForOrderItems };
