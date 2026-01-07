// teste/setup/env.setup.js
process.env.NODE_ENV = "test";

// Se você usa JWT em testes, defina um segredo fixo de teste:
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

// Se sua app lê variáveis obrigatórias, defina defaults aqui:
process.env.API_BASE_URL = process.env.API_BASE_URL || "http://localhost";
