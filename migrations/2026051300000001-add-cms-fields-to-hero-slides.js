"use strict";

// migrations/2026051300000001-add-cms-fields-to-hero-slides.js
//
// Sprint 5 (Hero CMS — 2026-05-09). Adiciona campos editáveis no admin
// para tornar o HeroSection da home pública totalmente configurável
// sem precisar de deploy:
//
//   - badge_icon  VARCHAR(30) NULL  — chave do catálogo (leaf, news,
//                                    chart-line, drone, bell, shield,
//                                    cloud, pie-chart, truck, wallet,
//                                    messages, clock). Validado por
//                                    Zod no backend e mapeado para SVG
//                                    no frontend (lib/heroIcons.tsx).
//
//   - features    JSON NULL         — array de até 4 mini-features
//                                    exibidas abaixo do CTA. Cada item:
//                                      { icon: string, title: string,
//                                        subtitle: string }
//
//   - quick_links JSON NULL         — array de até 5 cards exibidos
//                                    no rodapé do hero. Cada item:
//                                      { icon: string, kicker: string,
//                                        title: string, description: string,
//                                        href?: string }
//
// Todos os campos são opcionais. Slides antigos continuam funcionando
// — o frontend usa fallback hardcoded quando features/quick_links são
// null e mostra ícone default quando badge_icon é null.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("hero_slides", "badge_icon", {
      type: Sequelize.STRING(30),
      allowNull: true,
      after: "badge_text",
    });

    await queryInterface.addColumn("hero_slides", "features", {
      type: Sequelize.JSON,
      allowNull: true,
      after: "badge_icon",
    });

    await queryInterface.addColumn("hero_slides", "quick_links", {
      type: Sequelize.JSON,
      allowNull: true,
      after: "features",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("hero_slides", "quick_links");
    await queryInterface.removeColumn("hero_slides", "features");
    await queryInterface.removeColumn("hero_slides", "badge_icon");
  },
};
