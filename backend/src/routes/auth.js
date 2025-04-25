//src/routes/auth.js
import express from 'express';
import { body } from 'express-validator';
import { login, register } from '../controllers/auth.js';
import User from '../models/User.js';

const router = express.Router();

// --- Validações ---
const loginValidationRules = [
    body('email', 'Email inválido').isEmail().normalizeEmail(),
    body('password', 'Senha é obrigatória').notEmpty()
];
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

/**
 * @swagger
 * tags:
 *   name: Authentication
 *   description: Endpoints de autenticação (Login e Registro).
 */

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Autentica um usuário e retorna um token JWT.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserInputLogin' # REFERÊNCIA AO SCHEMA CENTRAL
 *     responses:
 *       '200':
 *         description: Login bem-sucedido.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse' # REFERÊNCIA AO SCHEMA CENTRAL
 *       '400':
 *         description: Erro de validação (email/senha faltando ou inválido).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorValidationResponse'
 *       '401':
 *         description: Credenciais inválidas (usuário não encontrado ou senha incorreta).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '500':
 *         description: Erro interno do servidor.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/login', loginValidationRules, login);

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Registra um novo usuário.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserInputRegister' # REFERÊNCIA AO SCHEMA CENTRAL
 *     responses:
 *       '201':
 *         description: Usuário registrado com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse' # REFERÊNCIA AO SCHEMA CENTRAL
 *       '400':
 *         description: Erro de validação (campos inválidos, senhas não coincidem, email já existe).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorValidationResponse'
 *       '500':
 *         description: Erro interno do servidor.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/register', registerValidationRules, register);

export default router;