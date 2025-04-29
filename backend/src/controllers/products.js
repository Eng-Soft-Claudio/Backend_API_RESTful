// src/controllers/products.js
import Product from "../models/Product.js";
import Category from "../models/Category.js";
import { validationResult } from "express-validator";
import { uploadImage, deleteImage } from "../utils/cloudinary.js";
import mongoose from "mongoose";
import AppError from "../utils/appError.js";

/**
 * @description Cria um novo produto. Espera que Multer (upload.single) e as validações rodem ANTES na rota.
 * @route POST /api/products
 * @access Admin
 */

export const createProduct = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  try {
    let imageUrl = null;
    let imagePublicId = null;
    if (req.file) {
      try {
        const result = await uploadImage(req.file.path);
        imageUrl = result.secure_url;
        imagePublicId = result.public_id;
      } catch (uploadError) {
        console.error(
          "Controller: Erro no upload para Cloudinary:",
          uploadError
        );
      }
    }
    const productData = {
      name: req.body.name,
      price: Number(req.body.price),
      category: req.body.category,
      description: req.body.description,
      stock: req.body.stock ? Number(req.body.stock) : 0,
      image: imageUrl,
      imagePublicId: imagePublicId,
    };
    const product = await Product.create(productData);
    const populatedProduct = await Product.findById(product._id)
      .populate("category", "name slug")
      .lean();
    res.status(201).json(populatedProduct);
  } catch (err) {
    next(err);
  }
};

/**
 * @description Lista produtos com filtros, paginação e ordenação.
 * @route GET /api/products
 * @access Public (ou conforme definido na rota)
 */

export const getProducts = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const {
      page = 1,
      limit = 10,
      q,
      category: categoryIdentifier,
      sort,
    } = req.query;
    const currentPageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const filterQuery = {};

    if (categoryIdentifier) {
      let foundCategory = await Category.findOne({
        $or: [
          {
            _id: mongoose.Types.ObjectId.isValid(categoryIdentifier)
              ? categoryIdentifier
              : null,
          },
          { slug: categoryIdentifier.toLowerCase() },
        ],
      })
        .select("_id")
        .lean();

      if (foundCategory) {
        filterQuery.category = foundCategory._id;
      } else {
        return res.status(200).json({
          status: "success",
          results: 0,
          products: [],
          message: "Categoria não encontrada",
          totalPages: 0,
          currentPage: currentPageNum,
          totalProducts: 0,
        });
      }
    }

    if (q) {
      filterQuery.$text = { $search: q };
    }

    const sortOptions = sort ? String(sort).split(",").join(" ") : "-createdAt";

    const [products, totalProducts] = await Promise.all([
      Product.find(filterQuery)
        .populate("category", "name slug")
        .sort(sortOptions)
        .limit(limitNum)
        .skip((currentPageNum - 1) * limitNum)
        .lean(),
      Product.countDocuments(filterQuery),
    ]);

    const totalPages = Math.ceil(totalProducts / limitNum);

    res.status(200).json({
      status: "success",
      results: products.length,
      totalProducts: totalProducts,
      totalPages: totalPages,
      currentPage: currentPageNum,
      products,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @description Atualiza um produto existente. Espera que Multer e validações rodem ANTES na rota.
 * @route PUT /api/products/:id
 * @access Admin
 */

export const updateProduct = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const updates = { ...req.body };
    const productId = req.params.id;
    let oldPublicId = null;

    const existingProduct = await Product.findById(productId).lean();
    if (!existingProduct) {
      return next(new AppError("Produto não encontrado para atualizar.", 404));
    }
    oldPublicId = existingProduct.imagePublicId;

    if (req.file) {
      if (oldPublicId) {
        try {
          await deleteImage(oldPublicId);
        } catch (cloudinaryErr) {
          return next(new AppError("Falha ao deletar imagem antiga.", 404));
        }
      }
      const result = await uploadImage(req.file.path);
      updates.image = result.secure_url;
      updates.imagePublicId = result.public_id;
    } else {
      delete updates.imagePublicId;
    }
    if (updates.price !== undefined) {
      updates.price = Number(updates.price);
    }
    if (updates.stock !== undefined) {
      updates.stock = Number(updates.stock);
    }

    const product = await Product.findByIdAndUpdate(productId, updates, {
      new: true,
      runValidators: true,
    }).populate("category", "name slug");

    if (!product) {
      return next(
        new AppError("Produto não encontrado após tentativa de update.", 404)
      );
    }

    res.status(200).json(product);
  } catch (err) {
    next(err);
  }
};

/**
 * @description Deleta um produto pelo ID.
 * @route DELETE /api/products/:id
 * @access Admin
 */

export const deleteProduct = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const productId = req.params.id;

    const product = await Product.findById(productId).lean();

    if (!product) {
      return next(new AppError("Produto não encontrado para deletar.", 404));
    }
    if (product.imagePublicId) {
      try {
        await deleteImage(product.imagePublicId);
      } catch (cloudinaryErr) {}
    }

    const deletedProduct = await Product.findByIdAndDelete(productId);

    if (!deletedProduct) {
      return next(
        new AppError(
          "Produto não encontrado ao tentar deletar do DB (após busca inicial).",
          404
        )
      );
    }

    res.status(200).json({
      status: "success",
      message: "Produto removido com sucesso",
    });
  } catch (err) {
    next(err);
  }
};
