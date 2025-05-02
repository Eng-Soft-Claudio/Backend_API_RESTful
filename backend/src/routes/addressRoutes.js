//src/routes/addressRoutes.js
import express from "express";
import { body, param } from "express-validator";
import { authenticate } from "../middleware/auth.js";
import {
  addAddress,
  getMyAddresses,
  getMyAddressById,
  updateMyAddress,
  deleteMyAddress,
  setDefaultAddress,
} from "../controllers/addressController.js";

const router = express.Router();

// --- Aplica autenticação a TODAS as rotas de endereço ---
router.use(authenticate);

// --- Regras de Validação para CRIAÇÃO (POST) ---
const createAddressValidationRules = [
  body("label", "Rótulo inválido (máx 50 caracteres)")
    .optional()
    .trim()
    .isLength({ max: 50 }),
  body("street", "Nome da rua/logradouro é obrigatório (máx 200 caracteres)")
    .trim()
    .notEmpty()
    .isLength({ max: 200 }),
  body("number", "Número é obrigatório (máx 20 caracteres)")
    .trim()
    .notEmpty()
    .isLength({ max: 20 }),
  body("complement", "Complemento inválido (máx 100 caracteres)")
    .optional()
    .trim()
    .isLength({ max: 100 }),
  body("neighborhood", "Bairro é obrigatório (máx 100 caracteres)")
    .trim()
    .notEmpty()
    .isLength({ max: 100 }),
  body("city", "Cidade é obrigatória (máx 100 caracteres)")
    .trim()
    .notEmpty()
    .isLength({ max: 100 }),
  body("state", "Estado (UF) é obrigatório (2 caracteres)")
    .trim()
    .notEmpty()
    .isLength({ min: 2, max: 2 })
    .toUpperCase(),
  body("postalCode", "CEP inválido (formato 12345-678 ou 12345678)")
    .trim()
    .notEmpty()
    .matches(/^\d{5}-?\d{3}$/),
  body("country", "País é obrigatório (máx 50 caracteres)")
    .optional({ checkFalsy: true })
    .trim()
    .notEmpty()
    .isLength({ max: 50 }),
  body("phone", "Telefone inválido (máx 20 caracteres)")
    .optional()
    .trim()
    .isLength({ max: 20 }),
];

// --- Regras de Validação para ATUALIZAÇÃO (PUT) ---
const updateAddressValidationRules = [
  body("label", "Rótulo inválido (máx 50 caracteres)")
    .optional()
    .trim()
    .isLength({ max: 50 }),
  body("street", "Nome da rua/logradouro inválido (máx 200 caracteres)")
    .optional()
    .trim()
    .notEmpty()
    .isLength({ max: 200 }),
  body("number", "Número inválido (máx 20 caracteres)")
    .optional()
    .trim()
    .notEmpty()
    .isLength({ max: 20 }),
  body("complement", "Complemento inválido (máx 100 caracteres)")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 100 }),
  body("neighborhood", "Bairro inválido (máx 100 caracteres)")
    .optional()
    .trim()
    .notEmpty()
    .isLength({ max: 100 }),
  body("city", "Cidade inválida (máx 100 caracteres)")
    .optional()
    .trim()
    .notEmpty()
    .isLength({ max: 100 }),
  body("state", "Estado (UF) inválido (2 caracteres)")
    .optional()
    .trim()
    .notEmpty()
    .isLength({ min: 2, max: 2 })
    .toUpperCase(),
  body("postalCode", "CEP inválido (formato 12345-678 ou 12345678)")
    .optional()
    .trim()
    .notEmpty()
    .matches(/^\d{5}-?\d{3}$/),
  body("country", "País inválido (máx 50 caracteres)")
    .optional()
    .trim()
    .notEmpty()
    .isLength({ max: 50 }),
  body("phone", "Telefone inválido (máx 20 caracteres)")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 20 }),
  body("isDefault", "Valor inválido para isDefault (deve ser true ou false)")
    .optional()
    .isBoolean()
    .toBoolean(),
];
const mongoIdValidation = (paramName = "id") => [
  param(paramName, `ID inválido para ${paramName}`).isMongoId(),
];

/**
 * @swagger
 * tags:
 *   name: Addresses
 *   description: Gerenciamento de endereços do usuário logado.
 */

