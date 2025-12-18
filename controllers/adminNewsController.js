const clima = require("./news/adminClimaController");
const cotacoes = require("./news/adminCotacoesController");

let posts = null;
try {
  posts = require("./news/adminPostsController");
} catch {
  posts = null;
}

module.exports = {
  ...clima,
  ...cotacoes,
  ...(posts || {}),
};
