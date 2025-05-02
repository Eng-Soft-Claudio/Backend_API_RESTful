//src/routes/auth.js
import express from "express";
import { body } from "express-validator";
import {
  login,
  register,
  getCurrentUser,
} from "../controllers/authController.js";
import { authenticate } from "../middleware/auth.js";
import User from "../models/User.js";
import { cpf } from "cpf-cnpj-validator";

const router = express.Router();

// --- Validações ---
const loginValidationRules = [
  body("email", "Email inválido").isEmail().normalizeEmail(),
  body("password", "Senha é obrigatória").notEmpty(),
];

const registerValidationRules = [
  body("name", "Nome é obrigatório").trim().notEmpty(),
  body("email", "Email inválido")
    .isEmail()
    .normalizeEmail()
    .custom(async (value) => {
      const user = await User.findOne({ email: value });
      if (user) {
        return Promise.reject("Este E-mail já está registrado.");
      }
    }),
  body("password", "Senha deve ter no mínimo 8 caracteres")
    .isLength({ min: 8 })
    .trim(),
  body(
    "passwordConfirm",
    "Confirmação de senha é obrigatória e deve coincidir com a senha"
  )
    .notEmpty()
    .withMessage("Confirmação de senha é obrigatória.")
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error("As senhas não coincidem.");
      }
      return true;
    }),
  body("cpf")
    .trim()
    .notEmpty()
    .withMessage("CPF é obrigatório.")
    .custom((value) => {
      const cpfDigits = value.replace(/\D/g, "");
      if (!cpf.isValid(cpfDigits)) {
        throw new Error("CPF inválido (formato ou dígito verificador).");
      }
      return true;
    }),
  body("cpf").custom(async (value) => {
    const cpfDigits = value.replace(/\D/g, "");
    const user = await User.findOne({ cpf: cpfDigits });
    if (user) {
      return Promise.reject("Este CPF já está registrado.");
    }
  }),
  body("birthDate", "Data de nascimento inválida")
    .trim()
    .notEmpty()
    .withMessage("Data de nascimento é obrigatória.")
    .isISO8601()
    .withMessage("Formato de data inválido (use AAAA-MM-DD).")
    .toDate()
    .custom((value) => {
      if (!(value instanceof Date && !isNaN(value))) {
        throw new Error("Data de nascimento inválida após conversão.");
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const birthDateOnly = new Date(
        value.getFullYear(),
        value.getMonth(),
        value.getDate()
      );
      let age = today.getFullYear() - birthDateOnly.getFullYear();
      const m = today.getMonth() - birthDateOnly.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDateOnly.getDate())) {
        age--;
      }
      if (age < 16) {
        throw new Error("Você deve ter pelo menos 16 anos.");
      }
      return true;
    }),
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
router.post("/login", loginValidationRules, login);

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
router.post("/register", registerValidationRules, register);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Retorna os dados do usuário autenticado atualmente.
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Dados do usuário recuperados com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *                # Schema que contém status: success e data: { user: UserResponse }
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                      user:
 *                         $ref: '#/components/schemas/UserResponse' # Schema com dados do usuário (id, name, email, role)
 *       '401':
 *         description: Não autorizado (token ausente, inválido ou expirado).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '500':
 *         description: Erro interno do servidor (ex: falha no middleware).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/me", authenticate, getCurrentUser);

export default router;
