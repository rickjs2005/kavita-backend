// controllers/adminNewsController.js
//
// Agregador: re-exporta os controllers de news para que a rota (adminNews.js)
// possa importar de um único ponto.
// Os controllers reais estão em controllers/news/:
//   - adminClimaController.js    → GET/POST /admin/news/clima
//   - adminCotacoesController.js → GET/POST /admin/news/cotacoes
//   - adminPostsController.js    → CRUD /admin/news/posts

const clima = require("./news/adminClimaController");
const cotacoes = require("./news/adminCotacoesController");
const posts = require("./news/adminPostsController");

module.exports = {
  ...clima,
  ...cotacoes,
  ...posts,
};
