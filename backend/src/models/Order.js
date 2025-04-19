//src/models/Order.js
import mongoose from 'mongoose';

// Schema para os itens dentro do pedido
const orderItemSchema = new mongoose.Schema({
    productId: { 
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    name: { 
        type: String,
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1,
        default: 1
    },
    price: { 
        type: Number,
        required: true
    },
    image: { 
        type: String
    }
}, {
    _id: false 
});

// Schema principal do Pedido
const orderSchema = new mongoose.Schema({
    user: { 
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    orderItems: [orderItemSchema], 

    shippingAddress: { 
        label: { type: String },
        street: { type: String, required: true },
        number: { type: String, required: true },
        complement: { type: String },
        neighborhood: { type: String, required: true },
        city: { type: String, required: true },
        state: { type: String, required: true },
        postalCode: { type: String, required: true },
        country: { type: String, required: true },
        phone: { type: String } 
    },

    paymentMethod: { 
        type: String,
        required: [true, 'Método de pagamento é obrigatório.']
    },

    paymentResult: { 
        id: { type: String },           
        status: { type: String },       
        update_time: { type: String },  
        email_address: { type: String } 
    },

    itemsPrice: { 
        type: Number,
        required: true,
        default: 0.0
    },
    shippingPrice: { 
        type: Number,
        required: true,
        default: 0.0
    },
    totalPrice: { 
        type: Number,
        required: true,
        default: 0.0
    },

    orderStatus: {
        type: String,
        required: true,
        enum: ['pending_payment', 'failed', 'processing', 'shipped', 'delivered', 'cancelled'],
        default: 'pending_payment',
        index: true 
    },

    paidAt: { 
        type: Date
    },
    deliveredAt: { 
        type: Date
    },

}, {
    timestamps: true 
});

const Order = mongoose.model('Order', orderSchema);

export default Order;