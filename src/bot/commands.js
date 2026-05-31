import { storage } from '../services/storage.js';
import { db } from '../services/database.js';
import { generateAIResponse, buildAIContext, cleanActionTags } from '../services/ai.js';
import { excelService } from '../services/excel.js';

const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args)
};

export class CommandHandler {
  constructor(bot) {
    this.bot = bot;
    this.sock = null;
  }

  setSock(sock) {
    this.sock = sock;
  }

  async handleCommand(remoteJid, command, args) {
    const handlers = {
      '/start': () => this.cmdStart(remoteJid),
      '/help': () => this.cmdHelp(remoteJid),
      '/menu': () => this.cmdMenu(remoteJid),
      '/status': () => this.cmdStatus(remoteJid),
      '/export': () => this.cmdExport(remoteJid),
      '/output': () => this.cmdExport(remoteJid),
      '/list': () => this.cmdList(remoteJid, args),
      '/query': () => this.cmdQuery(remoteJid, args),
      '/final-md': () => this.cmdFinalMd(remoteJid, args),
      '/final-wa': () => this.cmdFinalWa(remoteJid, args),
      '/final-xl': () => this.cmdFinalXl(remoteJid, args)
    };

    const handler = handlers[command.toLowerCase()];
    if (handler) {
      return handler();
    }

    return this.sendMessage(remoteJid, `Command "${command}" tidak dikenal. Ketik /menu untuk melihat daftar perintah.`);
  }

  async handleMessage(remoteJid, text) {
    // Check for command prefix
    if (text.startsWith('/')) {
      const parts = text.slice(1).split(' ');
      const command = '/' + parts[0];
      const args = parts.slice(1);
      return this.handleCommand(remoteJid, command, args);
    }

    // Otherwise, process as AI message
    return this.cmdAI(remoteJid, text);
  }

  async sendMessage(jid, text) {
    if (!this.sock) return;
    try {
      await this.sock.sendMessage(jid, { text });
    } catch (error) {
      logger.error('Send message error:', error);
    }
  }

  async sendFile(jid, buffer, filename, caption = '') {
    if (!this.sock) return;
    try {
      await this.sock.sendMessage(jid, {
        document: buffer,
        fileName: filename,
        caption
      });
    } catch (error) {
      logger.error('Send file error:', error);
    }
  }

  async cmdStart(jid) {
    const message = `Selamat datang di Wedding Planner Bot! 🎊

Saya asisten AI yang akan membantu Anda mengatur persiapan pernikahan.

💬 *Cara Pakai:*
Ketik pesan natural dalam Bahasa Indonesia!

Contoh:
• "Tambahkan guest: Budi Santoso, 0812-3456"
• "Booking venue bulan Juni dong"
• "Buatkan checklist persiapan nikah"
• "Saya mau template invoice Excel"

Saya akan otomatis:
- Menyimpan data ke database
- Membuat schema/field sesuai kebutuhan
- Membuat template jika diminta

📋 *Perintah Cepat:*
/menu - Lihat semua perintah
/export - Export data ke Excel
/status - Status sistem

Selamat perencanaan! 💐`;

    return this.sendMessage(jid, message);
  }

  async cmdHelp(jid) {
    return this.cmdMenu(jid);
  }

  async cmdMenu(jid) {
    const message = `📋 *Menu Wedding Planner Bot*

💬 *Chat AI (Natural Language):*
Langsung ketik pesan untuk ngobrol dengan AI
Contoh: "Tambahkan vendor fotografer"

📊 *Data Commands:*
/list [category] - Lihat data (guest, vendor, checklist, dll)
/query [category] - Query data dari database

📄 *Export:*
/export - Export semua data ke Excel

🔧 *Database:*
/status - Status sistem & stats

💡 *Tips:*
- AI akan otomatis membuat field schema jika belum ada
- Data tersimpan dengan timestamp & version
- Template bisa Excel, Markdown, atau WA message`;

    return this.sendMessage(jid, message);
  }

