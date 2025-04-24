// src/controllers/reviewController.js
import Review from '../models/Review.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import AppError from '../utils/appError.js';
import { validationResult } from 'express-validator';

/**
 * @description Cria uma nova avaliação para um produto.
 * @route POST /api/reviews/product/:productId
 * @access Usuário Logado
 */
export const createReview = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { rating, comment } = req.body;
    const productId = req.params.productId;
    const userId = req.user.id;
    const userName = req.user.name;

    try {
        // 1. Verificar se o produto existe
        const product = await Product.findById(productId);
        if (!product) {
            return next(new AppError('Produto não encontrado.', 404));
        }

        // <<< IMPLANTAÇÂO FUTURA >>>
        // // 2. Verificar se o usuário comprou este produto
        // const hasPurchased = await Order.findOne({
        //     user: userId,
        //     'orderItems.productId': productId,
        //     orderStatus: { $in: ['shipped', 'delivered'] }
        // });
        // if (!hasPurchased) {
        //     return next(new AppError('Você só pode avaliar produtos que comprou.', 403));
        // }

        // 3. Verificar se o usuário já avaliou este produto
        const existingReview = await Review.findOne({ product: productId, user: userId });
        if (existingReview) {
            return next(new AppError('Você já avaliou este produto.', 400));
        }

        // 4. Criar a avaliação
        const reviewData = {
            rating,
            comment,
            product: productId,
            user: userId,
            name: userName
        };

        const newReview = await Review.create(reviewData);

        // O hook post-save no modelo Review cuidará de recalcular a média

        res.status(201).json({
            status: 'success',
            data: {
                review: newReview
            }
        });

    } catch (err) {
        // Tratar erro de índice único (usuário já avaliou)
        if (err.code === 11000) {
            return next(new AppError('Você já avaliou este produto.', 400));
        }
        next(err);
    }
};


/**
 * @description Obtém todas as avaliações de um produto específico.
 * @route GET /api/reviews/product/:productId
 * @access Pública
 */
export const getReviewsForProduct = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const productId = req.params.productId;
    // Paginação
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    try {
        // Verificar se o produto existe primeiro
        const productExists = await Product.findById(productId).select('_id');
        if (!productExists) {
            return next(new AppError('Produto não encontrado.', 404));
        }

        // Busca as avaliações do produto com paginação
        const reviews = await Review.find({ product: productId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Contar total para paginação (opcional)
        const totalReviews = await Review.countDocuments({ product: productId });
        const totalPages = Math.ceil(totalReviews / limit);

        res.status(200).json({
            status: 'success',
            results: reviews.length,
            pagination: {
                totalReviews,
                totalPages,
                currentPage: page,
                limit
            },
            data: {
                reviews
            }
        });
    } catch (err) {
        if (err.name === 'CastError') {
            return next(new AppError(`ID de produto inválido: ${productId}`, 400));
        }
        next(err);
    }
};


// --- Funções Opcionais (Update/Delete) ---

/**
 * @description Deleta uma avaliação (própria ou qualquer uma se admin).
 * @route DELETE /api/reviews/:reviewId
 * @access Usuário Logado / Admin
 */
export const deleteReview = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const reviewId = req.params.reviewId;
    const userId = req.user.id;
    const userRole = req.user.role;

    try {
        let reviewToDelete;
        // Admin pode deletar qualquer review
        if (userRole === 'admin') {
            reviewToDelete = await Review.findById(reviewId);
        } else {
            // Usuário normal só pode deletar a sua própria
            reviewToDelete = await Review.findOne({ _id: reviewId, user: userId });
        }

        if (!reviewToDelete) {
            return next(new AppError('Avaliação não encontrada ou você não tem permissão para removê-la.', 404));
        }

        // Usa findOneAndDelete para disparar os hooks pre/post definidos no modelo
        await Review.findOneAndDelete({ _id: reviewId });

        // Os hooks no modelo cuidarão de recalcular a média

        res.status(204).json({ // 204 No Content
            status: 'success',
            data: null
        });

    } catch (err) {
        if (err.name === 'CastError') {
            return next(new AppError(`ID de avaliação inválido: ${reviewId}`, 400));
        }
        next(err);
    }
};

// Poderia adicionar updateReview aqui se necessário...