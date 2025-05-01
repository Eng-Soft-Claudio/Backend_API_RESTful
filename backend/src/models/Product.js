// src/models/Product.js
import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Nome do produto é obrigatório."],
      trim: true,
      index: true, // Indexa para buscas/ordenação por nome
    },
    description: {
      type: String,
      trim: true,
    },
    image: {
      // URL da imagem (principalmente do Cloudinary)
      type: String,
      // Não é obrigatório aqui, pois o upload pode falhar,
      // mas a lógica de negócio pode exigir.
    },
    imagePublicId: {
      // ID público para gerenciar a imagem no Cloudinary
      type: String,
    },
    price: {
      type: Number,
      required: [true, "Preço do produto é obrigatório."],
      min: [0.01, "Preço deve ser maior que zero."], // Garante preço positivo
    },
    stock: {
      type: Number,
      required: [true, "Estoque do produto é obrigatório."], // Torna obrigatório
      default: 0,
      min: [0, "Estoque não pode ser negativo."],
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category", // Referencia o model 'Category'
      required: [true, "Categoria do produto é obrigatória."],
      index: true, // Indexa para filtrar por categoria
    },
    rating: {
      // Média das avaliações recebidas
      type: Number,
      required: true, // É importante ter um valor, mesmo que seja 0
      default: 0,
      min: 0,
      max: 5,
      // Arredonda para uma casa decimal ao salvar/atualizar
      set: (val) => Math.round(val * 10) / 10,
    },
    numReviews: {
      // Número total de avaliações recebidas
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true, // Adiciona createdAt e updatedAt
  }
);

// Criação de índice de texto para buscas com $text (se não foi criado manualmente)
// productSchema.index({ name: 'text', description: 'text' });

const Product = mongoose.model("Product", productSchema);

export default Product;
