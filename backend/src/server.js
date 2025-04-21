// src/server.js
import dotenv from 'dotenv';
import mongoose from 'mongoose'; // Embora não usado diretamente aqui, é bom ter para referência
import app from './app.js'; // Importa a instância configurada do Express
import { connectDB } from './config/db.js'; // Importa a função de conexão

// Carrega variáveis de ambiente do .env (DEVE SER CEDO)
dotenv.config();

// Handler para erros síncronos não capturados (Ex: referenciar variável inexistente)
// IMPORTANTE: Deve ser definido antes de qualquer código que possa gerar tais erros.
process.on('uncaughtException', err => {
  console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.error(err.name, err.message);
  console.error(err.stack); // Logar o stack trace é útil para depuração
  // Encerrar imediatamente é crucial para evitar estado inconsistente
  process.exit(1);
});

// Variável para guardar a referência ao servidor HTTP
let server;

// Conecta ao Banco de Dados PRIMEIRO
connectDB().then(() => {
    // SÓ DEPOIS da conexão bem-sucedida, inicia o servidor Express
    const PORT = process.env.PORT || 5000;
    server = app.listen(PORT, () => { // Guarda a referência do servidor
        console.log(`Servidor rodando na porta ${PORT}...`);
        // (O log "Conectado ao MongoDB!" virá da própria função connectDB)
    });

    // Handler para promessas rejeitadas não capturadas (Ex: erro em async sem await ou catch)
    // IMPORTANTE: Deve ser definido APÓS iniciar o servidor, para poder fechá-lo.
    process.on('unhandledRejection', err => {
      console.error('UNHANDLED REJECTION! 💥 Shutting down gracefully...');
      // É importante logar o erro completo aqui também
      console.error(err.name, err.message);
      console.error(err.stack);

      // Tenta fechar o servidor HTTP graciosamente primeiro
      if (server) {
          server.close(() => {
            console.error('Servidor HTTP fechado.');
            process.exit(1); // Sai após fechar o servidor
          });
      } else {
          // Se o servidor nem iniciou, apenas sai
          process.exit(1);
      }
    });

}).catch(err => {
    // Adiciona um catch aqui para o caso de connectDB() rejeitar a promessa
    console.error('DB CONNECTION FAILED! 💥 Shutting down...');
    console.error(err.name, err.message);
     console.error(err.stack);
    process.exit(1);
});

