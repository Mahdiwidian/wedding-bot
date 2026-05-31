import { useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } from 'baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { CommandHandler } from './commands.js';
import { db } from '../services/database.js';
import { storage } from '../services/storage.js';
import { excelService } from '../services/excel.js';
import { config } from '../config.js';
import path from 'path';
import fs from 'fs-extra';

export class WhatsAppBot {
  constructor() {
    this.sock = null;
    this.commandHandler = new CommandHandler(this);
    this.authDir = path.join(process.cwd(), 'auth');
    this.isConnected = false;
    this.isReconnecting = false;
  }

  async start() {
    try {
      // Initialize storage (fallback)
      await storage.init();
      await excelService.init();

      // Initialize database
      const dbConnected = await db.init();

      if (dbConnected) {
        console.log('[INFO] Database connected');
      } else {
        console.log('[WARN] Database not configured - using JSON storage fallback');
      }

      // Ensure auth directory exists
      await fs.ensureDir(this.authDir);

      // Load auth state
      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

      // Fetch latest version
      const { version } = await fetchLatestBaileysVersion();
      console.log('[INFO] Using Baileys version:', version);

      // Create socket
      const { default: makeWASocket } = await import('baileys');

      const sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
        },
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ['WhatsApp Android', 'Android', '2.23.1.17'],
        uploadRequestTimeoutMs: 60000,
        defaultQueryTimeoutMs: 120000,
        connectTimeoutMs: 120000,
        waWebVersion: [2, 3000, 1035194821]
      });

      this.sock = sock;
      this.commandHandler.setSock(sock);

      // Event handlers
      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('messages.upsert', ({ messages }) => {
        this.handleMessages(messages).catch(err => console.error('[ERROR] Handle messages:', err));
      });

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        // Extract status code
        const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.data?.attrs?.code;

        console.log('[DEBUG] Connection:', connection, '| Status:', statusCode);

        if (update.qr) {
          console.log('\n========================================');
          console.log('  SCAN QR CODE NOW!');
          console.log('========================================\n');
          qrcode.generate(update.qr, { small: true });
          console.log('\n----------------------------------------\n');
        }

        if (connection === 'open') {
          this.isConnected = true;
          console.log('[OK] WhatsApp Bot Connected!');
        }

        // This is NORMAL! WhatsApp saves creds then restarts
        // Just reconnect with the saved credentials
        if (connection === 'close') {
          if (statusCode === 515 || statusCode === 'restartRequired') {
            console.log('[INFO] Restart required - reconnecting with saved credentials...');
            if (!this.isReconnecting) {
              this.isReconnecting = true;
              setTimeout(() => {
                this.isReconnecting = false;
                this.start();
              }, 2000);
            }
          } else if (statusCode === 401 || statusCode === 'loggedOut') {
            console.log('[WARN] Session expired - remove auth folder and scan again');
            fs.removeSync(this.authDir);
            console.log('[INFO] Auth cleared. Restart bot to scan new QR.');
          } else if (statusCode === 428) {
            console.log('[WARN] Too many attempts - wait a few minutes');
          } else {
            console.log('[WARN] Connection closed. Status:', statusCode);
          }
        }
      });

      sock.ev.on('group-participants.update', ({ id, participants, action }) => {
        console.log('[DEBUG] Group update:', { id, action, participants });
      });

      console.log('[OK] Wedding Bot is ready! Waiting for connection...');
      return this;

    } catch (error) {
      console.error('[ERROR] Bot start error:', error);
      throw error;
    }
  }

  async handleMessages(messages) {
    for (const message of messages) {
      // Skip own messages and status
      if (!message.message || message.key?.fromMe) continue;

      const remoteJid = message.key.remoteJid;

      // Skip broadcast and status
      if (remoteJid === 'status@broadcast') continue;

      // Get message text
      const text = this.getMessageText(message);
      if (!text) continue;

      console.log('[INFO] Message from', remoteJid, ':', text.substring(0, 50));

      // Save contact
      await this.saveContact(message);

      // Process message
      try {
        await this.commandHandler.handleMessage(remoteJid, text);
      } catch (error) {
        console.error('[ERROR] Handle message:', error);
        await this.sendMessage(remoteJid, 'Error. Coba lagi.');
      }
    }
  }

  getMessageText(message) {
    const msg = message.message;

    if (msg?.conversation) return msg.conversation;
    if (msg?.extendedTextMessage?.text) return msg.extendedTextMessage.text;
    if (msg?.imageMessage?.caption) return msg.imageMessage.caption;
    if (msg?.videoMessage?.caption) return msg.videoMessage.caption;

    return '';
  }

  async saveContact(message) {
    const jid = message.key.remoteJid;
    const contact = message.pushName || jid.split('@')[0];

    await storage.push('contacts', {
      jid,
      name: contact,
      lastSeen: new Date().toISOString()
    });
  }

  async sendMessage(jid, text) {
    if (!this.sock) return;
    try {
      await this.sock.sendMessage(jid, { text });
    } catch (error) {
      console.error('[ERROR] Send message:', error);
    }
  }

  async sendFile(jid, buffer, filename, options = {}) {
    if (!this.sock) return;
    try {
      await this.sock.sendMessage(jid, {
        document: buffer,
        fileName: filename,
        ...options
      });
    } catch (error) {
      console.error('[ERROR] Send file:', error);
    }
  }

  async logout() {
    if (this.sock) {
      await this.sock.logout();
      this.sock = null;
    }
  }
}
