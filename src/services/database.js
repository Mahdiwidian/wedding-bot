import postgres from 'postgres';
import { config } from '../config.js';

const sql = config.databaseUrl
  ? postgres(config.databaseUrl)
  : null;

class Database {
  async init() {
    if (!sql) {
      console.log('Database not configured - using JSON storage fallback');
      return false;
    }

    await sql`
      CREATE TABLE IF NOT EXISTS field_list (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL DEFAULT 'text',
        label TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        options TEXT,
        required BOOLEAN DEFAULT false,
        "order" INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS data_history (
        id TEXT PRIMARY KEY,
        timestamp TIMESTAMPTZ DEFAULT NOW(),
        version INTEGER DEFAULT 1,
        category TEXT NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        version INTEGER DEFAULT 1,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        date DATE DEFAULT CURRENT_DATE,
        data JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    // Create indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_field_list_category ON field_list(category)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_data_history_category ON data_history(category)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_data_history_timestamp ON data_history(timestamp)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_templates_type ON templates(type)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_notes_date ON notes(date)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_notes_name ON notes(name)`;

    console.log('Database initialized');
    return true;
  }

  // ==================== FIELD LIST ====================

  async getFields(category = null) {
    if (!sql) return [];

    if (category) {
      return sql`SELECT * FROM field_list WHERE category = ${category} ORDER BY "order"`;
    }
    return sql`SELECT * FROM field_list ORDER BY category, "order"`;
  }

  async addField(field) {
    if (!sql) return null;

    const id = field.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const [result] = await sql`
      INSERT INTO field_list (id, name, type, label, category, options, required, "order")
      VALUES (
        ${id},
        ${field.name},
        ${field.type || 'text'},
        ${field.label},
        ${field.category || 'general'},
        ${field.options || null},
        ${field.required || false},
        ${field.order || 0}
      )
      RETURNING *
    `;
    return result;
  }

  async updateField(id, updates) {
    if (!sql) return null;

    const [result] = await sql`
      UPDATE field_list
      SET
        name = COALESCE(${updates.name}, name),
        type = COALESCE(${updates.type}, type),
        label = COALESCE(${updates.label}, label),
        options = COALESCE(${updates.options}, options),
        required = COALESCE(${updates.required}, required),
        "order" = COALESCE(${updates.order}, "order"),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    return result;
  }

  async deleteField(id) {
    if (!sql) return false;
    await sql`DELETE FROM field_list WHERE id = ${id}`;
    return true;
  }

  // ==================== DATA HISTORY ====================

  async getData(category = null, limit = 100) {
    if (!sql) return [];

    if (category) {
      return sql`SELECT * FROM data_history WHERE category = ${category} ORDER BY timestamp DESC LIMIT ${limit}`;
    }
    return sql`SELECT * FROM data_history ORDER BY timestamp DESC LIMIT ${limit}`;
  }

  async getLatestData(category, limit = 50) {
    if (!sql) return [];

    return sql`
      SELECT DISTINCT ON (data->>'id') *
      FROM data_history
      WHERE category = ${category}
      ORDER BY data->>'id', timestamp DESC
      LIMIT ${limit}
    `;
  }

  async addData(category, data) {
    if (!sql) return null;

    // Check if item with same id exists, get next version
    const existingVersion = await sql`
      SELECT MAX(version) as max_version FROM data_history
      WHERE data->>'id' = ${data.id || `${Date.now()}`}
    `;

    const version = (existingVersion[0]?.max_version || 0) + 1;
    const id = data.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const [result] = await sql`
      INSERT INTO data_history (id, category, version, data)
      VALUES (${id}, ${category}, ${version}, ${JSON.stringify({ ...data, id })})
      RETURNING *
    `;
    return result;
  }

  async bulkAddData(category, dataArray) {
    if (!sql) return [];

    const results = [];
    for (const data of dataArray) {
      const result = await this.addData(category, data);
      if (result) results.push(result);
    }
    return results;
  }

  async deleteData(id) {
    if (!sql) return false;
    await sql`DELETE FROM data_history WHERE id = ${id}`;
    return true;
  }

  // ==================== TEMPLATES ====================

  async getTemplates(type = null) {
    if (!sql) return [];

    if (type) {
      return sql`SELECT * FROM templates WHERE type = ${type} ORDER BY name`;
    }
    return sql`SELECT * FROM templates ORDER BY type, name`;
  }

  async getTemplate(id) {
    if (!sql) return null;

    const [result] = await sql`SELECT * FROM templates WHERE id = ${id}`;
    return result;
  }

  async getTemplateByName(name, type) {
    if (!sql) return null;

    const [result] = sql`
      SELECT * FROM templates
      WHERE name = ${name} AND type = ${type}
      ORDER BY version DESC
      LIMIT 1
    `;
    return result;
  }

  async saveTemplate(template) {
    if (!sql) return null;

    const id = template.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Get current max version
    const [existing] = await sql`
      SELECT MAX(version) as max_version FROM templates
      WHERE name = ${template.name} AND type = ${template.type}
    `;

    const version = (existing?.max_version || 0) + 1;

    const [result] = await sql`
      INSERT INTO templates (id, name, type, version, data)
      VALUES (${id}, ${template.name}, ${template.type}, ${version}, ${JSON.stringify(template.data)})
      RETURNING *
    `;
    return result;
  }

  async updateTemplate(id, updates) {
    if (!sql) return null;

    const [result] = await sql`
      UPDATE templates
      SET
        name = COALESCE(${updates.name}, name),
        data = COALESCE(${updates.data}, data),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    return result;
  }

