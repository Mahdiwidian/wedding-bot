# Wedding Planner WhatsApp Bot

WhatsApp bot untuk mengelola persiapan pernikahan dengan AI assistant.

## Features

- 🤖 **AI Chat** - Gemini/Ollama powered assistant
- 📋 **Guest List** - Kelola guest list dan RSVP
- 🏪 **Vendor Management** - Tracking vendor dan status
- 💰 **Budget Tracking** - Planning dan tracking budget
- ✅ **Checklist** - Checklist persiapan pernikahan
- 📅 **Timeline** - Timeline acara
- 📝 **Notes** - Catatan tambahan
- 📊 **Export Excel** - Export data ke Excel dengan template

## Tech Stack

- **Baileys** - WhatsApp Web protocol
- **Gemini AI** / **Ollama** - AI Assistant
- **Express.js** - REST API
- **ExcelJS** - Excel generation
- **JSON Storage** - Flexible data storage

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
SESSION_ID=wedding-bot
GEMINI_API_KEY=your_api_key
AI_PROVIDER=gemini  # or 'ollama'
PORT=3000
```

### 3. Run

```bash
npm start
```

### 4. Scan QR Code

Scan QR code yang muncul di terminal dengan WhatsApp app kamu.

## Commands

### Basic Commands
- `/start` - Welcome message
- `/menu` - Show all commands
- `/help` - Help

### Data Management
- `/guest add [Nama]|[Telepon]` - Add guest
- `/guest list` - List all guests
- `/vendor add [Nama]|[Kategori]` - Add vendor
- `/vendor list` - List vendors
- `/budget add [Deskripsi]|[Estimasi]` - Add budget item
- `/budget list` - Show budget summary
- `/checklist add [Tugas]` - Add checklist
- `/checklist list` - Show checklist
- `/timeline add [Acara]|[Tanggal]` - Add to timeline
- `/timeline list` - Show timeline
- `/note [catatan]` - Add note
- `/notes` - List notes

### Export
- `/export` - Export to Excel
- `/output` - Export to Excel

### AI
- `/ai [pertanyaan]` - Ask AI
- Or just type your message directly

## API Endpoints

### Data
- `GET /api/data` - Get all data
- `GET /api/data/:type` - Get data by type
- `POST /api/data/:type` - Add item
- `PUT /api/data/:type/:id` - Update item
- `DELETE /api/data/:type/:id` - Delete item

### Templates
- `GET /api/templates` - List templates
- `GET /api/templates/:name` - Get template
- `PUT /api/templates/:name` - Update template

### Export
- `GET /api/export` - Export to Excel

### AI
- `POST /api/ai/chat` - Chat with AI
- `GET /api/ai/status` - AI status

## Data Structure

```json
{
  "contacts": [...],
  "guests": [...],
  "vendors": [...],
  "budget": [...],
  "checklist": [...],
  "timeline": [...],
  "notes": [...],
  "settings": {...}
}
```

## Excel Template

Template Excel bisa dikustomisasi di `templates/template.json`:

```json
{
  "sheets": [
    {
      "name": "Guests",
      "dataKey": "guests",
      "fields": [
        { "header": "Nama", "key": "name", "width": 25 }
      ]
    }
  ]
}
```

## Push to Git

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourrepo/wedding-bot.git
git push
```

## License

MIT