  async cmdStatus(jid) {
    const stats = await db.getStats();

    if (!stats) {
      return this.sendMessage(jid, `🔧 *System Status:*

✅ Bot: Online
⚠️ Database: Not connected (using JSON storage)

Cek /menu untuk bantuan.`);
    }

    const categoryList = stats.categories
      .map(c => `  • ${c.category}: ${c.count} records`)
      .join('\n') || '  (no data yet)';

    const message = `🔧 *System Status:*

✅ Bot: Online
✅ Database: Connected
📊 Fields: ${stats.fields}
📊 Records: ${stats.dataRecords}
📄 Templates: ${stats.templates}

📂 *Data per Category:*
${categoryList}`;

    return this.sendMessage(jid, message);
  }

  async cmdList(jid, args) {
    const category = args[0]?.toLowerCase() || 'all';
    const limit = parseInt(args[1]) || 20;

    if (category === 'all') {
      const stats = await db.getStats();
      const list = stats?.categories?.map(c => `${c.category}: ${c.count}`).join('\n') || 'No data';
      return this.sendMessage(jid, `📊 *Categories:*\n${list}`);
    }

    if (category === 'notes') {
      const notes = await db.getNotes(limit);
      if (!notes || notes.length === 0) {
        return this.sendMessage(jid, `📝 Notes list kosong.\n\nChat ke AI untuk menambah note!`);
      }
      const preview = notes.slice(0, 10).map((n, i) =>
        `${i + 1}. ${n.name} (${n.date})`
      ).join('\n');
      return this.sendMessage(jid, `📝 *Notes* (${notes.length}):\n\n${preview}`);
    }

    const data = await db.getLatestData(category, limit);

    if (!data || data.length === 0) {
      return this.sendMessage(jid, `📋 ${category} list kosong.\n\nChat ke AI untuk menambah data!`);
    }

    const preview = data.slice(0, 10).map((item, i) => {
      const d = item.data;
      const name = d.name || d.task || d.event || d.description || JSON.stringify(d).slice(0, 30);
      return `${i + 1}. ${name}`;
    }).join('\n');

    return this.sendMessage(jid, `📋 *${category}* (${data.length} items):\n\n${preview}`);
  }

  async cmdQuery(jid, args) {
    const category = args[0]?.toLowerCase();
    const limit = parseInt(args[1]) || 50;

    if (!category) {
      return this.sendMessage(jid, 'Usage: /query [category] [limit]');
    }

    const data = await db.getLatestData(category, limit);
    return this.sendMessage(jid, `📊 Query "${category}" results: ${data.length} records\n\n(Use AI to get detailed analysis)`);
  }

  async cmdExport(jid) {
    await this.sendMessage(jid, '📊 Generating Excel...');

    try {
      const data = await db.getData(null, 1000);
      const workbook = await excelService.exportDataToExcel(data);

      const buffer = await workbook.xlsx.writeBuffer();

      await this.sendFile(jid, Buffer.from(buffer), 'wedding-data.xlsx', '📊 Data Export');

      return true;
    } catch (error) {
      logger.error('Export error:', error);
      return this.sendMessage(jid, '❌ Gagal export. Coba lagi nanti.');
    }
  }

  async cmdAI(jid, text) {
    await this.sendMessage(jid, '🤖 Sedang diproses...');

    // Build context from database
    const context = await buildAIContext(db);
    const response = await generateAIResponse(text, context);

    // Process actions from AI
    if (response.actions && response.actions.length > 0) {
      for (const action of response.actions) {
        await this.executeAIAction(jid, action);
      }
    }

    // Clean action tags from response for display
    const displayText = cleanActionTags(response.text);
    if (displayText) {
      return this.sendMessage(jid, displayText);
    }
  }

