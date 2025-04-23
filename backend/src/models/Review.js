// src/models/Review.js
import mongoose from 'mongoose';
import Product from './Product.js';

const reviewSchema = new mongoose.Schema({
    user: { 
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    name: { 
        type: String,
        required: true
    },
    rating: { 
        type: Number,
        required: [true, 'A nota (rating) é obrigatória.'],
        min: 1,
        max: 5
    },
    comment: { 
        type: String,
        trim: true,
        maxlength: 1000 
    },
    product: { 
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'Product',
        index: true 
    }
}, {
    timestamps: true
});

// --- Índice Composto Único ---
// Impede que o mesmo usuário envie mais de uma avaliação para o mesmo produto
reviewSchema.index({ product: 1, user: 1 }, { unique: true });

// --- Método Estático para Calcular Média de Avaliação ---
// Função para ser chamada após salvar ou deletar uma review
reviewSchema.statics.calculateAverageRating = async function (productId) {
    console.log(`Calculando média de rating para produto: ${productId}`);
    const stats = await this.aggregate([
        {
            $match: { product: productId } 
        },
        {
            $group: {
                _id: '$product', 
                numReviews: { $sum: 1 }, 
                averageRating: { $avg: '$rating' } 
            }
        }
    ]);

    console.log("Estatísticas de rating calculadas:", stats);

    try {
        if (stats.length > 0) {
            // Se houver reviews, atualiza o produto com os novos dados
            const newRating = Math.round(stats[0].averageRating * 10) / 10; 
            await Product.findByIdAndUpdate(productId, {
                rating: newRating,
                numReviews: stats[0].numReviews
            });
            console.log(`Produto ${productId} atualizado: Rating=${newRating}, NumReviews=${stats[0].numReviews}`);
        } else {
            // Se não houver mais reviews (ex: última foi deletada), reseta para 0
            await Product.findByIdAndUpdate(productId, {
                rating: 0,
                numReviews: 0
            });
            console.log(`Produto ${productId} resetado: Sem reviews.`);
        }
    } catch (error) {
        console.error("Erro ao atualizar rating do produto:", error);
        // Considerar lançar o erro ou lidar com ele de outra forma
    }
};

// --- Middlewares Mongoose (Hooks) para chamar o cálculo ---
reviewSchema.post('save', function () {
    this.constructor.calculateAverageRating(this.product);
});

// Chama o cálculo ANTES que uma review seja removida (findByIdAndDelete)
reviewSchema.pre('findOneAndDelete', async function (next) {
    // Precisamos buscar o documento ANTES de deletar para pegar o productId
    try {
        this.reviewToDelete = await this.model.findOne(this.getQuery());
        console.log("Hook pre findOneAndDelete - Review a ser deletada:", this.reviewToDelete?._id);
    } catch (error) {
        console.error("Erro no hook pre findOneAndDelete ao buscar review:", error);
    }
    next();
});

// Chama o cálculo DEPOIS que a review foi removida
reviewSchema.post('findOneAndDelete', async function () {
    // 'this.reviewToDelete' foi anexado no hook 'pre'
    if (this.reviewToDelete) {
        console.log("Hook post findOneAndDelete - Recalculando rating para produto:", this.reviewToDelete.product);
        // @ts-ignore <-- Ignora erro TS pois reviewToDelete foi anexado
        await this.reviewToDelete.constructor.calculateAverageRating(this.reviewToDelete.product);
    } else {
        console.log("Hook post findOneAndDelete - Não foi possível encontrar a review deletada para recalcular.");
    }
});


const Review = mongoose.model('Review', reviewSchema);

export default Review;