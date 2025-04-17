// routes/auth.js
import express from 'express';
import { body } from 'express-validator';
import { login } from '../controllers/auth.js';

const router = express.Router();

// Array de validações para o login
const loginValidationRules = [
    body('email', 'Email inválido')
        .isEmail()             
        .normalizeEmail(),     
    body('password', 'Senha é obrigatória')
        .notEmpty()            
];


router.post('/login', login);

export default router;