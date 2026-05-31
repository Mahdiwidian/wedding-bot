import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config.js';

let genAI;

async function getGeminiModel() {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(config.geminiApiKey);
  }
  return genAI.getGenerativeModel({ model: config.geminiModel });
}

export async function generateAIResponse(userMessage, context = '') {
  try {
    if (config.aiProvider === 'gemini') {
      return await generateGeminiResponse(userMessage, context);
    } else if (config.aiProvider === 'ollama') {
      return await generateOllamaResponse(userMessage, context);
    }
    throw new Error(`Unknown AI provider: ${config.aiProvider}`);
  } catch (error) {
    console.error('AI Error:', error);
    return { text: 'Maaf, terjadi kesalahan dengan AI. Coba lagi ya.' };
  }
}

async function generateGeminiResponse(userMessage, context) {
  const model = await getGeminiModel();
  const prompt = buildPrompt(userMessage, context);

  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.text();

  return {
    text,
    actions: parseActions(text)
  };
}

async function generateOllamaResponse(userMessage, context) {
  const prompt = buildPrompt(userMessage, context);

  const response = await fetch(`${config.ollamaBaseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.ollamaModel,
      prompt,
      stream: false
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status}`);
  }

  const data = await response.json();
  return {
    text: data.response,
    actions: parseActions(data.response)
  };
}

function buildPrompt(userMessage, context) {
  let prompt = config.systemPrompt;

  if (context) {
    prompt += `\n\n${context}`;
  }

  prompt += `\n\nUser: ${userMessage}`;
  prompt += `\n\nAssistant:`;
  return prompt;
}

function parseActions(text) {
  // Match format: [[TYPE:data]] or [[TYPE:data|more|data]]
  const actionRegex = /\[\[(\w+):([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  const actions = [];
  let match;

  while ((match = actionRegex.exec(text)) !== null) {
    const actionName = match[1];
    const actionData = match[2];
    const extraData = match[3] ? match[3].split('|') : [];

    actions.push({
      type: actionName,
      data: [actionData, ...extraData]
    });
  }

  return actions;
}

export function parseAction(text) {
  const match = text.match(/\[\[(\w+):([^\]|]+)(?:\|([^\]]+))?\]\]/);
  if (match) {
    return {
      type: match[1],
      data: [match[2], ...(match[3] ? match[3].split('|') : [])]
    };
  }
  return null;
}

export function cleanActionTags(text) {
  return text.replace(/\[\[\w+:[^\]]+\]\]/g, '').trim();
}

export async function checkAIConnection() {
  try {
    if (config.aiProvider === 'gemini') {
      const model = await getGeminiModel();
      await model.generateContent('test');
      return { status: 'ok', provider: 'gemini', model: config.geminiModel };
    } else if (config.aiProvider === 'ollama') {
      const response = await fetch(`${config.ollamaBaseUrl}/api/tags`);
      if (response.ok) {
        const data = await response.json();
        return { status: 'ok', provider: 'ollama', models: data.models?.map(m => m.name) };
      }
    }
    return { status: 'error', message: 'Unknown provider' };
  } catch (error) {
    return { status: 'error', message: error.message };
  }
}

// Build context from database for AI
export async function buildAIContext(db, additionalContext = '') {
  if (!db) {
    return additionalContext || 'Database not connected';
  }

  try {
    // Get all fields grouped by category
    const fields = await db.getFields();
    const fieldCategories = {};

    for (const field of fields) {
      if (!fieldCategories[field.category]) {
        fieldCategories[field.category] = [];
      }
      fieldCategories[field.category].push({
        name: field.name,
        type: field.type,
        label: field.label,
        options: field.options
      });
    }

    // Get latest data for each category
    const categories = Object.keys(fieldCategories);
    const latestData = {};

    for (const category of categories) {
      const data = await db.getLatestData(category, 10);
      latestData[category] = data.map(d => d.data);
    }

    // Get templates
    const templates = await db.getTemplates();
    const templateTypes = {};
    for (const t of templates) {
      if (!templateTypes[t.type]) {
        templateTypes[t.type] = [];
      }
      templateTypes[t.type].push(t.name);
    }

    // Get stats
    const stats = await db.getStats();

    // Build context string
    let context = `=== DATABASE SCHEMA ===`;

    if (Object.keys(fieldCategories).length > 0) {
      context += `\n\nFIELD DEFINITIONS (available fields for each category):`;
      for (const [category, catFields] of Object.entries(fieldCategories)) {
        context += `\n\n[${category.toUpperCase()}]`;
        for (const f of catFields) {
          const opts = f.options ? ` (options: ${f.options})` : '';
          context += `\n  - ${f.name} (${f.type}): ${f.label}${opts}`;
        }
      }
    } else {
      context += `\n\n(No fields defined yet - use ADD_FIELD action to create schema)`;
    }

    context += `\n\n=== DATA SUMMARY ===`;
    context += `\nTotal records: ${stats?.dataRecords || 0}`;
    context += `\nTotal fields: ${stats?.fields || 0}`;
    context += `\nTotal templates: ${stats?.templates || 0}`;

    if (Object.keys(latestData).length > 0) {
      context += `\n\nLATEST DATA (sample):`;
      for (const [category, items] of Object.entries(latestData)) {
        if (items.length > 0) {
          context += `\n\n[${category.toUpperCase()}] (${items.length} items):`;
          for (const item of items.slice(0, 3)) {
            const preview = Object.entries(item)
              .slice(0, 4)
              .map(([k, v]) => `${k}=${v}`)
              .join(', ');
            context += `\n  - ${preview}`;
          }
          if (items.length > 3) {
            context += `\n  ... and ${items.length - 3} more`;
          }
        }
      }
    } else {
      context += `\n\n(No data yet)`;
    }

    if (Object.keys(templateTypes).length > 0) {
      context += `\n\n=== AVAILABLE TEMPLATES ===`;
      for (const [type, names] of Object.entries(templateTypes)) {
        context += `\n${type}: ${names.join(', ')}`;
      }
    }

    if (additionalContext) {
      context += `\n\n=== ADDITIONAL CONTEXT ===\n${additionalContext}`;
    }

    return context;

  } catch (error) {
    console.error('Error building AI context:', error);
    return `Error building context: ${error.message}\n\n${additionalContext || ''}`;
  }
}
