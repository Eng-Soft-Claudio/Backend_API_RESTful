//src/routes/auth.js
import express from 'express';
import { body } from 'express-validator';
import { login, register } from '../controllers/auth.js';
import User from '../models/User.js';


/**
 * @swagger
 * components:
 *   schemas:
 *     UserInput:
 *       type: object
 *       required:
 *         - name
 *         - email
 *         - password
 *         - passwordConfirm
 *       properties:
 *         name:
 *           type: string
 *           description: Nome do usuário.
 *           example: João Silva
 *         email:
 *           type: string
 *           format: email
 *           description: Email único do usuário.
 *           example: joao.silva@email.com
 *         password:
 *           type: string
 *           format: password
 *           description: Senha do usuário (mínimo 8 caracteres).
 *           example: senhaForte123
 *         passwordConfirm:
 *           type: string
 *           format: password
 *           description: Confirmação da senha (deve ser igual à senha).
 *           example: senhaForte123
 *         role:
 *           type: string
 *           enum: [user, admin]
 *           description: (Opcional no registro público) Role do usuário. Ignorado no registro público.
 *           example: user
 *     UserLogin:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: joao.silva@email.com
 *         password:
 *           type: string
 *           format: password
 *           example: senhaForte123
 *     AuthResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           example: success
 *         token:
 *           type: string
 *           description: Token JWT para autenticação.
 *           example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *         data:
 *           type: object
 *           properties:
 *             user:
 *               $ref: '#/components/schemas/UserOutput' # Referencia UserOutput
 *     UserOutput:
 *       type: object
 *       properties:
 *          _id:
 *            type: string
 *            format: objectid
 *            description: ID único do usuário.
 *            example: 68015a91320b9fa9419079be
 *          name:
 *            type: string
 *            example: João Silva
 *          email:
 *            type: string
 *            format: email
 *            example: joao.silva@email.com
 *          role:
 *            type: string
 *            enum: [user, admin]
 *            example: user
 *          createdAt:
 *            type: string
 *            format: date-time
 *          updatedAt:
 *            type: string
 *            format: date-time
 *     ErrorResponse:
 *        type: object
 *        properties:
 *          status:
 *            type: string
 *            example: fail
 *          message:
 *            type: string
 *            example: Mensagem de erro descritiva.
 *          errors:
 *             type: array
 *             items:
 *               type: object # Para erros de validação
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

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