  async executeAIAction(jid, action) {
    logger.info('Executing AI action:', action.type, action.data);

    try {
      switch (action.type.toUpperCase()) {
        case 'ADD_FIELD': {
          const [name, type, label, category, options, required] = action.data;
          await db.addField({
            name: name?.trim(),
            type: type?.trim() || 'text',
            label: label?.trim(),
            category: category?.trim() || 'general',
            options: options?.trim() || null,
            required: required === 'true'
          });
          logger.info('Field added:', name);
          break;
        }

        case 'ADD_DATA': {
          const [category, jsonStr] = action.data;
          let data;
          try {
            data = JSON.parse(jsonStr);
          } catch {
            // If not JSON, treat first data as name/description
            data = { name: action.data[0], description: action.data.slice(1).join(' ') };
          }
          await db.addData(category?.trim(), data);
          logger.info('Data added to:', category);
          break;
        }

        case 'UPDATE_DATA': {
          const [id, category, jsonStr] = action.data;
          const updates = JSON.parse(jsonStr);
          // Find and update
          const dataList = await db.getData(category, 1000);
          const item = dataList.find(d => d.id === id || d.data?.id === id);
          if (item) {
            await db.addData(category, { ...item.data, ...updates });
          }
          break;
        }

        case 'DELETE_DATA': {
          const [id, category] = action.data;
          await db.deleteData(id);
          logger.info('Data deleted:', id);
          break;
        }

        case 'ADD_NOTE': {
          const [name, date, jsonStr] = action.data;
          let data = {};
          try {
            data = JSON.parse(jsonStr);
          } catch {
            data = { content: action.data.slice(2).join(' ') };
          }
          await db.addNote({ name, date, data });
          logger.info('Note added:', name);
          break;
        }

        case 'UPDATE_NOTE': {
          const [id, jsonStr] = action.data;
          const updates = JSON.parse(jsonStr);
          await db.updateNote(id, updates);
          logger.info('Note updated:', id);
          break;
        }

        case 'DELETE_NOTE': {
          const [id] = action.data;
          await db.deleteNote(id);
          logger.info('Note deleted:', id);
          break;
        }

        case 'SEARCH_NOTES': {
          const [query] = action.data;
          const notes = await db.searchNotes(query);
          logger.info('Notes search:', query, 'results:', notes.length);
          break;
        }

        case 'SAVE_TEMPLATE': {
          const [name, type, jsonStr] = action.data;
          const templateData = JSON.parse(jsonStr);
          // Normalize type: excel -> xl
          let templateType = type?.trim().toLowerCase();
          if (templateType === 'excel') templateType = 'xl';
          await db.saveTemplate({
            name: name?.trim(),
            type: templateType,
            data: templateData
          });
          logger.info('Template saved:', name, templateType);
          break;
        }

        case 'QUERY': {
          const [category, limit] = action.data;
          const data = await db.getLatestData(category?.trim(), parseInt(limit) || 50);
          logger.info('Query executed:', category, 'results:', data.length);
          // Results will be included in AI response context
          break;
        }

        default:
          logger.warn('Unknown AI action type:', action.type);
      }
    } catch (error) {
      logger.error('Error executing AI action:', error);
    }
  }

  // ==================== FINAL OUTPUT COMMANDS ====================

  async cmdFinalMd(jid, args) {
    const category = args[0]?.toLowerCase();
    const templateName = args[1] || 'default';

    await this.sendMessage(jid, '📄 Generating Markdown...');

    try {
      // Get latest data
      const data = category
        ? await db.getLatestData(category, 100)
        : await db.getLatestData(null, 100);

      // Get template
      const templates = await db.getTemplates('md');
      const template = templates.find(t => t.name === templateName) || templates[0];

      // Build markdown
      let md = '';

      if (template?.data?.content) {
        // Use template structure
        md = this.renderMarkdownFromTemplate(data, template.data, category);
      } else {
        // Default markdown format
        md = this.buildDefaultMarkdown(data, category);
      }

      await this.sendMessage(jid, md);
      return true;
    } catch (error) {
      logger.error('Final MD error:', error);
      return this.sendMessage(jid, '❌ Gagal generate Markdown. Coba lagi.');
    }
  }

  async cmdFinalWa(jid, args) {
    const category = args[0]?.toLowerCase();
    const templateName = args[1] || 'default';

    await this.sendMessage(jid, '💬 Generating WhatsApp message...');

    try {
      // Get latest data
      const data = category
        ? await db.getLatestData(category, 100)
        : await db.getLatestData(null, 100);

      // Get template
      const templates = await db.getTemplates('wa');
      const template = templates.find(t => t.name === templateName) || templates[0];

      // Build WA message
      let waMsg = '';

      if (template?.data?.content) {
        waMsg = this.renderWaFromTemplate(data, template.data, category);
      } else {
        waMsg = this.buildDefaultWaMessage(data, category);
      }

      await this.sendMessage(jid, waMsg);
      return true;
    } catch (error) {
      logger.error('Final WA error:', error);
      return this.sendMessage(jid, '❌ Gagal generate WA message. Coba lagi.');
    }
  }

