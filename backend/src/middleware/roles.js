// src/middleware/roles.js
import AppError from '../utils/appError.js';

export const checkRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
             return next(new AppError('Middleware de autenticação não executado corretamente.', 500));
        }

        if (!roles.includes(req.user.role)) {
             return next(
                new AppError(
                    `Acesso negado. Sua role (${req.user.role}) não tem permissão. Requerido: ${roles.join(' ou ')}`,
                    403
                )
            );
        }
        next();
    };
};