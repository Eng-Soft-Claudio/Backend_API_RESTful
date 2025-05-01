//src/routes/users.js
import express from "express";
import { body, param } from "express-validator";
import User from "../models/User.js";
import { authenticate, isAdmin } from "../middleware/auth.js";
import {
  createUser,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  getMe,
  updateMe,
  deleteMe,
  updateMyPassword,
} from "../controllers/usersController.js";

// --- VALIDAÇÕES ---

const adminCreateUserValidationRules = [
  body("name", "Nome é obrigatório").trim().notEmpty(),
  body("email", "Email inválido ou já registrado")
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
  body("cpf", "CPF inválido ou já registrado")
    .trim()
    .notEmpty()
    .withMessage("CPF é obrigatório.")
    .custom(async (value) => {
      if (!value) return;
      const user = await User.findOne({ cpf: value });
      if (user) {
        return Promise.reject("Este CPF já está registrado.");
      }
    }),
  body(
    "birthDate",
    "Data de nascimento é obrigatória e deve estar no formato AAAA-MM-DD"
  )
    .notEmpty()
    .withMessage("Data de nascimento é obrigatória.")
    .isISO8601()
    .withMessage("Formato de data inválido (use AAAA-MM-DD).")
    .toDate(),
  body("role", "Role inválida. Deve ser 'user' ou 'admin'.")
    .optional()
    .isIn(["user", "admin"]),
];

const mongoIdValidation = (paramName = "id") => [
  param(
    paramName,
    `ID inválido para ${paramName}. Deve ser um MongoID válido.`
  ).isMongoId(),
];

const adminUpdateUserValidationRules = [
  body("name", "Nome não pode ser vazio se fornecido")
    .optional()
    .trim()
    .notEmpty(),
  body("email", "Email inválido ou já registrado por outro usuário")
    .optional()
    .isEmail()
    .withMessage("Formato de email inválido.")
    .normalizeEmail()
    .custom(async (value, { req }) => {
      if (!value) return;
      const user = await User.findOne({ email: value });
      if (user && user._id.toString() !== req.params.id) {
        return Promise.reject(
          "Este E-mail já está registrado por outro usuário."
        );
      }
    }),
  body("role", "Role inválida. Deve ser 'user' ou 'admin'.")
    .optional()
    .isIn(["user", "admin"]),
];

const updateMeValidationRules = [
  body("name", "Nome não pode ser vazio se fornecido")
    .optional()
    .trim()
    .notEmpty(),
  body("email", "Email inválido ou já registrado por outro usuário")
    .optional()
    .isEmail()
    .withMessage("Formato de email inválido.")
    .normalizeEmail()
    .custom(async (value, { req }) => {
      if (!value) return;
      const user = await User.findOne({ email: value });
      if (user && user._id.toString() !== req.user.id) {
        return Promise.reject(
          "Este E-mail já está registrado por outro usuário."
        );
      }
    }),
];

const updatePasswordValidationRules = [
  body("currentPassword", "Senha atual é obrigatória").notEmpty(),
  body("password", "Nova senha deve ter no mínimo 8 caracteres")
    .isLength({ min: 8 })
    .trim(),
  body("passwordConfirm", "Confirmação de senha é obrigatória")
    .notEmpty()
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error("A nova senha e a confirmação não coincidem.");
      }
      return true;
    }),
];

// --- ROTAS ---

const router = express.Router();

// --- Rotas do Usuário Logado ---

