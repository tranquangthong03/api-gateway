/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {(() => void) | undefined}
 * @returns {Promise<void> | void}
 */
export async function up(pgm) {
  pgm.sql(`
    INSERT INTO model_pricing (provider, model, input_price_per_1k, output_price_per_1k)
    VALUES
      ('gemini', 'gemini-3.5-flash-lite', 0.000300, 0.002500),
      ('groq', 'openai/gpt-oss-20b', 0.000075, 0.000300);
  `);
}

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {(() => void) | undefined}
 * @returns {Promise<void> | void}
 */
export async function down(pgm) {
  pgm.sql(`
    DELETE FROM model_pricing
    WHERE (provider = 'gemini' AND model = 'gemini-3.5-flash-lite')
       OR (provider = 'groq' AND model = 'openai/gpt-oss-20b');
  `);
}
