// src/config/db.js
import mongoose from 'mongoose';

export const connectDB = async () => {
    try {
      const conn = await mongoose.connect(process.env.MONGODB_URI);
    } catch (error) {
      process.exit(1);
    }
  };

export default connectDB;