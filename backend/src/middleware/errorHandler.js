// src/middleware/errorHandler.js
import AppError from "../utils/appError.js";
import mongoose from "mongoose";

// --- Funções Handler Específicas ---

// Trata erro de Cast (ID mal formatado) do Mongoose
const handleCastErrorDB = (err) => {
  const message = `O valor '${err.value}' não é válido para o campo '${err.path}'.`;
  return new AppError(message, 400);
};

// Trata erro de campo duplicado (unique: true) do MongoDB (código 11000)
const handleDuplicateFieldsDB = (err) => {
  let value = "Valor desconhecido";
  let field = "Campo desconhecido";

  if (err.keyValue) {
    field = Object.keys(err.keyValue)[0];
    value = err.keyValue[field];
  }
  const message = `O campo '${field}' já existe com o valor '${value}'.`;
  return new AppError(message, 400);
};

// Trata erros de validação do Schema Mongoose (required, min, max, enum, etc.)
const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map((el) => el.message);
  const message = `Dados inválidos: ${errors.join(". ")}`;
  return new AppError(message, 400);
};

// Trata erro de assinatura inválida ou token malformado do JWT
const handleJWTError = () =>
  new AppError("Token inválido. Por favor, faça login novamente.", 401);

// Trata erro de token JWT expirado
const handleJWTExpiredError = () =>
  new AppError("Sua sessão expirou. Por favor, faça login novamente.", 401);

// --- Funções de Envio de Resposta ---

// Envia erro detalhado em ambiente de desenvolvimento ou teste
const sendErrorDev = (err, res) => {
  
  const responseBody = {
    status: err.status || 'error',
    message: err.message,
    ...(err.name !== 'Error' && { errorName: err.name }),
    ...(err.code && { errorCode: err.code }),
    ...(err.path && { errorPath: err.path }),
    ...(err.value && { errorValue: err.value }),
    ...(err.keyValue && { errorKeyValue: err.keyValue }),
    isOperational: err.isOperational,
  };

  try {
      res.status(err.statusCode || 500).json(responseBody);
  } catch (sendError) {
      res.status(500).send('Erro interno do servidor ao formatar a resposta de erro.');
  }
};

// Envia erro simplificado em produção
const sendErrorProd = (err, res) => {
  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    });
  } else {
    res.status(500).json({
      status: "error",
      message: "Desculpe, algo deu muito errado no servidor!",
    });
  }
};

// --- Middleware Principal ---
const globalErrorHandler = (err, req, res, next) => {

  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";
  let errorToProcess = err;

  // --- Tratamento Específico de Erros do DB/JWT ---
  if (errorToProcess.name === "CastError")
    errorToProcess = handleCastErrorDB(errorToProcess);
  if (errorToProcess.code === 11000)
    errorToProcess = handleDuplicateFieldsDB(errorToProcess);
  if (errorToProcess instanceof mongoose.Error.ValidationError)
    errorToProcess = handleValidationErrorDB(errorToProcess);
  if (errorToProcess.name === "JsonWebTokenError")
    errorToProcess = handleJWTError();
  if (errorToProcess.name === "TokenExpiredError")
    errorToProcess = handleJWTExpiredError();

  // --- Garante que mesmo erros não tratados tenham uma mensagem ---
  if (!errorToProcess.message) {
    errorToProcess.message = "Ocorreu um erro inesperado.";
  }

  // --- Envia a Resposta Baseado no Ambiente ---
  if (process.env.NODE_ENV === "production") {
    if (!errorToProcess.isOperational) {
      sendErrorProd(err, res);
    } else {
      sendErrorProd(errorToProcess, res);
    }
  } else {
    sendErrorDev(errorToProcess, res);
  }
};

export default globalErrorHandler;
