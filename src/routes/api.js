import { Router } from 'express';
import { storage } from '../services/storage.js';
import { db } from '../services/database.js';
import { excelService } from '../services/excel.js';
import { checkAIConnection, buildAIContext } from '../services/ai.js';
import { generateAIResponse } from '../services/ai.js';

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await db.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== FIELD LIST ====================

router.get('/fields', async (req, res) => {
  try {
    const { category } = req.query;
    const fields = await db.getFields(category);
    res.json(fields);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/fields', async (req, res) => {
  try {
    const field = await db.addField(req.body);
    res.json(field);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/fields/:id', async (req, res) => {
  try {
    const field = await db.updateField(req.params.id, req.body);
    res.json(field);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/fields/:id', async (req, res) => {
  try {
    await db.deleteField(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== DATA HISTORY ====================

router.get('/data', async (req, res) => {
  try {
    const { category, limit } = req.query;
    const data = await db.getData(category, parseInt(limit) || 100);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/data/latest', async (req, res) => {
  try {
    const { category, limit } = req.query;
    const data = await db.getLatestData(category, parseInt(limit) || 50);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/data', async (req, res) => {
  try {
    const { category, data } = req.body;
    if (!category || !data) {
      return res.status(400).json({ error: 'category and data are required' });
    }
    const result = await db.addData(category, data);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/data/bulk', async (req, res) => {
  try {
    const { category, data } = req.body;
    if (!category || !Array.isArray(data)) {
      return res.status(400).json({ error: 'category and data array are required' });
    }
    const results = await db.bulkAddData(category, data);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/data/:id', async (req, res) => {
  try {
    await db.deleteData(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== TEMPLATES ====================

router.get('/templates', async (req, res) => {
  try {
    const { type } = req.query;
    const templates = await db.getTemplates(type);
    res.json(templates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/templates/:id', async (req, res) => {
  try {
    const template = await db.getTemplate(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(template);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/templates', async (req, res) => {
  try {
    const template = await db.saveTemplate(req.body);
    res.json(template);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/templates/:id', async (req, res) => {
  try {
    const template = await db.updateTemplate(req.params.id, req.body);
    res.json(template);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/templates/:id', async (req, res) => {
  try {
    await db.deleteTemplate(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== NOTES ====================

router.get('/notes', async (req, res) => {
  try {
    const { date, limit } = req.query;
    let notes;
    if (date) {
      notes = await db.getNotesByDate(date);
    } else {
      notes = await db.getNotes(parseInt(limit) || 100);
    }
    res.json(notes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/notes/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Query parameter q is required' });
    }
    const notes = await db.searchNotes(q);
    res.json(notes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/notes/:id', async (req, res) => {
  try {
    const note = await db.getNote(req.params.id);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    res.json(note);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/notes', async (req, res) => {
  try {
    const { name, date, data } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    const note = await db.addNote({ name, date, data });
    res.json(note);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/notes/:id', async (req, res) => {
  try {
    const note = await db.updateNote(req.params.id, req.body);
    res.json(note);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/notes/:id', async (req, res) => {
  try {
    await db.deleteNote(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== EXPORT ====================

router.get('/export', async (req, res) => {
  try {
    const { template } = req.query;
    const data = await db.getData(null, 1000);

    let workbook;
    if (template) {
      const tmpl = await db.getTemplate(template);
      workbook = await excelService.exportWithTemplate(data, tmpl?.data);
    } else {
      workbook = await excelService.exportDataToExcel(data);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=wedding-data-${Date.now()}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== AI ====================

// Helper to execute AI actions and return results
async function executeAIAction(action) {
  let result = null;
  try {
    switch (action.type.toUpperCase()) {
      case 'ADD_FIELD':
        await db.addField({
          name: action.data[0]?.trim(),
          type: action.data[1]?.trim() || 'text',
          label: action.data[2]?.trim(),
          category: action.data[3]?.trim() || 'general',
          options: action.data[4]?.trim() || null,
          required: action.data[5] === 'true'
        });
        return { success: true, result: null };

      case 'ADD_DATA':
        const [cat1, jsonStr] = action.data;
        const data = JSON.parse(jsonStr);
        await db.addData(cat1?.trim(), data);
        return { success: true, result: null };

      case 'ADD_NOTE':
        let [noteName, noteDate, noteJson] = action.data;
        // If second param is "note" (category), shift params
        if (noteDate === 'note' || noteDate === 'notes') {
          noteDate = null;
        }
        // If second param looks like JSON, it might be the data
        if (noteDate && noteDate.startsWith('{')) {
          noteJson = noteDate;
          noteDate = null;
        }
        let noteData = {};
        try {
          noteJson = noteJson || noteDate;
          noteData = JSON.parse(noteJson);
        } catch {
          noteData = { content: noteJson || noteDate || '' };
        }
        await db.addNote({
          name: noteName,
          date: noteDate || new Date().toISOString().split('T')[0],
          data: noteData
        });
        return { success: true, result: null };

      case 'GET_NOTE':
        const noteNameToGet = action.data[0];
        const note = await db.getNote(noteNameToGet);
        return { success: true, result: note };

      case 'GET_NOTES':
        const notes = await db.getNotes(100);
        return { success: true, result: notes };

      case 'SEARCH_NOTES':
        const query = action.data[0];
        const searchResults = await db.searchNotes(query);
        return { success: true, result: searchResults };

      case 'QUERY':
        const [qCat, qLimit] = action.data;
        const queryResults = await db.getLatestData(qCat?.trim(), parseInt(qLimit) || 50);
        return { success: true, result: queryResults };

      case 'SAVE_TEMPLATE':
        const [tmplName, tmplType, tmplJson] = action.data;
        const tmplData = JSON.parse(tmplJson);
        await db.saveTemplate({
          name: tmplName,
          type: tmplType === 'excel' ? 'xl' : tmplType,
          data: tmplData
        });
        return { success: true, result: null };

      case 'UPDATE_NOTE':
        const [noteId, updJson] = action.data;
        await db.updateNote(noteId, JSON.parse(updJson));
        return { success: true, result: null };

      case 'DELETE_NOTE':
        await db.deleteNote(action.data[0]);
        return { success: true, result: null };

      case 'DELETE_DATA':
        await db.deleteData(action.data[0]);
        return { success: true, result: null };

      default:
        return { success: false, result: null, error: 'Unknown action' };
    }
  } catch (error) {
    console.error('Execute action error:', error);
    return { success: false, error: error.message };
  }
}

router.post('/ai/chat', async (req, res) => {
  try {
    const { message, context } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Build context from database
    const dbContext = await buildAIContext(db, context);
    const response = await generateAIResponse(message, dbContext);

    // Execute actions automatically and collect results
    const executedActions = [];
    let actionResults = {};

    if (response.actions && response.actions.length > 0) {
      for (const action of response.actions) {
        const result = await executeAIAction(action);
        executedActions.push({ action: action.type, ...result });

        // Store results for query actions
        if (result.result !== null) {
          actionResults[action.type] = result.result;
        }
      }
    }

    // If there are query results, format them for display
    let formattedResponse = response.text;
    if (Object.keys(actionResults).length > 0) {
      // Add results context to AI response
      const resultsContext = formatActionResults(actionResults);
      formattedResponse = response.text + '\n\n' + resultsContext;
    }

    res.json({
      text: formattedResponse,
      actions: response.actions,
      executedActions,
      actionResults
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Format action results for display
function formatActionResults(results) {
  let output = '';

  if (results.SEARCH_NOTES || results.GET_NOTES || results.GET_NOTE) {
    const notes = results.GET_NOTE ? [results.GET_NOTE] : (results.SEARCH_NOTES || results.GET_NOTES || []);
    if (notes.length > 0) {
      output += '\n📝 **Hasil Note:**\n';
      for (const note of notes) {
        if (!note) continue;
        // Parse data - could be string JSON or object
        let content = '';
        if (typeof note.data === 'string') {
          try {
            const parsed = JSON.parse(note.data);
            content = parsed.content || parsed;
          } catch {
            content = note.data;
          }
        } else if (typeof note.data === 'object') {
          content = note.data.content || JSON.stringify(note.data);
        } else {
          content = String(note.data);
        }
        // Replace \n with actual newlines
        content = content.replace(/\\n/g, '\n');
        output += `\n*${note.name}*\n${content.substring(0, 2000)}${content.length > 2000 ? '...' : ''}\n`;
      }
    } else {
      output += '\n📝 *Tidak ada note ditemukan*';
    }
  }

  if (results.QUERY) {
    const data = results.QUERY;
    if (data.length > 0) {
      output += '\n📋 **Checklist:**\n';
      for (const item of data.slice(0, 20)) {
        // Parse item.data if it's a string
        let itemData = item.data;
        if (typeof itemData === 'string') {
          try {
            itemData = JSON.parse(itemData);
          } catch {
            itemData = {};
          }
        }
        const task = itemData?.task || itemData?.name || itemData?.description || item.id;
        const status = itemData?.status || '';
        const deadline = itemData?.deadline || '';
        const statusIcon = status === 'done' ? '✅' : status === 'in_progress' ? '🔄' : '⬜';
        output += `${statusIcon} ${task}`;
        if (deadline) output += ` (${deadline})`;
        output += '\n';
      }
      if (data.length > 20) {
        output += `\n... dan ${data.length - 20} item lagi\n`;
      }
    }
  }

  if (results.GET_NOTE) {
    const note = results.GET_NOTE;
    if (note) {
      let content = '';
      if (typeof note.data === 'string') {
        try {
          const parsed = JSON.parse(note.data);
          content = parsed.content || parsed;
        } catch {
          content = note.data;
        }
      } else if (typeof note.data === 'object') {
        content = note.data.content || JSON.stringify(note.data);
      } else {
        content = String(note.data);
      }
      content = content.replace(/\\n/g, '\n');
      output += `\n📝 **${note.name}**\n${content}`;
    }
  }

  return output;
}

router.get('/ai/status', async (req, res) => {
  try {
    const status = await checkAIConnection();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/ai/context', async (req, res) => {
  try {
    const context = await buildAIContext(db);
    res.json({ context });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== LEGACY JSON STORAGE ====================

router.get('/json/:type', async (req, res) => {
  try {
    const data = await storage.read(req.params.type);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/json/:type', async (req, res) => {
  try {
    const item = await storage.push(req.params.type, req.body);
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/json', async (req, res) => {
  try {
    const data = await storage.exportAll();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
