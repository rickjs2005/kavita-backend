-- Migration: Add tokenVersion column to usuarios and admins tables
-- Purpose: Enables logout revocation by incrementing tokenVersion,
--          invalidating all previously issued JWTs for that account.

ALTER TABLE `usuarios`
  ADD COLUMN `tokenVersion` INT NOT NULL DEFAULT 1;

ALTER TABLE `admins`
  ADD COLUMN `tokenVersion` INT NOT NULL DEFAULT 1;
