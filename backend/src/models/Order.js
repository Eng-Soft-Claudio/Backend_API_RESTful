// src/models/Order.js
import mongoose from "mongoose";

// Schema para os itens individuais dentro do pedido (copiados do carrinho no momento da criação)
const orderItemSchema = new mongoose.Schema(
  {
    productId: {
      // Guarda o ID original do produto
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    name: {
      // Copia o nome do produto no momento da compra
      type: String,
      required: true,
    },
    quantity: {
      // Copia a quantidade
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    price: {
      // Copia o preço unitário no momento da compra
      type: Number,
      required: true,
    },
    image: {
      // Copia a imagem principal do produto
      type: String,
      // Não marca como required, pois pode não haver imagem
    },
  },
  {
    _id: false, // Não gera _id para subdocumentos de itens
  }
);

// Schema principal do Pedido
const orderSchema = new mongoose.Schema(
  {
    user: {
      // Referência ao usuário que fez o pedido
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true, // Facilita buscas por pedidos de um usuário
    },
    orderItems: [orderItemSchema], // Array de subdocumentos com os itens

    shippingAddress: {
      // Objeto com os dados do endereço copiados
      label: { type: String },
      street: { type: String, required: true },
      number: { type: String, required: true },
      complement: { type: String },
      neighborhood: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      postalCode: { type: String, required: true },
      country: { type: String, required: true },
      phone: { type: String }, // Opcional
    },

    paymentMethod: {
      // Método de pagamento escolhido inicialmente
      type: String,
      required: [true, "Método de pagamento é obrigatório."],
    },

    // ID do pagamento gerado pelo Mercado Pago (ou outro gateway)
    mercadopagoPaymentId: {
      type: String,
      index: true, // Útil para buscar pedidos por ID de pagamento
    },

    // Resultado detalhado do pagamento (opcional, preenchido após processamento)
    paymentResult: {
      id: { type: String }, // ID da transação no gateway
      status: { type: String }, // Status no gateway (approved, rejected, etc.)
      update_time: { type: String }, // Timestamp da atualização no gateway
      email_address: { type: String }, // Email do pagador no gateway
      card_brand: { type: String }, // Bandeira do cartão (se aplicável)
      card_last_four: { type: String }, // Últimos 4 dígitos (se aplicável)
    },

    // Valores calculados no momento da criação do pedido
    itemsPrice: {
      // Soma dos preços dos itens (quantidade * preço unitário)
      type: Number,
      required: true,
      default: 0.0,
    },
    shippingPrice: {
      // Custo do frete
      type: Number,
      required: true,
      default: 0.0,
    },
    installments: {
      // Número de parcelas (pode ser atualizado no pagamento)
      type: Number,
      required: true,
      default: 1,
    },
    totalPrice: {
      // Soma de itemsPrice + shippingPrice
      type: Number,
      required: true,
      default: 0.0,
    },

    // Status do ciclo de vida do pedido
    orderStatus: {
      type: String,
      required: true,
      enum: [
        "pending_payment",
        "failed",
        "processing",
        "paid",
        "shipped",
        "delivered",
        "cancelled",
        "refunded",
      ],
      default: "pending_payment",
      index: true, // Facilita buscas por status
    },

    // Timestamps específicos do ciclo de vida
    paidAt: {
      // Data e hora que o pagamento foi confirmado
      type: Date,
    },
    deliveredAt: {
      // Data e hora que o pedido foi marcado como entregue
      type: Date,
    },
  },
  {
    timestamps: true, // Adiciona createdAt e updatedAt automaticamente
  }
);

// Não precisamos de hooks pré-save complexos aqui, pois a lógica principal
// (cálculo de preço, decremento de estoque) está no controller createOrder.

const Order = mongoose.model("Order", orderSchema);

export default Order;
