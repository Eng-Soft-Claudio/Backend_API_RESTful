// src/models/Review.js
import mongoose from "mongoose";
import Product from "./Product.js"; // Importa o modelo Product para usar no hook

const reviewSchema = new mongoose.Schema(
  {
    user: {
      // Quem fez a avaliação
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User", // Referencia o modelo User
    },
    name: {
      // Nome do usuário (copiado para evitar populate extra ao listar reviews)
      type: String,
      required: [true, "Nome do usuário avaliador é obrigatório."], // Garante que temos o nome
    },
    rating: {
      // A nota dada
      type: Number,
      required: [true, "A nota (rating) é obrigatória."],
      min: [1, "A nota mínima é 1."],
      max: [5, "A nota máxima é 5."],
    },
    comment: {
      // O comentário textual (opcional)
      type: String,
      trim: true,
      maxlength: [1000, "Comentário pode ter no máximo 1000 caracteres."],
    },
    product: {
      // Referência ao produto avaliado
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Product", // Referencia o modelo Product
      index: true, // Facilita buscar todas as reviews de um produto
    },
  },
  {
    timestamps: true, // Adiciona createdAt e updatedAt
  }
);

// --- Índice Composto Único ---
// Impede que o *mesmo* usuário (`user`) envie mais de uma avaliação
// para o *mesmo* produto (`product`).
reviewSchema.index({ product: 1, user: 1 }, { unique: true });

// --- Método Estático para Calcular Média de Avaliação ---
// Este método será chamado pelos hooks para atualizar o produto associado.
reviewSchema.statics.calculateAverageRating = async function (productId) {
  // 'this' aqui se refere ao Model 'Review'
  const stats = await this.aggregate([
    {
      $match: { product: productId }, // 1. Encontra todas as reviews para este produto
    },
    {
      $group: {
        // 2. Agrupa para calcular estatísticas
        _id: "$product", // Agrupa pelo ID do produto
        numReviews: { $sum: 1 }, // Conta o número de reviews encontradas
        averageRating: { $avg: "$rating" }, // Calcula a média das notas (rating)
      },
    },
  ]);

  try {
    if (stats.length > 0) {
      // Se encontrou estatísticas (ou seja, existem reviews para o produto)
      const newRating = Math.round(stats[0].averageRating * 10) / 10; // Arredonda para 1 casa decimal
      await Product.findByIdAndUpdate(productId, {
        rating: newRating,
        numReviews: stats[0].numReviews,
      });
    } else {
      // Se não encontrou estatísticas (não há mais reviews para este produto)
      // Reseta a avaliação e o número de reviews do produto para 0
      await Product.findByIdAndUpdate(productId, {
        rating: 0,
        numReviews: 0,
      });
    }
  } catch (error) {
    // Loga erro se a atualização do produto falhar
    console.error("Erro ao atualizar rating/numReviews do produto:", error);
  }
};

// --- Middlewares Mongoose (Hooks) para chamar o cálculo ---

// Hook PÓS-save: Acionado sempre que uma review é salva (criada ou atualizada via .save())
reviewSchema.post("save", function () {
  // 'this' é a review que acabou de ser salva.
  // 'this.constructor' é o Model 'Review'.
  // Chama o método estático para recalcular a média do produto associado.
  this.constructor.calculateAverageRating(this.product);
});

// Hooks para deleção (usando findOneAndDelete que é chamado pelo findByIdAndDelete)

// Hook PRÉ-findOneAndDelete: Acionado ANTES da review ser deletada.
// Usamos isso para pegar uma referência à review que *será* deletada.
reviewSchema.pre("findOneAndDelete", async function (next) {
  try {
    // 'this.getQuery()' pega os critérios de busca (ex: {_id: reviewId})
    // 'this.model' é o Model 'Review'
    // Armazenamos a review em 'this.reviewToDelete' para usar no hook post
    this.reviewToDelete = await this.model.findOne(this.getQuery());
  } catch (error) {
    // Loga erro se falhar ao buscar a review antes de deletar
    console.error("Erro no hook pre findOneAndDelete ao buscar review:", error);
    // Não impede a deleção, apenas loga
  }
  next(); // Continua para a operação de deleção
});

// Hook PÓS-findOneAndDelete: Acionado DEPOIS que a review foi deletada.
reviewSchema.post("findOneAndDelete", async function () {
  // Se conseguimos armazenar a referência no hook 'pre'
  if (this.reviewToDelete) {
    // Chama o método estático para recalcular a média do produto
    // Usa o constructor da review deletada para chamar o método estático
    await this.reviewToDelete.constructor.calculateAverageRating(
      this.reviewToDelete.product
    );
  }
});

const Review = mongoose.model("Review", reviewSchema);

export default Review;
