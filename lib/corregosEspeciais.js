// lib/corregosEspeciais.js
//
// Catálogo curado de córregos/localidades reconhecidos por produzir
// café especial na Zona da Mata Mineira (Matas de Minas DO).
//
// Usado para escalar a prioridade da notificação ao corretor quando
// o lead vem de uma região reconhecida. Lista é heuristicamente
// minimalista — match por substring case/accent-insensitive.
//
// Manutenção: novos nomes podem ser adicionados conforme a equipe
// Kavita reconhece padrões nos leads recebidos.
"use strict";

/** Lista de termos que, se aparecerem no córrego_localidade, marcam
 *  o lead como vindo de região cafeeira premium. */
const TERMOS_CAFES_ESPECIAIS = [
  "pedra bonita",
  "boa vista",
  "alto caparao",
  "alto caparaó",
  "patrimonio",
  "patrimônio",
  "serra",
  "serrinha",
  "serra do brigadeiro",
  "matas de minas",
  "alto manhuacu",
  "alto manhuaçu",
  "fazenda velha",
  "santa rita",
  "monte verde",
];

function normalize(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Retorna true se o nome do córrego/localidade contém algum termo
 *  reconhecido como região de café especial. */
function isCorregoEspecial(corregoLocalidade) {
  if (!corregoLocalidade) return false;
  const norm = normalize(corregoLocalidade);
  if (norm.length < 3) return false;
  return TERMOS_CAFES_ESPECIAIS.some((termo) => norm.includes(normalize(termo)));
}

module.exports = { isCorregoEspecial, TERMOS_CAFES_ESPECIAIS };
