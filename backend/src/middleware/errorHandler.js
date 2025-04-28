// src/middleware/errorHandler.js
import AppError from "../utils/appError.js";

// --- Funções Handler Específicas ---

// Trata erro de Cast (ID mal formatado) do Mongoose
const handleCastErrorDB = (err) => {
  const message = `Recurso inválido. Valor '${err.value}' não é um ${err.kind} válido para o campo '${err.path}'.`;
  return new AppError(message, 400);
};

// Trata erro de campo duplicado (unique: true) do MongoDB (código 11000)
const handleDuplicateFieldsDB = (err) => {
  let value = "desconhecido";
  if (err.keyValue) {
    const key = Object.keys(err.keyValue)[0];
    value = err.keyValue[key];
  } else if (err.message) {
    const match = err.message.match(/(["'])(?:(?=(\\?))\2.)*?\1/);
    if (match) value = match[0];
  }

  const message = `Valor duplicado: '${value}'. Este campo já existe e deve ser único.`;
  return new AppError(message, 409);
};

// Trata erros de validação do Schema Mongoose (required, min, max, enum, etc.)
const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map((el) => el.message);
  const message = `Dados inválidos na entrada: ${errors.join(". ")}`;
  return new AppError(message, 400);
};

// Trata erro de assinatura inválida ou token malformado do JWT
const handleJWTError = () =>
  new AppError("Token inválido. Por favor, faça login novamente.", 401);

// Trata erro de token JWT expirado
const handleJWTExpiredError = () =>
  new AppError("Sua sessão expirou. Por favor, faça login novamente.", 401);

// --- Funções de Envio de Resposta ---
const sendErrorDev = (err, res) => {
  if (process.env.NODE_ENV !== "test") {
  }
  res.status(err.statusCode || 500).json({
    status: err.status || "error",
    error: err,
    message: err.message,
    stack: err.stack,
  });
};

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

  let error = {
    ...err,
    name: err.name,
    message: err.message,
    code: err.code,
    path: err.path,
    value: err.value,
    keyValue: err.keyValue,
    errors: err.errors,
  };

  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction) {
    if (error.name === "CastError") error = handleCastErrorDB(error);
    if (error.code === 11000) error = handleDuplicateFieldsDB(error);
    if (error.name === "ValidationError")
      error = handleValidationErrorDB(error);
    if (error.name === "JsonWebTokenError") error = handleJWTError();
    if (error.name === "TokenExpiredError") error = handleJWTExpiredError();
  }

  if (isProduction) {
    sendErrorProd(error, res);
  } else {
    sendErrorDev(error.isOperational ? error : err, res);
  }
};

export default globalErrorHandler;
