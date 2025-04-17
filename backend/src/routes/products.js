import express from 'express';
import { authenticate, isAdmin } from '../middleware/auth.js';
import { 
  createProduct, 
  getProducts, 
  updateProduct, 
  deleteProduct 
} from '../controllers/products.js';

const router = express.Router();

router.get('/', getProducts);
router.post('/', authenticate, isAdmin, createProduct);
router.put('/:id', authenticate, isAdmin, updateProduct);
router.delete('/:id', authenticate, isAdmin, deleteProduct);

export default router;