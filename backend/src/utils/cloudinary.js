import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET
});

// Função de upload (exportada corretamente)
export const uploadImage = async (filePath) => {
  const result = await cloudinary.uploader.upload(filePath,
    { 
      timeout: 60000
    });
  
  return result;
};