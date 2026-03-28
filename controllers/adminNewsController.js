const clima = require("./news/adminClimaController");
const cotacoes = require("./news/adminCotacoesController");
const posts = require("./news/adminPostsController");

module.exports = {
  ...clima,
  ...cotacoes,
  ...posts,
};
