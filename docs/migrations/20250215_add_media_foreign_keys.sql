-- Atualiza chaves estrangeiras de imagens para remoção em cascata
-- Ajuste os nomes das tabelas caso utilize configurações personalizadas.

ALTER TABLE `product_images`
  ADD CONSTRAINT `fk_product_images_product`
    FOREIGN KEY (`product_id`) REFERENCES `products`(`id`)
    ON DELETE CASCADE;

ALTER TABLE `colaborador_images`
  ADD CONSTRAINT `fk_colaborador_images_colaborador`
    FOREIGN KEY (`colaborador_id`) REFERENCES `colaboradores`(`id`)
    ON DELETE CASCADE;
