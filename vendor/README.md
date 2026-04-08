# vendor/

Dependencias vendored para resolver conflitos de importacao transitiva.

## browserslist/

Mock do modulo `browserslist` para evitar erros de importacao transitiva do Sequelize CLI.
O `browserslist` e uma dependencia indireta que nao e usada pelo codigo de aplicacao.
O mock exporta um array vazio e e mapeado nos testes via `jest.config.moduleNameMapper`.
