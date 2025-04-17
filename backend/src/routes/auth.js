// routes/auth.js
import express from 'express';
import { body } from 'express-validator';
import { login, register } from '../controllers/auth.js';
import User from '../models/User.js';


const router = express.Router();

// Validações para Login
const loginValidationRules = [
    body('email', 'Email inválido').isEmail().normalizeEmail(),
    body('password', 'Senha é obrigatória').notEmpty()
];

// Validações para Registro (NOVAS)
const registerValidationRules = [
    body('name', 'Nome é obrigatório').trim().notEmpty(),
    body('email', 'Email inválido')
        .isEmail()
        .normalizeEmail()
        .custom(async (value) => {
            const user = await User.findOne({ email: value });
            if (user) {
                return Promise.reject('Este E-mail já está registrado.');
            }
        }),
    body('password', 'Senha deve ter no mínimo 8 caracteres')
        .isLength({ min: 8 })
        .trim(), 
    body('passwordConfirm', 'Confirmação de senha não confere com a senha')
        .custom((value, { req }) => {
            if (value !== req.body.password) {
                throw new Error('As senhas não coincidem.');
            }
            return true;
        })
];

// --- ROTAS ---

// Rota de Login
router.post('/login', loginValidationRules, login);

// Rota de Registro
router.post('/register', registerValidationRules, register);


export default router;