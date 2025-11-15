// docs/swagger.js
const swaggerJSDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const pkg = (() => {
  try { return require("../package.json"); } catch { return { version: "1.0.0" }; }
})();

const options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Kavita API",
      version: pkg.version,
      description: "Documentação da API Kavita (produtos, serviços, pedidos, etc.)",
    },
    servers: [
      { url: "http://localhost:5000", description: "Dev local" },
      // { url: "https://seu-dominio.com", description: "Produção" },
    ],
    tags: [
      { name: "Public", description: "Endpoints públicos" },
      { name: "Admin", description: "Endpoints protegidos do painel" },
      { name: "Produtos", description: "Recursos de produtos" },
      { name: "Serviços", description: "Recursos de serviços" },
      { name: "Pedidos", description: "Checkout e pedidos" },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      parameters: {
        PageParam: {
          name: "page",
          in: "query",
          required: false,
          schema: { type: "integer", default: 1, minimum: 1 },
          description: "Página (paginaçao).",
        },
        LimitParam: {
          name: "limit",
          in: "query",
          required: false,
          schema: { type: "integer", default: 12, minimum: 1, maximum: 100 },
          description: "Itens por página.",
        },
        SortParam: {
          name: "sort",
          in: "query",
          required: false,
          schema: { type: "string", enum: ["id", "name", "price", "created_at"] },
          description: "Campo para ordenação.",
        },
        OrderParam: {
          name: "order",
          in: "query",
          required: false,
          schema: { type: "string", enum: ["asc", "desc"], default: "asc" },
          description: "Direção da ordenação.",
        },
      },
      schemas: {
        ApiEnvelope: {
          type: "object",
          required: ["success", "data", "error"],
          properties: {
            success: { type: "boolean", example: true },
            data: { nullable: true },
            error: {
              nullable: true,
              oneOf: [
                { type: "null" },
                { $ref: "#/components/schemas/ErrorResponse" },
              ],
            },
          },
        },
        Product: {
          type: "object",
          properties: {
            id: { type: "integer" },
            name: { type: "string" },
            description: { type: "string", nullable: true },
            price: { type: "number", format: "float" },
            quantity: { type: "integer" },
            category_id: { type: "integer", nullable: true },
            image: { type: "string", nullable: true, description: "URL da capa" },
            images: { type: "array", items: { type: "string" }, description: "URLs extras" },
          },
          required: ["id", "name", "price", "quantity"],
        },
        Service: {
          type: "object",
          properties: {
            id: { type: "integer" },
            name: { type: "string" },
            description: { type: "string", nullable: true },
            price: { type: "number", format: "float", nullable: true },
            categoria: { type: "string", nullable: true },
            images: { type: "array", items: { type: "string" } },
            colaborador: {
              type: "object",
              nullable: true,
              properties: {
                id: { type: "integer" },
                nome: { type: "string" },
                whatsapp: { type: "string" },
                images: { type: "array", items: { type: "string" } },
              },
            },
          },
          required: ["id", "name"],
        },
        PaginatedProducts: {
          type: "object",
          properties: {
            page: { type: "integer" },
            limit: { type: "integer" },
            total: { type: "integer" },
            data: { type: "array", items: { $ref: "#/components/schemas/Product" } },
          },
        },
        PaginatedServices: {
          type: "object",
          properties: {
            page: { type: "integer" },
            limit: { type: "integer" },
            total: { type: "integer" },
            data: { type: "array", items: { $ref: "#/components/schemas/Service" } },
          },
        },
        LoginSuccess: {
          type: "object",
          properties: {
            message: { type: "string", example: "Login bem-sucedido!" },
            token: { type: "string", description: "JWT para autenticação" },
            user: {
              type: "object",
              properties: {
                id: { type: "integer" },
                nome: { type: "string" },
                email: { type: "string", format: "email" },
                role: { type: "string" },
              },
            },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            message: { type: "string" },
            details: {
              description: "Informações adicionais sobre o erro",
              nullable: true,
              oneOf: [
                { type: "string" },
                { type: "object", additionalProperties: true },
                { type: "array", items: { type: "object" } },
              ],
            },
          },
        },
      },
    },
  },
  // Aponte para arquivos com comentários JSDoc @openapi
  apis: [
    "./server.js",
    "./routes/**/*.js",
  ],
};

const swaggerSpec = swaggerJSDoc(options);

function setupDocs(app) {
  app.get("/api-docs.json", (req, res) => res.setHeader("Content-Type", "application/json").send(swaggerSpec));
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));
  console.log("📚 Swagger disponível em /docs (spec em /api-docs.json)");
}

module.exports = { swaggerSpec, setupDocs };
