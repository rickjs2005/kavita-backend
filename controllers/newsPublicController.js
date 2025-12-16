const newsModel = require("../models/newsModel");

// Buscar clima por slug
exports.getClima = async (req, res) => {
  const { slug } = req.params;

  if (!slug) {
    return res.status(400).json({ message: "Slug é obrigatório." });
  }

  try {
    const clima = await newsModel.getClimaBySlug(slug);
    if (!clima) {
      return res.status(404).json({ message: "Clima não encontrado." });
    }
    return res.status(200).json(clima);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao buscar clima." });
  }
};

// Buscar cotação por slug
exports.getCotacao = async (req, res) => {
  const { slug } = req.params;

  if (!slug) {
    return res.status(400).json({ message: "Slug é obrigatório." });
  }

  try {
    const cotacao = await newsModel.getCotacaoBySlug(slug);
    if (!cotacao) {
      return res.status(404).json({ message: "Cotação não encontrada." });
    }
    return res.status(200).json(cotacao);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao buscar cotação." });
  }
};

// Listar posts publicados
exports.listPosts = async (req, res) => {
  const { limit = 10, offset = 0 } = req.query;

  try {
    const posts = await newsModel.listPostsPublic({ status: "published", limit, offset });
    return res.status(200).json(posts);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao listar posts." });
  }
};

// Buscar post por slug (somente publicado)
exports.getPost = async (req, res) => {
  const { slug } = req.params;

  if (!slug) {
    return res.status(400).json({ message: "Slug é obrigatório." });
  }

  try {
    const post = await newsModel.getPostBySlug(slug);
    if (!post || post.status !== "published") {
      return res.status(404).json({ message: "Post não encontrado ou não publicado." });
    }
    return res.status(200).json(post);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao buscar post." });
  }
};