  async cmdFinalXl(jid, args) {
    const category = args[0]?.toLowerCase();

    await this.sendMessage(jid, '📊 Generating Excel...');

    try {
      // Get latest data
      const data = category
        ? await db.getLatestData(category, 100)
        : await db.getLatestData(null, 100);

      // Get template
      const templates = await db.getTemplates('xl');
      let workbook;

      if (templates.length > 0) {
        workbook = await excelService.exportWithTemplate(data, templates[0].data);
      } else {
        workbook = await excelService.exportDataToExcel(data);
      }

      const buffer = await workbook.xlsx.writeBuffer();
      await this.sendFile(jid, Buffer.from(buffer), `wedding-${category || 'all'}-${Date.now()}.xlsx`, '📊 Data Export');

      return true;
    } catch (error) {
      logger.error('Final XL error:', error);
      return this.sendMessage(jid, '❌ Gagal generate Excel. Coba lagi.');
    }
  }

  // ==================== TEMPLATE RENDERERS ====================

  buildDefaultMarkdown(data, category) {
    let md = '# 📋 Wedding Planner Report\n\n';
    md += `*Generated: ${new Date().toLocaleString('id-ID')}*\n\n`;

    // Group by category
    const grouped = {};
    for (const item of data) {
      const cat = item.category || 'general';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    }

    for (const [cat, items] of Object.entries(grouped)) {
      md += `## ${this.capitalizeFirst(cat)}\n\n`;

      for (const item of items) {
        const d = item.data || {};
        md += `### ${d.name || d.task || d.event || d.description || item.id}\n\n`;

        for (const [key, value] of Object.entries(d)) {
          if (key !== 'id') {
            md += `- **${this.capitalizeFirst(key)}**: ${value}\n`;
          }
        }
        md += '\n';
      }
    }

    return md;
  }

  buildDefaultWaMessage(data, category) {
    let msg = '📋 *Wedding Planner Report*\n\n';
    msg += `📅 ${new Date().toLocaleDateString('id-ID')}\n\n`;

    // Group by category
    const grouped = {};
    for (const item of data) {
      const cat = item.category || 'general';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    }

    for (const [cat, items] of Object.entries(grouped)) {
      msg += `*── ${this.capitalizeFirst(cat)} ──*\n`;

      for (const item of items) {
        const d = item.data || {};
        const name = d.name || d.task || d.event || d.description || 'Item';
        msg += `• ${name}\n`;

        // Show key fields
        const keyFields = ['phone', 'contact', 'status', 'rsvp', 'price', 'budget'];
        for (const field of keyFields) {
          if (d[field]) {
            msg += `  └ ${this.capitalizeFirst(field)}: ${d[field]}\n`;
          }
        }
      }
      msg += '\n';
    }

    return msg;
  }

  renderMarkdownFromTemplate(data, template, category) {
    let content = template.content || '';

    // Replace placeholders
    content = content.replace(/\{\{date\}\}/g, new Date().toLocaleDateString('id-ID'));
    content = content.replace(/\{\{time\}\}/g, new Date().toLocaleTimeString('id-ID'));
    content = content.replace(/\{\{category\}\}/g, category || 'all');

    // Replace data loops
    content = content.replace(/\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, cat, inner) => {
      const catData = data.filter(d => d.category === cat);
      let result = '';
      for (const item of catData) {
        let row = inner;
        for (const [key, value] of Object.entries(item.data || {})) {
          row = row.replace(new RegExp(`\\{\\{${cat}\\.${key}\\}\\}`, 'g'), value || '');
        }
        result += row;
      }
      return result;
    });

    return content;
  }

  renderWaFromTemplate(data, template, category) {
    let content = template.content || '';

    // Replace placeholders
    content = content.replace(/\{\{date\}\}/g, new Date().toLocaleDateString('id-ID'));
    content = content.replace(/\{\{category\}\}/g, category || 'all');

    // Replace data loops (simplified for WA)
    content = content.replace(/\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, cat, inner) => {
      const catData = data.filter(d => d.category === cat);
      let result = '';
      for (const item of catData) {
        let row = inner;
        const d = item.data || {};
        for (const [key, value] of Object.entries(d)) {
          row = row.replace(new RegExp(`\\{\\{${cat}\\.${key}\\}\\}`, 'g'), value || '');
        }
        result += row;
      }
      return result;
    });

    return content;
  }

  capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ');
  }
}
