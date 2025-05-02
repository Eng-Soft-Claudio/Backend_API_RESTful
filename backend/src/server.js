// src/server.js
import dotenv from "dotenv";
import app from "./app.js";
import { connectDB } from "./config/db.js";

// Carrega variáveis de ambiente
dotenv.config();

// Handler para erros síncronos não capturados
process.on("uncaughtException", (err) => {
  process.exit(1);
});

// Variável para guardar a referência ao servidor HTTP
let server;

// Conecta ao Banco de Dados PRIMEIRO
connectDB()
  .then(() => {
    // SÓ DEPOIS da conexão bem-sucedida, inicia o servidor Express
    const PORT = process.env.PORT || 5000;
    server = app.listen(PORT, () => {
      logger.log(`Servidor rodando na porta ${PORT}...`);
    });

    // Handler para promessas rejeitadas não capturadas
    process.on("unhandledRejection", (err) => {
      logger.error("UNHANDLED REJECTION! 💥 Shutting down gracefully...");
      logger.error(err.name, err.message);
      logger.error(err.stack);

      // Tenta fechar o servidor HTTP graciosamente primeiro
      if (server) {
        server.close(() => {
          logger.error("Servidor HTTP fechado.");
          process.exit(1);
        });
      } else {
        process.exit(1);
      }
    });
  })
  .catch((err) => {
    // Adiciona um catch aqui para o caso de connectDB() rejeitar a promessa
    logger.error("DB CONNECTION FAILED! 💥 Shutting down...");
    logger.error(err.name, err.message);
    logger.error(err.stack);
    process.exit(1);
  });
