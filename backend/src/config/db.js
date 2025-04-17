import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

export const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Conectado ao MongoDB!');
  } catch (err) {
    console.error('Erro na conexão com MongoDB:', err.message);
    process.exit(1);
  }
};

export default connectDB;