  async deleteTemplate(id) {
    if (!sql) return false;
    await sql`DELETE FROM templates WHERE id = ${id}`;
    return true;
  }

  // ==================== NOTES ====================

  async getNotes(limit = 100) {
    if (!sql) return [];
    return sql`SELECT * FROM notes ORDER BY date DESC, created_at DESC LIMIT ${limit}`;
  }

  async getNotesByDate(date) {
    if (!sql) return [];
    return sql`SELECT * FROM notes WHERE date = ${date} ORDER BY created_at DESC`;
  }

  async getNote(id) {
    if (!sql) return null;
    const [result] = await sql`SELECT * FROM notes WHERE id = ${id}`;
    return result;
  }

  async addNote(note) {
    if (!sql) return null;

    const id = note.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const [result] = await sql`
      INSERT INTO notes (id, name, date, data)
      VALUES (
        ${id},
        ${note.name},
        ${note.date || new Date().toISOString().split('T')[0]},
        ${JSON.stringify(note.data || {})}
      )
      RETURNING *
    `;
    return result;
  }

  async updateNote(id, updates) {
    if (!sql) return null;

    const [result] = await sql`
      UPDATE notes
      SET
        name = COALESCE(${updates.name}, name),
        date = COALESCE(${updates.date}, date),
        data = COALESCE(${updates.data}, data),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    return result;
  }

  async deleteNote(id) {
    if (!sql) return false;
    await sql`DELETE FROM notes WHERE id = ${id}`;
    return true;
  }

  async searchNotes(query) {
    if (!sql) return [];
    return sql`
      SELECT * FROM notes
      WHERE name ILIKE ${'%' + query + '%'}
         OR data::text ILIKE ${'%' + query + '%'}
      ORDER BY date DESC, created_at DESC
      LIMIT 50
    `;
  }

  // ==================== STATS ====================

  async getStats() {
    if (!sql) return null;

    const [fieldCount] = await sql`SELECT COUNT(*) as count FROM field_list`;
    const [dataCount] = await sql`SELECT COUNT(*) as count FROM data_history`;
    const [templateCount] = await sql`SELECT COUNT(*) as count FROM templates`;
    const [noteCount] = await sql`SELECT COUNT(*) as count FROM notes`;

    const categories = await sql`
      SELECT category, COUNT(*) as count
      FROM data_history
      GROUP BY category
    `;

    return {
      fields: fieldCount?.count || 0,
      dataRecords: dataCount?.count || 0,
      templates: templateCount?.count || 0,
      notes: noteCount?.count || 0,
      categories: categories || []
    };
  }

  // ==================== UTILITY ====================

  async close() {
    if (sql) await sql.end();
  }
}

export const db = new Database();
