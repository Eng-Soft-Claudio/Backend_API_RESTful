import express from 'express';
import { body, param} from 'express-validator';
import User from '../models/User.js'; 
import { authenticate, isAdmin } from '../middleware/auth.js';
import {
    createUser,
    getUsers,
    getUserById,
    updateUser,
    deleteUser,
    getMe,
    updateMe,
    deleteMe,
    updateMyPassword
} from '../controllers/users.js';

// --- VALIDAÇÕES ---

const adminCreateUserValidationRules = [
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
  body('role', "Role inválida. Deve ser 'user' ou 'admin'.")
      .optional()
      .isIn(['user', 'admin'])
];

const mongoIdValidation = (paramName = 'id') => [
    param(paramName, `ID inválido para ${paramName}`).isMongoId()
];

const adminUpdateUserValidationRules = [
    body('name', 'Nome não pode ser vazio').optional().trim().notEmpty(),
    body('email', 'Email inválido')
        .optional()
        .isEmail()
        .normalizeEmail()
        .custom(async (value, { req }) => { 
            if (!value) return; 
            const user = await User.findOne({ email: value });
            if (user && user._id.toString() !== req.params.id) {
                return Promise.reject('Este E-mail já está registrado por outro usuário.');
            }
        }),
    body('role', "Role inválida. Deve ser 'user' ou 'admin'.")
        .optional()
        .isIn(['user', 'admin'])
];

const updateMeValidationRules = [
    body('name', 'Nome não pode ser vazio').optional().trim().notEmpty(),
    body('email', 'Email inválido')
        .optional()
        .isEmail()
        .normalizeEmail()
        .custom(async (value, { req }) => { 
             if (!value) return; 
             const user = await User.findOne({ email: value });
             
             if (user && user._id.toString() !== req.user.id) {
                 return Promise.reject('Este E-mail já está registrado por outro usuário.');
             }
        })
];

const updatePasswordValidationRules = [
    body('currentPassword', 'Senha atual é obrigatória').notEmpty(),
    body('password', 'Nova senha deve ter no mínimo 8 caracteres')
        .isLength({ min: 8 })
        .trim(),
    body('passwordConfirm', 'Confirmação de senha é obrigatória e deve coincidir')
        .notEmpty()
        .custom((value, { req }) => {
            if (value !== req.body.password) {
                throw new Error('A nova senha e a confirmação não coincidem.');
            }
            return true;
        })
];

// --- ROTAS ---
const router = express.Router();

// --- Rotas do Usuário Logado ---
router.get('/me', authenticate, getMe);
router.patch('/me', authenticate, updateMeValidationRules, updateMe); 
router.patch('/updateMyPassword', authenticate, updatePasswordValidationRules, updateMyPassword);
router.delete('/me', authenticate, deleteMe);

// --- Rotas de Admin ---
router.post('/', authenticate, isAdmin, adminCreateUserValidationRules, createUser);
router.get('/', authenticate, isAdmin, getUsers);
router.get('/:id', authenticate, isAdmin, mongoIdValidation('id'), getUserById); 
router.patch('/:id', authenticate, isAdmin, mongoIdValidation('id'), adminUpdateUserValidationRules, updateUser); 
router.delete('/:id', authenticate, isAdmin, mongoIdValidation('id'), deleteUser); 


export default router;