// src/models/Review.js
import mongoose from "mongoose";
import Product from "./Product.js";

const reviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    name: {
      type: String,
      required: [true, "Nome do usuário avaliador é obrigatório."],
    },
    rating: {
      type: Number,
      required: [true, "A nota (rating) é obrigatória."],
      min: [1, "A nota mínima é 1."],
      max: [5, "A nota máxima é 5."],
    },
    comment: {
      type: String,
      trim: true,
      maxlength: [1000, "Comentário pode ter no máximo 1000 caracteres."],
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Product",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// --- Índice Composto Único ---
reviewSchema.index({ product: 1, user: 1 }, { unique: true });

// --- Método Estático para Calcular Média de Avaliação ---
reviewSchema.statics.calculateAverageRating = async function (productId) {
  const stats = await this.aggregate([
    // 1. Encontra todas as reviews para este produto
    {
      $match: { product: productId },
    },
    {
      $group: {
        // 2. Agrupa para calcular estatísticas
        _id: "$product",
        numReviews: { $sum: 1 },
        averageRating: { $avg: "$rating" },
      },
    },
  ]);

  try {
    if (stats.length > 0) {
      const newRating = Math.round(stats[0].averageRating * 10) / 10;
      await Product.findByIdAndUpdate(productId, {
        rating: newRating,
        numReviews: stats[0].numReviews,
      });
    } else {
      await Product.findByIdAndUpdate(productId, {
        rating: 0,
        numReviews: 0,
      });
    }
  } catch (error) {
    logger.error("Erro ao atualizar rating/numReviews do produto:", error);
  }
};

// --- Middlewares Mongoose (Hooks) para chamar o cálculo ---

reviewSchema.post("save", function () {
  this.constructor.calculateAverageRating(this.product);
});

reviewSchema.pre("findOneAndDelete", async function (next) {
  try {
    this.reviewToDelete = await this.model.findOne(this.getQuery());
  } catch (error) {
    logger.error("Erro no hook pre findOneAndDelete ao buscar review:", error);
  }
  next();
});

reviewSchema.post("findOneAndDelete", async function () {
  if (this.reviewToDelete) {
    await this.reviewToDelete.constructor.calculateAverageRating(
      this.reviewToDelete.product
    );
  }
});

const Review = mongoose.model("Review", reviewSchema);

export default Review;
