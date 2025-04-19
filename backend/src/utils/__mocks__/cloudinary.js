import { jest } from '@jest/globals';

// Cria as funções mock que serão exportadas por este mock manual
const uploadImage = jest.fn();
const deleteImage = jest.fn();

// Simula a estrutura de exportação do módulo original
export { uploadImage, deleteImage };

// Se o módulo original tivesse um 'export default', você o mockaria assim:
// export default jest.fn();