// utils/cpf.js

// remove qualquer coisa que não seja número
function sanitizeCPF(cpf) {
  if (!cpf) return "";
  return String(cpf).replace(/\D/g, "");
}

// algoritmo oficial de validação de CPF
function isValidCPF(cpf) {
  const digits = sanitizeCPF(cpf);

  if (!digits || digits.length !== 11) return false;

  // rejeita CPFs com todos os dígitos iguais (111.111.111-11 etc.)
  if (/^(\d)\1{10}$/.test(digits)) return false;

  // primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits.charAt(i), 10) * (10 - i);
  }
  let rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  if (rest !== parseInt(digits.charAt(9), 10)) return false;

  // segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits.charAt(i), 10) * (11 - i);
  }
  rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  if (rest !== parseInt(digits.charAt(10), 10)) return false;

  return true;
}

module.exports = {
  sanitizeCPF,
  isValidCPF,
};
