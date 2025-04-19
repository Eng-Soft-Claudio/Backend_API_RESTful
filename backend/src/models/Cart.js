//src/models/Cart.js
import mongoose from 'mongoose';

// Schema para os itens dentro do carrinho
const cartItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product', // Referência ao modelo Product
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: [1, 'A quantidade mínima é 1.'], 
        default: 1
    }
}, {
    _id: false 
});

// Schema principal do Carrinho
const cartSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',    
        required: true,
        unique: true,   
        index: true   
    },
    items: [cartItemSchema], 
}, {
    timestamps: true 
});


// Schema para calcular o subtotal de cada item
cartItemSchema.virtual('subtotal').get(function() {
    if (this.product && typeof this.product.price === 'number' && typeof this.quantity === 'number') {
        return this.product.price * this.quantity;
    }
    return 0; 
});

// Configura Mongoose para incluir virtuais ao converter para JSON/Object
cartItemSchema.set('toJSON', { virtuals: true });
cartItemSchema.set('toObject', { virtuals: true });


const Cart = mongoose.model('Cart', cartSchema);

export default Cart;