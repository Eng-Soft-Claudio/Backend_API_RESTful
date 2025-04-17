// src/controllers/auth.js
import User from '../models/User.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';

/**
 * @description Autentica um usuário e retorna um token JWT.
 * @route POST /api/auth/login
 * @access Public
 */

export const login = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });

        const passwordMatches = user ? await bcrypt.compare(password, user.password) : false;

        if (!user || !passwordMatches) {
            const error = new Error('Credenciais inválidas');
            error.statusCode = 401; 
            error.status = 'fail'; 
            error.isOperational = true; 
            return next(error);
        }

        const payload = {
            id: user._id, 
            role: user.role 
        };

        const token = jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '100h' } 
        );

        res.status(200).json({
            status: 'success',
            token
        });

    } catch (err) {
        console.error("💥 ERRO Inesperado no Login:", err);
        next(err);
    }
};