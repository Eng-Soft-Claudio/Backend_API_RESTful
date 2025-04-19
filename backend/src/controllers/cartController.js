//src/controllers/cartController.js
import Cart from '../models/Cart.js';
import Product from '../models/Product.js'; // Precisamos verificar produtos
import AppError from '../utils/appError.js';
import { validationResult } from 'express-validator';

// --- Função Auxiliar: Obter ou Criar Carrinho para Usuário ---
const getOrCreateCart = async (userId) => {
    let cart = await Cart.findOne({ user: userId });

    if (!cart) {
        // Se não existe, cria um carrinho vazio para o usuário
        cart = await Cart.create({ user: userId, items: [] });
    }
    return cart;
};

// --- Obter o Carrinho do Usuário Logado ---
export const getMyCart = async (req, res, next) => {
    try {
        const userId = req.user.id;
        // Encontra o carrinho e popula os detalhes dos produtos dentro dos itens
        const cart = await Cart.findOne({ user: userId })
                           .populate({
                               path: 'items.product', 
                               select: 'name price image stock category', 
                               populate: { 
                                   path: 'category',
                                   select: 'name slug' 
                               }
                           });

        if (!cart) {
            return res.status(200).json({
                status: 'success',
                data: {
                    cart: {
                        _id: null, 
                        user: userId,
                        items: [],
                        createdAt: null,
                        updatedAt: null,
                    }
                }
            });
        }

        // Calcular o total geral do carrinho (se necessário na resposta)
        // let total = 0;
        // if (cart.items && cart.items.length > 0) {
        //     total = cart.items.reduce((sum, item) => {
        //         // Acessa o virtual 'subtotal' que definimos no modelo
        //         return sum + (item.subtotal || 0);
        //     }, 0);
        // }
        // console.log("Total Calculado:", total); // Para depuração


        res.status(200).json({
            status: 'success',
            data: {
                cart
            }
        });
    } catch (err) {
        next(err);
    }
};

// --- Adicionar Item ao Carrinho ---
export const addItemToCart = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { productId, quantity } = req.body;
    const userId = req.user.id;

    try {
        const product = await Product.findById(productId);
        if (!product) {
            return next(new AppError('Produto não encontrado.', 404));
        }
        if (product.stock < quantity) {
            return next(new AppError(`Estoque insuficiente para ${product.name}. Disponível: ${product.stock}`, 400));
        }

        const cart = await getOrCreateCart(userId);

        const existingItemIndex = cart.items.findIndex(
            (item) => item.product.toString() === productId
        );

        if (existingItemIndex > -1) {
            cart.items[existingItemIndex].quantity += quantity;
        } else {
            cart.items.push({ product: productId, quantity: quantity });
        }

        await cart.save();

        const updatedCart = await Cart.findById(cart._id)
                                     .populate({
                                         path: 'items.product',
                                         select: 'name price image stock category',
                                         populate: {
                                            path: 'category',
                                            select: 'name slug'
                                         }
                                     });

        res.status(200).json({ 
            status: 'success',
            message: 'Item adicionado/atualizado no carrinho!',
            data: {
                cart: updatedCart
            }
        });

    } catch (err) {
        next(err);
    }
};

// --- Atualizar Quantidade de um Item no Carrinho ---
export const updateCartItemQuantity = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { productId } = req.params;
    const { quantity } = req.body;  
    const userId = req.user.id;

    try {
         if (quantity < 1) {
            return next(new AppError('A quantidade deve ser pelo menos 1.', 400));
         }

        const product = await Product.findById(productId);
        if (!product) {
            return next(new AppError('Produto não encontrado.', 404));
        }

        const cart = await Cart.findOne({ user: userId });
        if (!cart) {
            return next(new AppError('Carrinho não encontrado.', 404));
        }

        const itemIndex = cart.items.findIndex(
            (item) => item.product.toString() === productId
        );

        if (itemIndex === -1) {
            return next(new AppError('Item não encontrado no carrinho.', 404));
        }

        cart.items[itemIndex].quantity = quantity;

        await cart.save();

        const updatedCart = await Cart.findById(cart._id)
                                     .populate({
                                         path: 'items.product',
                                         select: 'name price image stock category',
                                         populate: { path: 'category', select: 'name slug' }
                                     });

        res.status(200).json({
            status: 'success',
            message: 'Quantidade do item atualizada.',
            data: {
                cart: updatedCart
            }
        });

    } catch (err) {
        next(err);
    }
};


// --- Remover Item do Carrinho ---
export const removeCartItem = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { productId } = req.params; 
    const userId = req.user.id;

    try {
        const cart = await Cart.findOne({ user: userId });
        if (!cart) {
            return next(new AppError('Carrinho não encontrado ou item não existe nele.', 404));
        }

        const initialLength = cart.items.length;
        cart.items = cart.items.filter(item => item.product.toString() !== productId);

        if (cart.items.length === initialLength) {
            return next(new AppError('Item não encontrado no carrinho para remover.', 404));
        }

        await cart.save();

        const updatedCart = await Cart.findById(cart._id)
                                     .populate({
                                         path: 'items.product',
                                         select: 'name price image stock category',
                                         populate: { path: 'category', select: 'name slug' }
                                     });

        res.status(200).json({
            status: 'success',
            message: 'Item removido do carrinho.',
            data: {
                cart: updatedCart
            }
        });

    } catch (err) {
        if (err.name === 'CastError') {
           return next(new AppError(`ID de produto inválido: ${productId}`, 400));
        }
       next(err);
   }
};


// --- Limpar o Carrinho (Remover todos os itens) ---
export const clearCart = async (req, res, next) => {
    const userId = req.user.id;

    try {
        const cart = await Cart.findOne({ user: userId });

        if (!cart || cart.items.length === 0) {
             return res.status(200).json({
                status: 'success',
                message: 'Carrinho já está vazio.',
                data: {
                    cart: cart || { user: userId, items: [] } 
                }
            });
        }

        cart.items = [];

        await cart.save();

        res.status(200).json({
            status: 'success',
            message: 'Carrinho limpo com sucesso.',
            data: {
                cart 
            }
        });

    } catch (err) {
        next(err);
    }
};