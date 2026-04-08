/**
 * @openapi
 * /api/products:
 *   get:
 *     tags: [Public - Products]
 *     summary: Listar produtos com filtros e paginacao
 *     parameters:
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: limit, in: query, schema: { type: integer, default: 12 } }
 *       - { name: sort, in: query, schema: { type: string } }
 *       - { name: order, in: query, schema: { type: string, enum: [asc, desc] } }
 *       - { name: category, in: query, schema: { type: string } }
 *       - { name: search, in: query, schema: { type: string } }
 *     responses:
 *       200: { description: Lista paginada de produtos }
 *
 * /api/public/servicos:
 *   get:
 *     tags: [Public - Servicos]
 *     summary: Listar servicos publicos
 *     parameters:
 *       - { name: page, in: query, schema: { type: integer } }
 *       - { name: limit, in: query, schema: { type: integer } }
 *     responses:
 *       200: { description: Lista de servicos }
 *
 * /api/public/servicos/{id}:
 *   get:
 *     tags: [Public - Servicos]
 *     summary: Detalhe do servico
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Servico com detalhes }
 *       404: { description: Nao encontrado }
 *
 * /api/public/servicos/{id}/avaliacoes:
 *   get:
 *     tags: [Public - Servicos]
 *     summary: Avaliacoes do servico
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Lista de avaliacoes }
 *
 * /api/public/servicos/{id}/view:
 *   post:
 *     tags: [Public - Servicos]
 *     summary: Registrar visualizacao do servico
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Visualizacao registrada }
 *
 * /api/public/servicos/{id}/whatsapp:
 *   post:
 *     tags: [Public - Servicos]
 *     summary: Registrar clique no WhatsApp do servico
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Clique registrado }
 *
 * /api/public/servicos/solicitacoes:
 *   post:
 *     tags: [Public - Servicos]
 *     summary: Enviar solicitacao de servico
 *     responses:
 *       201: { description: Solicitacao enviada }
 *
 * /api/public/servicos/avaliacoes:
 *   post:
 *     tags: [Public - Servicos]
 *     summary: Enviar avaliacao de servico
 *     responses:
 *       201: { description: Avaliacao enviada }
 *
 * /api/public/servicos/trabalhe-conosco:
 *   post:
 *     tags: [Public - Servicos]
 *     summary: Formulario trabalhe conosco
 *     responses:
 *       201: { description: Enviado }
 *
 * /api/public/especialidades:
 *   get:
 *     tags: [Public - Especialidades]
 *     summary: Listar especialidades
 *     responses:
 *       200: { description: Lista }
 *
 * /api/public/promocoes:
 *   get:
 *     tags: [Public - Promocoes]
 *     summary: Listar promocoes ativas
 *     responses:
 *       200: { description: Lista de promocoes }
 *
 * /api/public/promocoes/{productId}:
 *   get:
 *     tags: [Public - Promocoes]
 *     summary: Promocao ativa do produto
 *     parameters:
 *       - { name: productId, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Promocao do produto }
 *
 * /api/public/produtos:
 *   get:
 *     tags: [Public - Avaliacoes]
 *     summary: Buscar avaliacoes de produtos (quick search)
 *     parameters:
 *       - { name: search, in: query, schema: { type: string } }
 *     responses:
 *       200: { description: Resultados }
 *
 * /api/public/produtos/avaliacoes:
 *   post:
 *     tags: [Public - Avaliacoes]
 *     summary: Enviar avaliacao de produto
 *     responses:
 *       201: { description: Avaliacao enviada }
 *
 * /api/public/produtos/{id}/avaliacoes:
 *   get:
 *     tags: [Public - Avaliacoes]
 *     summary: Listar avaliacoes de um produto
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Avaliacoes do produto }
 *
 * /api/config:
 *   get:
 *     tags: [Public - Config]
 *     summary: Obter configuracoes publicas da loja
 *     responses:
 *       200: { description: Configuracoes publicas }
 *
 * /api/public/site-hero:
 *   get:
 *     tags: [Public - Hero]
 *     summary: Obter hero principal do site
 *     responses:
 *       200: { description: Hero data }
 *
 * /api/public/hero-slides:
 *   get:
 *     tags: [Public - Hero]
 *     summary: Listar slides ativos do hero
 *     responses:
 *       200: { description: Lista de slides }
 *
 * /api/public/drones/page:
 *   get:
 *     tags: [Public - Drones]
 *     summary: Conteudo da pagina de drones
 *     responses:
 *       200: { description: Pagina }
 *
 * /api/public/drones/galeria:
 *   get:
 *     tags: [Public - Drones]
 *     summary: Galeria publica de drones
 *     responses:
 *       200: { description: Imagens }
 *
 * /api/public/drones/representantes:
 *   get:
 *     tags: [Public - Drones]
 *     summary: Listar representantes de drones
 *     responses:
 *       200: { description: Representantes }
 *
 * /api/public/drones/comentarios:
 *   get:
 *     tags: [Public - Drones]
 *     summary: Listar comentarios aprovados
 *     responses:
 *       200: { description: Comentarios }
 *   post:
 *     tags: [Public - Drones]
 *     summary: Enviar comentario sobre drones
 *     responses:
 *       201: { description: Comentario enviado (pendente de aprovacao) }
 *
 * /api/public/corretoras:
 *   get:
 *     tags: [Public - Corretoras]
 *     summary: Listar corretoras publicas
 *     parameters:
 *       - { name: page, in: query, schema: { type: integer } }
 *       - { name: limit, in: query, schema: { type: integer } }
 *       - { name: city, in: query, schema: { type: string } }
 *       - { name: search, in: query, schema: { type: string } }
 *     responses:
 *       200: { description: Lista paginada }
 *
 * /api/public/corretoras/cities:
 *   get:
 *     tags: [Public - Corretoras]
 *     summary: Listar cidades com corretoras
 *     responses:
 *       200: { description: Lista de cidades }
 *
 * /api/public/corretoras/submit:
 *   post:
 *     tags: [Public - Corretoras]
 *     summary: Submeter cadastro de corretora
 *     responses:
 *       201: { description: Submissao enviada }
 *
 * /api/public/corretoras/{slug}:
 *   get:
 *     tags: [Public - Corretoras]
 *     summary: Detalhe da corretora por slug
 *     parameters:
 *       - { name: slug, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Corretora }
 *       404: { description: Nao encontrada }
 *
 * /api/uploads/check/{path}:
 *   get:
 *     tags: [Utils]
 *     summary: Verificar se arquivo existe em uploads
 *     parameters:
 *       - { name: path, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Informacoes do arquivo }
 *       404: { description: Arquivo nao encontrado }
 */
