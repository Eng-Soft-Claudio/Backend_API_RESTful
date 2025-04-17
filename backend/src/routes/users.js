import express from 'express';
import { authenticate, isAdmin } from '../middleware/auth.js';
import {
  registerUser,
  getUsers,
  getUserProfile,
  updateUserProfile,
  deleteUser
} from '../controllers/users.js';

const router = express.Router();

// Público
router.post('/', registerUser);

// Autenticados
router.get('/me', authenticate, getUserProfile);
router.put('/me', authenticate, updateUserProfile);

// Admin apenas
router.get('/', authenticate, isAdmin, getUsers);
router.delete('/:id', authenticate, isAdmin, deleteUser);

export default router;