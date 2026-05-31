import fs from 'fs-extra';
import path from 'path';
import { config } from '../config.js';

class Storage {
  constructor() {
    this.dataDir = config.dataDir;
  }

  async init() {
    await fs.ensureDir(this.dataDir);
    await this.ensureDataFiles();
  }

  async ensureDataFiles() {
    const files = [
      'contacts.json',
      'guests.json',
      'vendors.json',
      'budget.json',
      'checklist.json',
      'timeline.json',
      'notes.json',
      'settings.json'
    ];

    for (const file of files) {
      const filePath = path.join(this.dataDir, file);
      if (!await fs.pathExists(filePath)) {
        await fs.writeJson(filePath, file === 'settings.json' ? {} : []);
      }
    }
  }

  async read(type) {
    const filePath = path.join(this.dataDir, `${type}.json`);
    try {
      const data = await fs.readJson(filePath);
      return data;
    } catch {
      return type === 'settings' ? {} : [];
    }
  }

  async write(type, data) {
    const filePath = path.join(this.dataDir, `${type}.json`);
    await fs.writeJson(filePath, data, { spaces: 2 });
    return true;
  }

  async push(type, item) {
    const data = await this.read(type);
    if (Array.isArray(data)) {
      const id = item.id || this.generateId();
      const newItem = { ...item, id, createdAt: new Date().toISOString() };
      data.push(newItem);
      await this.write(type, data);
      return newItem;
    } else if (typeof data === 'object') {
      // Settings - key value store
      Object.assign(data, item);
      await this.write(type, data);
      return item;
    }
  }

  async update(type, id, updates) {
    const data = await this.read(type);
    if (Array.isArray(data)) {
      const index = data.findIndex(item => item.id === id);
      if (index !== -1) {
        data[index] = { ...data[index], ...updates, updatedAt: new Date().toISOString() };
        await this.write(type, data);
        return data[index];
      }
    }
    return null;
  }

  async delete(type, id) {
    const data = await this.read(type);
    if (Array.isArray(data)) {
      const filtered = data.filter(item => item.id !== id);
      await this.write(type, filtered);
      return true;
    }
    return false;
  }

  async find(type, predicate) {
    const data = await this.read(type);
    if (Array.isArray(data)) {
      return data.filter(predicate);
    }
    return [];
  }

  async getById(type, id) {
    const data = await this.read(type);
    if (Array.isArray(data)) {
      return data.find(item => item.id === id);
    }
    return null;
  }

  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Get all data as context for AI
  async getFullContext() {
    const [contacts, guests, vendors, budget, checklist, timeline, notes] = await Promise.all([
      this.read('contacts'),
      this.read('guests'),
      this.read('vendors'),
      this.read('budget'),
      this.read('checklist'),
      this.read('timeline'),
      this.read('notes')
    ]);

    return {
      contacts: contacts.length,
      guests: guests.length,
      vendors: vendors.length,
      budget: budget,
      checklist: checklist,
      timeline: timeline,
      notes: notes
    };
  }

  // Get all data as JSON
  async exportAll() {
    const [contacts, guests, vendors, budget, checklist, timeline, notes, settings] = await Promise.all([
      this.read('contacts'),
      this.read('guests'),
      this.read('vendors'),
      this.read('budget'),
      this.read('checklist'),
      this.read('timeline'),
      this.read('notes'),
      this.read('settings')
    ]);

    return {
      exportedAt: new Date().toISOString(),
      contacts,
      guests,
      vendors,
      budget,
      checklist,
      timeline,
      notes,
      settings
    };
  }
}

export const storage = new Storage();
