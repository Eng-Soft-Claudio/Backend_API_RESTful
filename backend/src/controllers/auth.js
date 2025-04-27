// src/controllers/auth.js
import User from '../models/User.js';
import AppError from '../utils/appError.js';
import { validationResult } from 'express-validator';
import { signToken } from '../utils/jwtUtils.js'; 


// --- Controller de Login
export const login = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } }).select('+password');
        const passwordMatches = user ? await user.correctPassword(password, user.password) : false;
        if (!user || !passwordMatches) {
            return next(new AppError('Credenciais inválidas', 401));
        }
        const token = signToken(user._id, user.role);
        res.status(200).json({ status: 'success', token });
    } catch (err) {
        next(err);
    }
};


// --- Controller de Registro
export const register = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const newUser = await User.create({
            name: req.body.name,
            email: req.body.email,
            password: req.body.password,
        });

        const token = signToken(newUser._id, newUser.role);

        newUser.password = undefined;

        res.status(201).json({
            status: 'success',
            token,
            data: {
                user: newUser, 
            },
        });

    } catch (err) {
        next(err);
    }
};