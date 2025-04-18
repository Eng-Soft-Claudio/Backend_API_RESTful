//src/models/Products.js
import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  image: { type: String, required: true },
  imagePublicId: { type: String }, 
  price: { type: Number, required: true, min: 0 },
  stock: { type: Number, default: 0, min: 0 },
  category: { 
    type: mongoose.Schema.Types.ObjectId, 
        ref: 'Category',                     
        required: [true, 'Categoria do produto é obrigatória'] 
    },
}, { 
  timestamps: true 
});

const Product = mongoose.model('Product', productSchema);

export default Product;