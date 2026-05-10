"use strict";

/**
 * Migration: Add current-weather columns to news_clima.
 *
 * The existing schema only stored rain (mm_24h, mm_7d). The provider
 * (Open-Meteo) already returns temperature, humidity, wind speed and
 * a weather code in the same request, so this migration just opens
 * room to persist what we were already paying for in network round-trips.
 *
 * All columns are nullable — rows synced before this migration ran will
 * stay NULL until the next sync cycle, and the public CLIMA_SELECT detects
 * column presence dynamically (same pattern as cotacoesRepository's
 * BRL columns) so this migration is safe to ship in any order.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("news_clima", "temperature_c", {
      type: Sequelize.DECIMAL(4, 1),
      allowNull: true,
      comment: "Temperatura atual em graus Celsius (-99.9 a 99.9).",
    });

    await queryInterface.addColumn("news_clima", "humidity_pct", {
      type: Sequelize.TINYINT.UNSIGNED,
      allowNull: true,
      comment: "Umidade relativa do ar em % (0-100).",
    });

    await queryInterface.addColumn("news_clima", "wind_kmh", {
      type: Sequelize.DECIMAL(5, 1),
      allowNull: true,
      comment: "Velocidade do vento em km/h (0-999.9).",
    });

    await queryInterface.addColumn("news_clima", "condition", {
      type: Sequelize.STRING(40),
      allowNull: true,
      comment:
        "Condição atual derivada do weather_code do provider " +
        '(ex: "Ensolarado", "Chuva moderada"). Não é o weather_code cru.',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("news_clima", "temperature_c");
    await queryInterface.removeColumn("news_clima", "humidity_pct");
    await queryInterface.removeColumn("news_clima", "wind_kmh");
    await queryInterface.removeColumn("news_clima", "condition");
  },
};
