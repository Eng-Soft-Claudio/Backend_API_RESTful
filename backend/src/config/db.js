// src/config/db.js
import mongoose from 'mongoose';

export const connectDB = async () => {
    if (process.env.NODE_ENV === 'test') {
        console.log('Ambiente de teste detectado, pulando conexão automática do DB.');
        return; 
    }
    try {
        if (!process.env.MONGODB_URI) {
             throw new Error('Variável de ambiente MONGODB_URI não definida.');
        }
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Conectado ao MongoDB!');
    } catch (err) {
        console.error('Erro na conexão com MongoDB:', err.message);
        process.exit(1);
    }
};

export default connectDB;