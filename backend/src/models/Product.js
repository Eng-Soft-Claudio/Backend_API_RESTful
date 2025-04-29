//src/models/Products.js
import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  image: { type: String },
  imagePublicId: { type: String },
  price: { type: Number, required: true, min: 0 },
  stock: { type: Number, default: 0, min: 0 },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: [true, 'Categoria do produto é obrigatória']
  },
  rating: { // Média das avaliações
    type: Number,
    required: true,
    default: 0,
    min: 0,
    max: 5,
    set: (val) => Math.round(val * 10) / 10 // Arredonda para 1 casa decimal
  },
  numReviews: { // Número total de avaliações
    type: Number,
    required: true,
    default: 0,
    min: 0
  }
}, {
  timestamps: true
});

const Product = mongoose.model('Product', productSchema);

export default Product;