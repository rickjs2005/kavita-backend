/**
 * @openapi
 * /api/products:
 *   get:
 *     tags: [Public - Products]
 *     summary: Listar produtos com filtros e paginacao
 *     parameters:
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: limit, in: query, schema: { type: integer, default: 12 } }
 *       - { name: category, in: query, schema: { type: string } }
 *       - { name: search, in: query, schema: { type: string } }
 *       - { name: sort, in: query, schema: { type: string } }
 *       - { name: order, in: query, schema: { type: string, enum: [asc, desc] } }
 *     responses: { 200: { description: Lista paginada } }
 * /api/public/servicos:
 *   get:
 *     tags: [Public - Servicos]
 *     summary: Listar servicos
 *     responses: { 200: { description: Lista } }
 * /api/public/servicos/{id}:
 *   get:
 *     tags: [Public - Servicos]
 *     summary: Detalhe do servico
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Servico } }
 * /api/public/servicos/{id}/avaliacoes:
 *   get:
 *     tags: [Public - Servicos]
 *     summary: Avaliacoes do servico
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Avaliacoes } }
 * /api/public/servicos/{id}/view:
 *   post:
 *     tags: [Public - Servicos]
 *     summary: Registrar visualizacao
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Registrado } }
 * /api/public/servicos/{id}/whatsapp:
 *   post:
 *     tags: [Public - Servicos]
 *     summary: Registrar clique WhatsApp
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Registrado } }
 * /api/public/servicos/solicitacoes:
 *   post:
 *     tags: [Public - Servicos]
 *     summary: Enviar solicitacao de servico
 *     responses: { 201: { description: Enviada } }
 * /api/public/servicos/avaliacoes:
 *   post:
 *     tags: [Public - Servicos]
 *     summary: Enviar avaliacao de servico
 *     responses: { 201: { description: Enviada } }
 * /api/public/servicos/trabalhe-conosco:
 *   post:
 *     tags: [Public - Servicos]
 *     summary: Formulario trabalhe conosco
 *     responses: { 201: { description: Enviado } }
 * /api/public/especialidades:
 *   get:
 *     tags: [Public - Especialidades]
 *     summary: Listar especialidades
 *     responses: { 200: { description: Lista } }
 * /api/public/promocoes:
 *   get:
 *     tags: [Public - Promocoes]
 *     summary: Listar promocoes ativas
 *     responses: { 200: { description: Lista } }
 * /api/public/promocoes/{productId}:
 *   get:
 *     tags: [Public - Promocoes]
 *     summary: Promocao do produto
 *     parameters: [{ name: productId, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Promocao } }
 * /api/public/produtos:
 *   get:
 *     tags: [Public - Avaliacoes]
 *     summary: Buscar avaliacoes / quick search
 *     parameters: [{ name: search, in: query, schema: { type: string } }]
 *     responses: { 200: { description: Resultados } }
 * /api/public/produtos/avaliacoes:
 *   post:
 *     tags: [Public - Avaliacoes]
 *     summary: Enviar avaliacao de produto
 *     responses: { 201: { description: Enviada } }
 * /api/public/produtos/{id}/avaliacoes:
 *   get:
 *     tags: [Public - Avaliacoes]
 *     summary: Avaliacoes de um produto
 *     parameters: [{ name: id, in: path, required: true, schema: { type: integer } }]
 *     responses: { 200: { description: Avaliacoes } }
 * /api/config:
 *   get:
 *     tags: [Public - Config]
 *     summary: Configuracoes publicas da loja
 *     responses: { 200: { description: Config } }
 * /api/public/site-hero:
 *   get:
 *     tags: [Public - Hero]
 *     summary: Hero do site
 *     responses: { 200: { description: Hero } }
 * /api/public/hero-slides:
 *   get:
 *     tags: [Public - Hero]
 *     summary: Slides ativos do hero
 *     responses: { 200: { description: Slides } }
 * /api/public/drones/page:
 *   get:
 *     tags: [Public - Drones]
 *     summary: Pagina de drones
 *     responses: { 200: { description: Pagina } }
 * /api/public/drones/galeria:
 *   get:
 *     tags: [Public - Drones]
 *     summary: Galeria publica
 *     responses: { 200: { description: Galeria } }
 * /api/public/drones/representantes:
 *   get:
 *     tags: [Public - Drones]
 *     summary: Representantes de drones
 *     responses: { 200: { description: Lista } }
 * /api/public/drones/comentarios:
 *   get:
 *     tags: [Public - Drones]
 *     summary: Comentarios aprovados
 *     responses: { 200: { description: Comentarios } }
 *   post:
 *     tags: [Public - Drones]
 *     summary: Enviar comentario
 *     responses: { 201: { description: Enviado (pendente aprovacao) } }
 * /api/public/corretoras:
 *   get:
 *     tags: [Public - Corretoras]
 *     summary: Listar corretoras
 *     parameters:
 *       - { name: page, in: query, schema: { type: integer } }
 *       - { name: city, in: query, schema: { type: string } }
 *       - { name: search, in: query, schema: { type: string } }
 *     responses: { 200: { description: Lista paginada } }
 * /api/public/corretoras/cities:
 *   get:
 *     tags: [Public - Corretoras]
 *     summary: Cidades com corretoras
 *     responses: { 200: { description: Lista de cidades } }
 * /api/public/corretoras/submit:
 *   post:
 *     tags: [Public - Corretoras]
 *     summary: Submeter cadastro
 *     responses: { 201: { description: Enviado } }
 * /api/public/corretoras/{slug}:
 *   get:
 *     tags: [Public - Corretoras]
 *     summary: Detalhe por slug
 *     parameters: [{ name: slug, in: path, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Corretora }
 *       404: { description: Nao encontrada }
 * /api/uploads/check/{path}:
 *   get:
 *     tags: [Utils]
 *     summary: Verificar se arquivo existe
 *     parameters: [{ name: path, in: path, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Info do arquivo }
 *       404: { description: Nao encontrado }
 */
