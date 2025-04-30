// src/controllers/auth.js
import User from "../models/User.js";
import AppError from "../utils/appError.js";
import { validationResult } from "express-validator";
import { signToken } from "../utils/jwtUtils.js";

// --- Controller de Login
export const login = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ status: "fail", errors: errors.array() });
  }
  const { email, password } = req.body;
  try {
    const user = await User.findOne({
      email: { $regex: new RegExp(`^${email}$`, "i") },
    }).select("+password");
    const passwordMatches = user
      ? await user.correctPassword(password, user.password)
      : false;
    if (!user || !passwordMatches) {
      return next(new AppError("Credenciais inválidas", 401));
    }
    const token = signToken(user._id, user.role);
    const userData = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
    res.status(200).json({
      status: "success",
      token,
      data: {
        user: userData,
      },
    });
    return;
  } catch (err) {
    next(err);
  }
};

// --- Controller de Registro
export const register = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ status: "fail", errors: errors.array() });
  }

  try {
    const newUser = await User.create({
      name: req.body.name,
      email: req.body.email,
      password: req.body.password,
      cpf: req.body.cpf.replace(/\D/g, ""),
      birthDate: req.body.birthDate,
    });

    const token = signToken(newUser._id, newUser.role);

    const userOutput = {
      _id: newUser._id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      createdAt: newUser.createdAt,
      updatedAt: newUser.updatedAt,
    };

    res.status(201).json({
      status: "success",
      token,
      data: {
        user: userOutput,
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      return next(new AppError("Este email já está registrado.", 409));
    }
    next(err);
  }
};

// --- Controller de Usuário
export const getCurrentUser = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(
        new AppError(
          "Usuário não encontrado na requisição. Middleware pode ter falhado.",
          500
        )
      );
    }
    res.status(200).json({
      status: "success",
      data: {
        user: req.user,
      },
    });
  } catch (error) {
    next(error);
  }
};
