// src/middleware/auth.js
import jwt from 'jsonwebtoken';
import AppError from '../utils/appError.js';
import User from '../models/User.js';

export const authenticate = async (req, res, next) => {
    try {
        let token;
        if (
            req.headers.authorization &&
            req.headers.authorization.startsWith('Bearer')
        ) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return next(
                new AppError('Você não está logado. Por favor, faça login para obter acesso.', 401)
            );
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const currentUser = await User.findById(decoded.id);
          if (!currentUser) {
            return next(new AppError('O usuário dono deste token não existe mais.', 401));
        }

        if (currentUser.changedPasswordAfter(decoded.iat)) {
          return next(new AppError('Usuário recentemente mudou a senha. Por favor, logue novamente.', 401));
        }

        req.user = { id: decoded.id, role: decoded.role };

        next();

    } catch (err) {
        next(err);
    }
};

export const isAdmin = (req, res, next) => {
    if (!req.user) { 
        return next(new AppError('Middleware de autenticação não executado corretamente.', 500));
    }

    if (req.user.role !== 'admin') {
        return next(
            new AppError('Você não tem permissão para realizar esta ação (requer admin).', 403)
        );
    }
    next();
};