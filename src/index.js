import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { WhatsAppBot } from './bot/wa.js';
import apiRoutes from './routes/api.js';

async function main() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API routes
  app.use('/api', apiRoutes);

  // QR Code endpoint
  app.get('/qr', (req, res) => {
    res.json({ status: 'check_terminal', message: 'Check terminal for QR code' });
  });

  // Start server
  const server = app.listen(config.port, () => {
    console.log(`[OK] Server running on port ${config.port}`);
    console.log(`[OK] API: http://localhost:${config.port}/api`);
  });

  // Initialize WhatsApp bot
  try {
    const bot = new WhatsAppBot();
    await bot.start();

    // Keep process alive
    process.on('SIGINT', async () => {
      console.log('[INFO] Shutting down...');
      await bot.logout();
      server.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('[INFO] Shutting down...');
      await bot.logout();
      server.close();
      process.exit(0);
    });

  } catch (error) {
    console.error('[ERROR] Failed to start bot:', error);
    process.exit(1);
  }
}

main().catch(console.error);
