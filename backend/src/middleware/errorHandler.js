// src/middleware/errorHandler.js

// Função para enviar a resposta de erro padronizada
const sendErrorResponse = (err, res) => {
    // Em ambiente de desenvolvimento, envie mais detalhes
    if (process.env.NODE_ENV === 'development') {
        console.error('💥 ERROR DETECTED:', err); // Log detalhado no console do dev
        return res.status(err.statusCode || 500).json({
            status: err.status || 'error',
            message: err.message,
            error: err, // Pode incluir o objeto de erro completo
            stack: err.stack // E o stack trace
        });
    }

    // Em produção, seja mais cuidadoso
    console.error('💥 ERROR:', err.message); // Log básico em produção

    // Se for um erro operacional conhecido (ex: validação, não encontrado), envie a mensagem
    if (err.isOperational) {
         return res.status(err.statusCode).json({
            status: err.status,
            message: err.message
        });
    }

    // Se for um erro desconhecido/inesperado (programação, pacote, etc.)
    // Envie uma mensagem genérica para o cliente
    return res.status(500).json({
        status: 'error',
        message: 'Algo deu muito errado no servidor!' // Mensagem genérica
    });
};


// O middleware de erro principal
const globalErrorHandler = (err, req, res, next) => {
    // Define um statusCode padrão se não existir
    err.statusCode = err.statusCode || 500;
    // Define um status padrão ('error' para 500, 'fail' para 4xx)
    err.status = err.status || (String(err.statusCode).startsWith('4') ? 'fail' : 'error');

    // Marcar erros que consideramos "operacionais" (não bugs graves)
    // Aqui podemos adicionar mais verificações (ex: erros do Mongoose, Joi, etc.)
    // Por enquanto, vamos assumir que erros com statusCode < 500 são operacionais
    if (err.statusCode < 500) {
      err.isOperational = true;
    } else {
      // Erros 500 podem ou não ser operacionais, default para não
      err.isOperational = err.isOperational || false;
    }

    sendErrorResponse(err, res);
};

export default globalErrorHandler;