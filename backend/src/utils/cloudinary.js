//src/utils/cloudinary.js
import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

// Configuração básica em .env
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Faz upload de uma imagem ao Cloudinary.
 * @param {string} filePath - Coleta o caminho da imagem.
 * @returns {Promise<object>} O resultado da operação de adição do Cloudinary.
 * @throws Se ocorrer um erro durante a deleção.
 */
export const uploadImage = async (filePath) => {
  try {
    const result = await cloudinary.uploader.upload(filePath, { folder: 'ecommerce_products' });
    return result;
  } catch (error) {
   throw error;
  }
};

/**
 * Deleta uma imagem do Cloudinary usando seu public_id.
 * @param {string} publicId - O public_id da imagem a ser deletada.
 * @returns {Promise<object>} O resultado da operação de deleção do Cloudinary.
 * @throws Se ocorrer um erro durante a deleção.
 */
export const deleteImage = async (publicId) => {
  if (!publicId) {
      logger.warn("Tentativa de deletar imagem sem publicId.");
      return { result: 'no publicId provided' };
  }
  try {
      const result = await cloudinary.uploader.destroy(publicId);
      return result;
  } catch (error) {
      throw error;
  }
};


export default cloudinary;