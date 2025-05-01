// src/controllers/category.js
import Category from "../models/Category.js";
import AppError from "../utils/appError.js";
import Product from "../models/Product.js"; // Importar para verificar produtos antes de deletar
import { validationResult } from "express-validator";

/**
 * @description Cria uma nova categoria. Requer privilégios de Admin.
 * @route POST /api/categories
 * @access Admin
 * @param {object} req - Objeto de requisição do Express. Espera { name: string, description?: string } no corpo.
 * @param {object} res - Objeto de resposta do Express.
 * @param {function} next - Função de middleware do Express.
 */
export const createCategory = async (req, res, next) => {
  // Validação de entrada pela rota
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Retorna erros de validação (ex: nome faltando)
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, description } = req.body;

  try {
    // Cria a categoria no banco (o slug é gerado pelo pre-save hook)
    const newCategory = await Category.create({ name, description });
    // Retorna a categoria criada com status 201
    res.status(201).json(newCategory);
  } catch (err) {
    // Trata erro de duplicação (índice único em 'name' ou 'slug')
    if (err.code === 11000) {
      // Cria um erro 409 (Conflito) específico
      return next(
        new AppError(
          `Categoria com nome '${name}' ou slug similar já existe.`,
          409
        )
      );
    }
    // Outros erros (ex: falha de conexão DB) vão para o handler global
    next(err);
  }
};

/**
 * @description Lista todas as categorias existentes, ordenadas por nome.
 * @route GET /api/categories
 * @access Público
 * @param {object} req - Objeto de requisição do Express.
 * @param {object} res - Objeto de resposta do Express.
 * @param {function} next - Função de middleware do Express.
 */
export const getCategories = async (req, res, next) => {
  try {
    // Busca todas as categorias e ordena por nome ascendente
    const categories = await Category.find().sort("name");
    // Retorna a lista (pode ser vazia)
    res.status(200).json(categories);
  } catch (err) {
    // Pega erros inesperados do find()
    next(err);
  }
};

/**
 * @description Obtém os detalhes de uma categoria específica pelo seu ID.
 * @route GET /api/categories/:id
 * @access Público
 * @param {object} req - Objeto de requisição do Express. Espera o ID da categoria no parâmetro da URL.
 * @param {object} res - Objeto de resposta do Express.
 * @param {function} next - Função de middleware do Express.
 */
export const getCategoryById = async (req, res, next) => {
  // Validação do formato do ID pela rota
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    // Busca a categoria pelo ID fornecido
    const category = await Category.findById(req.params.id);
    // Se não encontrar, retorna erro 404
    if (!category) {
      return next(new AppError(`Categoria não encontrada!`, 404));
    }
    // Retorna a categoria encontrada
    res.status(200).json(category);
  } catch (err) {
    // O CastError já foi pego pela validação da rota.
    // Pega outros erros inesperados do findById.
    next(err);
  }
};

/**
 * @description Atualiza uma categoria existente. Requer privilégios de Admin.
 * @route PUT /api/categories/:id
 * @access Admin
 * @param {object} req - Objeto de requisição do Express. Espera ID na URL e { name?: string, description?: string } no corpo.
 * @param {object} res - Objeto de resposta do Express.
 * @param {function} next - Função de middleware do Express.
 */
export const updateCategory = async (req, res, next) => {
  // Validação do ID e dos dados do corpo pela rota
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, description } = req.body;
  const categoryId = req.params.id;

  try {
    // Encontra a categoria a ser atualizada
    const category = await Category.findById(categoryId);
    if (!category) {
      // Se não existe, erro 404
      return next(new AppError(`Categoria não encontrada!`, 404));
    }

    // Atualiza os campos se fornecidos
    if (name) category.name = name;
    // Permite limpar a descrição enviando "" ou null
    if (description !== undefined) category.description = description;

    // Salva as alterações (isso aciona o pre-save hook para atualizar o slug se o nome mudou)
    const updatedCategory = await category.save();
    // Retorna a categoria atualizada
    res.status(200).json(updatedCategory);
  } catch (err) {
    // Trata erro de duplicação no save (caso o novo nome/slug já exista)
    if (err.code === 11000) {
      return next(
        new AppError(`Já existe uma categoria com nome/slug similar.`, 409)
      );
    }
    // Outros erros (validação do Mongoose no save, erro de DB)
    next(err);
  }
};

/**
 * @description Deleta uma categoria. Requer privilégios de Admin. A categoria só pode ser deletada se não houver produtos associados a ela.
 * @route DELETE /api/categories/:id
 * @access Admin
 * @param {object} req - Objeto de requisição do Express. Espera ID na URL.
 * @param {object} res - Objeto de resposta do Express.
 * @param {function} next - Função de middleware do Express.
 */
export const deleteCategory = async (req, res, next) => {
  // Validação do ID pela rota
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const categoryId = req.params.id;

  try {
    // 1. Verifica se existem produtos nesta categoria ANTES de deletar
    const productCount = await Product.countDocuments({ category: categoryId });
    if (productCount > 0) {
      // Se existem produtos, impede a deleção com erro 400 (Bad Request)
      return next(
        new AppError(
          `Não é possível deletar. Existem ${productCount} produto(s) nesta categoria.`,
          400
        )
      );
    }

    // 2. Se não há produtos, tenta deletar a categoria
    const category = await Category.findByIdAndDelete(categoryId);

    // Se findByIdAndDelete retorna null, a categoria não foi encontrada
    if (!category) {
      return next(new AppError(`Categoria não encontrada!`, 404));
    }

    // 3. Retorna sucesso (200 com mensagem ou 204)
    // O teste espera 200 com mensagem, então mantemos assim:
    res.status(200).json({ message: "Categoria removida com sucesso" });
    // Alternativa para 204 No Content: res.status(204).send();
  } catch (err) {
    // Pega erros inesperados do countDocuments ou findByIdAndDelete
    next(err);
  }
};