/**
 * @swagger
 * /api/users/me:
 *   get:
 *     summary: Obtém o perfil do usuário logado.
 *     tags: [Users]
 *     description: Retorna os detalhes do usuário que está autenticado através do token JWT.
 *     security:
 *       - bearerAuth: [] # Requer autenticação
 *     responses:
 *       '200':
 *         description: Perfil do usuário obtido com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/UserOutput' # Retorna dados do usuário
 *       '401':
 *         description: Não autorizado (token inválido, ausente ou usuário não existe mais).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '404':
 *         description: Usuário não encontrado (caso raro se o token for válido mas o usuário sumir).
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
router.get("/me", authenticate, getMe);

/**
 * @swagger
 * /api/users/me:
 *   patch:
 *     summary: Atualiza o perfil do usuário logado.
 *     tags: [Users]
 *     description: Permite que o usuário autenticado atualize seu próprio nome e/ou email. Não permite alterar senha ou role por esta rota.
 *     security:
 *       - bearerAuth: [] # Requer autenticação
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserInputUpdateMe' # Schema específico para esta atualização
 *     responses:
 *       '200':
 *         description: Perfil atualizado com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/UserOutput' # Retorna dados atualizados
 *       '400':
 *         description: Erro de validação (ex: email inválido, nome vazio, email duplicado).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorValidationResponse'
 *       '401':
 *         description: Não autorizado.
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
router.patch("/me", authenticate, updateMeValidationRules, updateMe);

/**
 * @swagger
 * /api/users/updateMyPassword:
 *   patch:
 *     summary: Atualiza a senha do usuário logado.
 *     tags: [Users]
 *     description: Permite que o usuário autenticado altere sua própria senha, fornecendo a senha atual e a nova senha com confirmação. Retorna um novo token JWT.
 *     security:
 *       - bearerAuth: [] # Requer autenticação
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserUpdatePasswordInput' # Schema específico
 *     responses:
 *       '200':
 *         description: Senha atualizada com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                  status:
 *                      type: string
 *                      example: success
 *                  token:
 *                      type: string
 *                      description: Um NOVO token JWT válido.
 *                      example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...new
 *                  message:
 *                      type: string
 *                      example: Senha atualizada com sucesso!
 *       '400':
 *         description: Erro de validação (senhas não coincidem, senha nova muito curta, campo faltando).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorValidationResponse'
 *       '401':
 *         description: Não autorizado (token inválido ou senha atual incorreta).
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
router.patch(
  "/updateMyPassword",
  authenticate,
  updatePasswordValidationRules,
  updateMyPassword
);

/**
 * @swagger
 * /api/users/me:
 *   delete:
 *     summary: Deleta a conta do usuário logado.
 *     tags: [Users]
 *     description: Remove permanentemente a conta do usuário autenticado do sistema. Esta ação é irreversível.
 *     security:
 *       - bearerAuth: [] # Requer autenticação
 *     responses:
 *       '204':
 *         description: Conta deletada com sucesso (Sem conteúdo).
 *       '401':
 *         description: Não autorizado.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '404':
 *          description: Usuário não encontrado (improvável se autenticado).
 *          content:
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
router.delete("/me", authenticate, deleteMe);

// --- Rotas de Admin ---

/**
 * @swagger
 * /api/users:
 *   post:
 *     summary: Cria um novo usuário (Admin).
 *     tags: [Users]
 *     description: Cria uma nova conta de usuário no sistema, permitindo definir a role (user ou admin). Apenas administradores podem usar esta rota.
 *     security:
 *       - bearerAuth: [] # Requer autenticação de Admin
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf: # Combina UserInputRegister e adiciona role opcional
 *               - $ref: '#/components/schemas/UserInputRegister'
 *               - type: object
 *                 properties:
 *                   role:
 *                      type: string
 *                      enum: [user, admin]
 *                      description: (Opcional) Define a role. Padrão 'user'.
 *                      example: admin
 *                 required: # Redefine required SÓ para esta rota
 *                      - name
 *                      - email
 *                      - password
 *                      # passwordConfirm não é enviado para cá, validação normal da senha é suficiente
 *     responses:
 *       '201':
 *         description: Usuário criado com sucesso pelo admin.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                  status:
 *                      type: string
 *                      example: success
 *                  data:
 *                      type: object
 *                      properties:
 *                          user:
 *                             $ref: '#/components/schemas/UserOutput'
 *       '400':
 *         description: Erro de validação (email duplicado, role inválida, etc.).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorValidationResponse'
 *       '401':
 *         description: Não autorizado.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '403':
 *         description: Acesso proibido (não é admin).
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
router.post(
  "/",
  authenticate,
  isAdmin,
  adminCreateUserValidationRules,
  createUser
);

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Lista todos os usuários (Admin).
 *     tags: [Users]
 *     description: Retorna uma lista de todos os usuários registrados no sistema. Apenas administradores.
 *     security:
 *       - bearerAuth: []
 *     # Adicionar parâmetros de paginação/ordenação aqui se implementar no controller getUsers
 *     # parameters:
 *     #   - in: query
 *     #     name: page
 *     #     schema: { type: integer, default: 1 }
 *     #   - in: query
 *     #     name: limit
 *     #     schema: { type: integer, default: 10 }
 *     responses:
 *       '200':
 *         description: Lista de usuários obtida com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 results:
 *                   type: integer
 *                   example: 15
 *                 data:
 *                   type: object
 *                   properties:
 *                      users:
 *                          type: array
 *                          items:
 *                            $ref: '#/components/schemas/UserOutput'
 *       '401':
 *         description: Não autorizado.
 *       '403':
 *         description: Acesso proibido.
 *       '500':
 *         description: Erro interno.
 *         content: # Adicionar schema de erro para 401, 403, 500
 *            application/json:
 *              schema:
 *                $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/", authenticate, isAdmin, getUsers);

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Obtém um usuário específico por ID (Admin).
 *     tags: [Users]
 *     description: Retorna os detalhes de um usuário específico. Apenas administradores.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/UserIdParam' # Referencia um parâmetro reutilizável (definir abaixo)
 *     responses:
 *       '200':
 *         description: Detalhes do usuário.
 *         content:
 *           application/json:
 *             schema:
 *                type: object
 *                properties:
 *                  status: { type: string, example: success }
 *                  data:
 *                    type: object
 *                    properties:
 *                      user: { $ref: '#/components/schemas/UserOutput' }
 *       '400':
 *         description: ID inválido.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } # Ou ErrorValidationResponse
 *       '401':
 *         description: Não autorizado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       '403':
 *         description: Acesso proibido.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       '404':
 *         description: Usuário não encontrado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       '500':
 *         description: Erro interno.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 */