/**
 * @swagger
 * /api/addresses:
 *   post:
 *     summary: Adiciona um novo endereço para o usuário logado.
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: [] # Requer token JWT
 *     requestBody:
 *       required: true
 *       description: Dados do novo endereço.
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AddressInput'
 *     responses:
 *       '201':
 *         description: Endereço criado com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                      address: { $ref: '#/components/schemas/AddressOutput' }
 *       '400':
 *         description: Erro de validação nos dados do endereço.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorValidationResponse'
 *       '401':
 *         description: Não autorizado (token inválido ou ausente).
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
router.post("/", createAddressValidationRules, addAddress);

/**
 * @swagger
 * /api/addresses:
 *   get:
 *     summary: Lista todos os endereços do usuário logado.
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Lista de endereços obtida com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 results: { type: integer, example: 2 }
 *                 data:
 *                   type: object
 *                   properties:
 *                     addresses:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/AddressOutput'
 *       '401':
 *         description: Não autorizado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       '500':
 *         description: Erro interno.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 */
router.get("/", getMyAddresses);

/**
 * @swagger
 * /api/addresses/{id}:
 *   get:
 *     summary: Obtém um endereço específico do usuário logado por ID.
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: objectid
 *         description: ID do endereço a ser obtido.
 *         example: 6701a...
 *     responses:
 *       '200':
 *         description: Detalhes do endereço.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     address: { $ref: '#/components/schemas/AddressOutput' }
 *       '400':
 *         description: ID inválido.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorValidationResponse' } } }
 *       '401':
 *         description: Não autorizado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       '404':
 *         description: Endereço não encontrado ou não pertence ao usuário.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       '500':
 *         description: Erro interno.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 */
router.get("/:id", mongoIdValidation("id"), getMyAddressById);

/**
 * @swagger
 * /api/addresses/{id}:
 *   put:
 *     summary: Atualiza um endereço específico do usuário logado.
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: objectid
 *         description: ID do endereço a ser atualizado.
 *     requestBody:
 *       required: true
 *       description: Campos do endereço a serem atualizados (pelo menos um).
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AddressInput' # Permite enviar qualquer campo válido
 *     responses:
 *       '200':
 *         description: Endereço atualizado com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     address: { $ref: '#/components/schemas/AddressOutput' }
 *       '400':
 *         description: ID inválido ou erro de validação nos dados do corpo.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorValidationResponse' } } }
 *       '401':
 *         description: Não autorizado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       '404':
 *         description: Endereço não encontrado ou não pertence ao usuário.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       '500':
 *         description: Erro interno.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 */
router.put(
  "/:id",
  mongoIdValidation("id"),
  updateAddressValidationRules,
  updateMyAddress
);

/**
 * @swagger
 * /api/addresses/{id}:
 *   delete:
 *     summary: Deleta um endereço específico do usuário logado.
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: objectid
 *         description: ID do endereço a ser deletado.
 *     responses:
 *       '204':
 *         description: Endereço deletado com sucesso (Sem conteúdo).
 *       '400':
 *         description: ID inválido.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorValidationResponse' } } }
 *       '401':
 *         description: Não autorizado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       '404':
 *         description: Endereço não encontrado ou não pertence ao usuário.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       '500':
 *         description: Erro interno.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 */
router.delete("/:id", mongoIdValidation("id"), deleteMyAddress);

/**
 * @swagger
 * /api/addresses/{id}/default:
 *   patch:
 *     summary: Define um endereço específico como o padrão do usuário logado.
 *     tags: [Addresses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: objectid
 *         description: ID do endereço a ser definido como padrão.
 *     responses:
 *       '200':
 *         description: Endereço definido como padrão com sucesso (retorna o endereço atualizado).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     address: { $ref: '#/components/schemas/AddressOutput' } # Mostra que isDefault é true
 *       '400':
 *         description: ID inválido.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorValidationResponse' } } }
 *       '401':
 *         description: Não autorizado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       '404':
 *         description: Endereço não encontrado ou não pertence ao usuário.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       '500':
 *         description: Erro interno.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 */
router.patch("/:id/default", mongoIdValidation("id"), setDefaultAddress);

export default router;
