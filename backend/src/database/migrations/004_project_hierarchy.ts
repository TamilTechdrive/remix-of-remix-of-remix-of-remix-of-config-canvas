import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ===== PROJECTS =====
  await knex.schema.createTable('projects', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.string('name', 200).notNullable();
    table.text('description').nullable();
    table.string('status', 20).defaultTo('active'); // active, archived, draft
    table.uuid('owner_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.jsonb('tags').defaultTo('[]');
    table.timestamps(true, true);
    table.index(['owner_id', 'status']);
  });

  // ===== STB MODELS =====
  await knex.schema.createTable('stb_models', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.uuid('project_id').notNullable().references('id').inTable('projects').onDelete('CASCADE');
    table.string('name', 200).notNullable();
    table.text('description').nullable();
    table.string('chipset', 100).nullable();
    table.timestamps(true, true);
    table.index(['project_id']);
  });

  // ===== BUILDS =====
  await knex.schema.createTable('builds', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.uuid('stb_model_id').notNullable().references('id').inTable('stb_models').onDelete('CASCADE');
    table.string('name', 200).notNullable();
    table.string('version', 50).defaultTo('v1.0.0');
    table.text('description').nullable();
    table.string('status', 20).defaultTo('draft'); // draft, in_progress, review, released
    table.uuid('parent_build_id').nullable().references('id').inTable('builds').onDelete('SET NULL');
    table.timestamps(true, true);
    table.index(['stb_model_id', 'status']);
  });

  // ===== LINK CONFIGURATIONS TO BUILDS =====
  await knex.schema.alterTable('configurations', (table) => {
    table.uuid('build_id').nullable().references('id').inTable('builds').onDelete('SET NULL');
    table.uuid('parser_session_id').nullable().references('id').inTable('parser_sessions').onDelete('SET NULL');
    table.index(['build_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configurations', (table) => {
    table.dropColumn('build_id');
    table.dropColumn('parser_session_id');
  });
  await knex.schema.dropTableIfExists('builds');
  await knex.schema.dropTableIfExists('stb_models');
  await knex.schema.dropTableIfExists('projects');
}