router.get("/:id", authenticate, isAdmin, mongoIdValidation("id"), getUserById);

/**
 * @swagger
 * /api/users/{id}:
 *   patch:
 *     summary: Atualiza um usuário (Admin).
 *     tags: [Users]
 *     description: Permite que um administrador atualize nome, email ou role de um usuário específico. NÃO USAR para atualizar senha.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/UserIdParam'
 *     requestBody:
 *       description: Campos a serem atualizados (pelo menos um é necessário).
 *       content:
 *          application/json:
 *              schema:
 *                  type: object
 *                  properties:
 *                      name: { type: string }
 *                      email: { type: string, format: email }
 *                      role: { type: string, enum: [user, admin] }
 *                  example:
 *                      name: "Usuário Atualizado"
 *                      role: "admin"
 *     responses:
 *       '200':
 *         description: Usuário atualizado com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *                type: object
 *                properties:
 *                  status: { type: string, example: success }
 *                  data:
 *                    type: object
 *                    properties:
 *                      user: { $ref: '#/components/schemas/UserOutput' }
 *       '400':
 *         description: ID inválido, dados inválidos ou email duplicado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } # Ou ErrorValidationResponse
 *       '401': { description: Não autorizado, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       '403': { description: Acesso proibido, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       '404': { description: Usuário não encontrado, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       '500': { description: Erro interno, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 */
router.patch(
  "/:id",
  authenticate,
  isAdmin,
  mongoIdValidation("id"),
  adminUpdateUserValidationRules,
  updateUser
);

/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     summary: Deleta um usuário (Admin).
 *     tags: [Users]
 *     description: Remove permanentemente um usuário do sistema. Apenas administradores.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/UserIdParam'
 *     responses:
 *       '204':
 *         description: Usuário deletado com sucesso (Sem conteúdo).
 *       '400': { description: ID inválido, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       '401': { description: Não autorizado, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       '403': { description: Acesso proibido, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       '404': { description: Usuário não encontrado, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       '500': { description: Erro interno, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 */
router.delete(
  "/:id",
  authenticate,
  isAdmin,
  mongoIdValidation("id"),
  deleteUser
);

// --- Definição de Parâmetro Reutilizável ---

/**
 * @swagger
 * components:
 *   parameters:
 *     UserIdParam:
 *       in: path
 *       name: id
 *       required: true
 *       schema:
 *         type: string
 *         format: objectid
 *       description: O ID MongoDB do usuário.
 *       example: 68015a91320b9fa9419079be
 */
export default router;
