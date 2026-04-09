"use strict";
// schemas/supportConfigSchemas.js
//
// Zod schemas para configuracao do atendimento.

const { z } = require("zod");

const faqTopicSchema = z.object({
  title: z.string().trim().max(150),
  description: z.string().trim().max(300),
  content: z.array(z.string().trim().max(2000)).optional().default([]),
  icon: z.string().trim().max(50).optional().default(""),
  priority: z.number().int().min(0).optional().default(0),
  active: z.boolean().optional().default(true),
  highlighted: z.boolean().optional().default(false),
});

const trustItemSchema = z.object({
  label: z.string().trim().max(100),
  desc: z.string().trim().max(200),
  icon: z.string().trim().max(50).optional().default(""),
  color: z.string().trim().max(80).optional().default(""),
});

const UpdateSupportConfigSchema = z
  .object({
    // Hero
    hero_badge: z.string().trim().max(100).nullable().optional(),
    hero_title: z.string().trim().max(200).nullable().optional(),
    hero_highlight: z.string().trim().max(200).nullable().optional(),
    hero_description: z.string().trim().max(2000).nullable().optional(),
    hero_cta_primary: z.string().trim().max(80).nullable().optional(),
    hero_cta_secondary: z.string().trim().max(80).nullable().optional(),
    hero_sla: z.string().trim().max(100).nullable().optional(),
    hero_schedule: z.string().trim().max(100).nullable().optional(),
    hero_status: z.string().trim().max(100).nullable().optional(),

    // Canais
    whatsapp_button_label: z.string().trim().max(80).nullable().optional(),
    show_whatsapp_widget: z.boolean().optional(),
    show_chatbot: z.boolean().optional(),

    // Visibilidade
    show_faq: z.boolean().optional(),
    show_form: z.boolean().optional(),
    show_trust: z.boolean().optional(),

    // Formulario
    form_title: z.string().trim().max(200).nullable().optional(),
    form_subtitle: z.string().trim().max(300).nullable().optional(),
    form_success_title: z.string().trim().max(200).nullable().optional(),
    form_success_message: z.string().trim().max(2000).nullable().optional(),

    // FAQ
    faq_title: z.string().trim().max(200).nullable().optional(),
    faq_subtitle: z.string().trim().max(300).nullable().optional(),
    faq_topics: z.array(faqTopicSchema).nullable().optional(),

    // Confianca
    trust_title: z.string().trim().max(200).nullable().optional(),
    trust_subtitle: z.string().trim().max(300).nullable().optional(),
    trust_items: z.array(trustItemSchema).nullable().optional(),
  })
  .strict();

module.exports = { UpdateSupportConfigSchema };
