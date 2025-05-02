//src/utils/jwtUtils.js
import jwt from 'jsonwebtoken';

/**
 * Gera um token JWT para um determinado ID e role de usuário.
 * @param {string} id - O ID do usuário (MongoDB ObjectId).
 * @param {string} role - A role do usuário ('user' ou 'admin').
 * @returns {string} O token JWT gerado.
 */

export const signToken = (id, role) => {
    return jwt.sign({ id, role }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '90d',
    });
};

