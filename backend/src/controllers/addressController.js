import Address from '../models/Address.js';
import AppError from '../utils/appError.js';
import { validationResult } from 'express-validator';

// --- Adicionar um Novo Endereço ---
export const addAddress = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const addressData = {
            ...req.body,
            user: req.user.id 
        };

        const newAddress = await Address.create(addressData);

        res.status(201).json({
            status: 'success',
            data: {
                address: newAddress
            }
        });

    } catch (err) {
        next(err);
    }
};

// --- Listar Endereços do Usuário Logado ---
export const getMyAddresses = async (req, res, next) => {
    try {
        const addresses = await Address.find({ user: req.user.id })
                                       .sort('-isDefault -createdAt'); 

        res.status(200).json({
            status: 'success',
            results: addresses.length,
            data: {
                addresses
            }
        });
    } catch (err) {
        next(err);
    }
};

// --- Obter um Endereço Específico do Usuário Logado por ID ---
export const getMyAddressById = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const addressId = req.params.id;
        const userId = req.user.id;

        const address = await Address.findOne({ _id: addressId, user: userId });

        if (!address) {
            return next(new AppError('Endereço não encontrado ou não pertence a você.', 404));
        }

        res.status(200).json({
            status: 'success',
            data: {
                address
            }
        });
    } catch (err) {
        if (err.name === 'CastError') {
             return next(new AppError(`ID de endereço inválido: ${req.params.id}`, 400));
        }
        next(err);
    }
};

// --- Atualizar um Endereço Específico do Usuário Logado ---
export const updateMyAddress = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const addressId = req.params.id;
        const userId = req.user.id;
        const updates = req.body;

        delete updates.user;

        const address = await Address.findOneAndUpdate(
            { _id: addressId, user: userId }, 
            updates,                          
            {
                new: true,                    
                runValidators: true          
            }
        );

        if (!address) {
            return next(new AppError('Endereço não encontrado ou não pertence a você para atualização.', 404));
        }

        res.status(200).json({
            status: 'success',
            data: {
                address
            }
        });
    } catch (err) {
        if (err.name === 'CastError') {
             return next(new AppError(`ID de endereço inválido: ${req.params.id}`, 400));
        }
        next(err);
    }
};

// --- Deletar um Endereço Específico do Usuário Logado ---
export const deleteMyAddress = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const addressId = req.params.id;
        const userId = req.user.id;

        const address = await Address.findOneAndDelete({ _id: addressId, user: userId });

        if (!address) {
            return next(new AppError('Endereço não encontrado ou não pertence a você para deleção.', 404));
        }


        res.status(204).json({
            status: 'success',
            data: null
        });
    } catch (err) {
        if (err.name === 'CastError') {
             return next(new AppError(`ID de endereço inválido: ${req.params.id}`, 400));
        }
        next(err);
    }
};

// --- (Opcional) Definir Endereço como Padrão ---
export const setDefaultAddress = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const addressId = req.params.id;
        const userId = req.user.id;

        const addressToSetDefault = await Address.findOne({ _id: addressId, user: userId });

        if (!addressToSetDefault) {
             return next(new AppError('Endereço não encontrado ou não pertence a você.', 404));
        }

        if (addressToSetDefault.isDefault) {
            return res.status(200).json({
                status: 'success',
                data: {
                    address: addressToSetDefault
                }
            });
        }

        addressToSetDefault.isDefault = true;
        await addressToSetDefault.save();

        res.status(200).json({
            status: 'success',
            data: {
                address: addressToSetDefault
            }
        });

    } catch (err) {
        if (err.name === 'CastError') {
             return next(new AppError(`ID de endereço inválido: ${req.params.id}`, 400));
        }
        next(err);
    }
};