// src/controllers/users.js
import User from '../models/User.js';
import { validationResult } from 'express-validator';
import AppError from '../utils/appError.js';
import jwt from 'jsonwebtoken';

// --- Função Auxiliar para filtrar campos permitidos para atualizações ---
const filterObj = (obj, ...allowedFields) => {
    const newObj = {};
    Object.keys(obj).forEach(el => {
        if (allowedFields.includes(el)) newObj[el] = obj[el];
    });
    return newObj;
};

// --- Função Auxiliar para gerar Token (Se ainda não estiver no topo) ---
const signToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  });
};


// === AÇÕES DE ADMINISTRADOR ===

/**
 * @description Cria um novo usuário
 * @route POST /api/users
 * @access Admin
 */
export const createUser = async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const userData = {
            name: req.body.name,
            email: req.body.email,
            password: req.body.password,
            role: req.body.role && ['user', 'admin'].includes(req.body.role)
                  ? req.body.role
                  : 'user'
        };

        const newUser = await User.create(userData);
        newUser.password = undefined;

        res.status(201).json({
            status: 'success',
            data: {
                user: newUser,
            },
        });

    } catch (err) {
        next(err); 
    }
};

/**
 * @description Lista todos os usuários
 * @route GET /api/users
 * @access Admin
 */
export const getUsers = async (req, res, next) => {
    try {
        const users = await User.find().select('-password'); 
        res.status(200).json({
            status: 'success',
            results: users.length,
            data: {
                users,
            },
        });
    } catch (err) {
        next(err); 
    }
};

/**
 * @description Obtém um usuário específico por ID
 * @route GET /api/users/:id
 * @access Admin
 */
export const getUserById = async (req, res, next) => {
    const errors = validationResult(req);
     if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
     }

    try {
        const user = await User.findById(req.params.id).select('-password');

        if (!user) {
            return next(new AppError('Nenhum usuário encontrado com este ID.', 404));
        }

        res.status(200).json({
            status: 'success',
            data: {
                user,
            },
        });
    } catch (err) {
        if (err.name === 'CastError') {
             return next(new AppError(`ID inválido: ${req.params.id}`, 400));
        }
        next(err);
    }
};

/**
 * @description Atualiza um usuário
 * @route PATCH /api/users/:id
 * @access Admin
 */
export const updateUser = async (req, res, next) => {
     const errors = validationResult(req);
     if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
     }

    try {
        const filteredBody = filterObj(req.body, 'name', 'email', 'role', 'isActive'); // Ajuste os campos permitidos

        const userToUpdate = await User.findById(req.params.id);
        if (userToUpdate.role === 'admin' && filteredBody.role && filteredBody.role !== 'admin') {
           return next(new AppError('Não é permitido rebaixar um administrador por esta rota.', 400));
        }

        const updatedUser = await User.findByIdAndUpdate(req.params.id, filteredBody, {
            new: true, 
            runValidators: true 
        }).select('-password');

        if (!updatedUser) {
            return next(new AppError('Nenhum usuário encontrado com este ID.', 404));
        }

        res.status(200).json({
            status: 'success',
            data: {
                user: updatedUser,
            },
        });
    } catch (err) {
         if (err.code === 11000) {
             return next(new AppError('Este email já está em uso.', 400));
         }
         if (err.name === 'CastError') {
             return next(new AppError(`ID inválido: ${req.params.id}`, 400));
         }
        next(err); 
    }
};


/**
 * @description Deleta um usuário específico por ID.
 * @route DELETE /api/users/:id
 * @access Admin
 */
export const deleteUser = async (req, res, next) => {
     const errors = validationResult(req);
     if (!errors.isEmpty()) {
         return res.status(400).json({ errors: errors.array() });
     }

    try {
        const user = await User.findByIdAndDelete(req.params.id); 

        if (!user) {
            return next(new AppError('Nenhum usuário encontrado com este ID.', 404));
        }

        res.status(204).json({
            status: 'success',
            data: null,
        });
    } catch (err) {
        if (err.name === 'CastError') {
            return next(new AppError(`ID inválido: ${req.params.id}`, 400));
        }
        next(err); 
    }
};


// === AÇÕES DO USUÁRIO LOGADO === 

/**
 * @description Obtém o perfil do usuário atualmente logado
 * @route GET /api/users/me
 * @access Usuário logado
 */
export const getMe = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id).select('-password');

        if (!user) {
             console.error("Erro: Usuário não encontrado em getMe, mas autenticado. ID:", req.user.id);
             return next(new AppError('Usuário não encontrado.', 404));
        }

        res.status(200).json({
            status: 'success',
            data: {
                user,
            },
        });
    } catch (err) {
        next(err); 
    }
};

/**
 * @description Atualiza dados do perfil do usuário logado
 * @route PATCH /api/users/me
 * @access Usuário logado
 */
export const updateMe = async (req, res, next) => {
    const errors = validationResult(req);
     if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
     }

    try {
        const filteredBody = filterObj(req.body, 'name', 'email'); 
        
        const user = await User.findById(req.user.id);

         if (!user) {
             return next(new AppError('Usuário não encontrado.', 404));
         }

        user.name = filteredBody.name ?? user.name; 
        user.email = filteredBody.email ?? user.email; 

        const updatedUser = await user.save({ validateModifiedOnly: true });

        updatedUser.password = undefined; 

        res.status(200).json({
            status: 'success',
            data: {
                user: updatedUser,
            },
        });
    } catch (err) {
          if (err.code === 11000) {
              return next(new AppError('Este email já está em uso.', 400));
          }
        next(err); 
    }
};


/**
 * @description Apaga e/ou inativa a conta do usuário logado
 * @route DELETE /api/users/me
 * @access Usuário logado
 */
export const deleteMe = async (req, res, next) => {
    try {
         const deletedUser = await User.findByIdAndDelete(req.user.id);
         if (!deletedUser) {
             return next(new AppError('Usuário não encontrado para deletar.', 404));
         }

        await User.findByIdAndUpdate(req.user.id, { isActive: false });

        res.status(204).json({
            status: 'success',
            data: null,
        });
    } catch (err) {
        next(err); 
    }
};


/**
 * @description Atualiza a senha do usuário atualmente logado.
 * @route PATCH /api/users/updateMyPassword
 * @access Usuário logado
 */
export const updateMyPassword = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
  }

  try {
    const user = await User.findById(req.user.id).select('+password');
    if (!(await user.correctPassword(req.body.currentPassword, user.password))) {
      return next(new AppError('Sua senha atual está incorreta.', 401));
    }
    user.password = req.body.password;
    await user.save();
    const token = signToken(user._id, user.role);
    res.status(200).json({
      status: 'success',
      token, // Envia novo token para manter o usuário logado
      message: 'Senha atualizada com sucesso!',
  });
} catch (err) {
  next(err); // Passa para o handler global
}
};
