# Telegram Logger System

A Node.js application that automatically logs your Telegram messages with intelligent filtering and generates AI-powered weekly digests.

## Features

- **Real-time message logging** - Captures all your important Telegram conversations
- **Smart filtering** - Multiple modes to filter out spam, crypto channels, and noise
- **AI-powered weekly digests** - Generates professional summaries using DeepSeek AI
- **Flexible deployment** - Works with PM2 for production or direct Node.js for development
- **Multiple filter modes** - From permissive to super strict filtering
- **Automatic log rotation** - Daily log files with automatic file switching

## Installation

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Telegram API credentials
- DeepSeek API key (for digest generation)

### Setup

1. **Clone and install dependencies:**
   ```bash
   git clone <your-repo>
   cd telegram-logger
   npm install
   ```

2. **Install PM2 globally (optional but recommended):**
   ```bash
   npm install -g pm2
   ```

3. **Get Telegram API credentials:**
   - Visit https://my.telegram.org
   - Create a new application
   - Note your `API_ID` and `API_HASH`

4. **Get DeepSeek API key:**
   - Sign up at https://platform.deepseek.com
   - Generate an API key

5. **Create `.env` file:**
   ```env
   TELEGRAM_API_ID=your_api_id
   TELEGRAM_API_HASH=your_api_hash
   PHONE_NUMBER=+1234567890
   DEEPSEEK_API_KEY=your_deepseek_key
   
   # Optional: Session string (will be generated on first run)
   TELEGRAM_SESSION=
   
   # Filtering configuration
   FILTER_MODE=smart
   ```

## First Run & Authentication

### Initial Setup
```bash
node bot.js
```

On first run, you'll need to:
1. Enter your phone verification code
2. Enter 2FA password (if enabled)
3. Copy the generated session string to your `.env` file

The session string allows future runs without re-authentication.

## Filter Modes

Configure message filtering by setting `FILTER_MODE` in your `.env` file:

### 1. Smart Mode (Default)
```env
FILTER_MODE=smart
```
- Blocks large channels (>1000 members)
- Blocks crypto/spam channels by keywords
- Logs DMs and small groups
- Logs mentions in large groups only

### 2. Super Strict Mode
```env
FILTER_MODE=super_strict
```
- Only logs direct messages
- Only logs mentions in ANY group chat
- Blocks ALL channels
- Most restrictive mode

### 3. No Channels Mode
```env
FILTER_MODE=no_channels
```
- Blocks ALL channels
- Logs all DMs and group chats
- Good for personal communication focus

### 4. Keyword Exclusion Mode
```env
FILTER_MODE=exclude_keywords
EXCLUDED_KEYWORDS=crypto,binance,pump,trading,trend,solana,bitcoin
BLOCK_ALL_CHANNELS=true
```
- Excludes chats containing specified keywords
- Optionally blocks all channels
- Customizable keyword list

### 5. Folder Exclusion Mode
```env
FILTER_MODE=exclude_folders
EXCLUDED_FOLDERS=spam,crypto,work
```
- Excludes chats from specific Telegram folders
- Requires properly organized Telegram folders

### 6. Allowlist Mode
```env
FILTER_MODE=allowlist
ALLOWED_CHAT_IDS=123456789,987654321,555666777
```
- Only logs specified chat IDs
- Most restrictive - everything else filtered
- Use `node bot.js list-chats` to get chat IDs

## Usage Commands

### Start Logging
```bash
# Development (foreground)
node bot.js

# Production (background with PM2)
pm2 start bot.js --name telegram-logger
pm2 startup  # Enable auto-start on reboot
pm2 save     # Save current process list
```

### Generate Weekly Digest
```bash
# With PM2
pm2 stop telegram-logger
node bot.js digest
pm2 start telegram-logger

# Or directly
node bot.js digest
```

### View Recent Logs
```bash
node bot.js logs
```

### List Your Chats (for configuration)
```bash
node bot.js list-chats
```

### PM2 Management
```bash
# Check status
pm2 status

# View logs
pm2 logs telegram-logger

# Restart
pm2 restart telegram-logger

# Stop
pm2 stop telegram-logger

# Remove from PM2
pm2 delete telegram-logger
```

## File Structure

```
telegram-logger/
├── bot.js                          # Main application
├── .env                           # Configuration file
├── logs/                          # Daily log files
│   ├── telegram-log-2025-09-01.json
│   ├── telegram-log-2025-08-31.json
│   └── ...
├── weekly-digest-2025-09-01.md    # AI-generated digests
└── package.json
```

## Log File Format

Daily logs are saved as JSON files with this structure:

```json
[
  {
    "timestamp": "2025-09-01T12:14:47.990Z",
    "messageId": 12345,
    "chatId": "123456789",
    "chatTitle": "Important Group",
    "chatType": "group",
    "senderName": "John Doe",
    "senderId": "987654321",
    "text": "Message content here",
    "date": 1693574087,
    "isFromMe": false,
    "isMention": true,
    "filterMode": "smart"
  }
]
```

## Configuration Examples

### Personal Use (Minimal Noise)
```env
FILTER_MODE=super_strict
```

### Business Use (DMs + Important Groups)
```env
FILTER_MODE=smart
```

### Custom Filtering (Block Crypto/Trading)
```env
FILTER_MODE=exclude_keywords
EXCLUDED_KEYWORDS=crypto,binance,trading,pump,signal,trend,moon,lambo
BLOCK_ALL_CHANNELS=true
```

### Specific Chats Only
```env
FILTER_MODE=allowlist
ALLOWED_CHAT_IDS=123456789,987654321
```

## Troubleshooting

### Common Issues

**"Cannot read properties of undefined"**
- Happens during startup when connection isn't fully established
- Bot will recover automatically after a few seconds
- Messages during this period may be skipped

**"FLOOD_WAIT" errors**
- You're being rate limited by Telegram
- Wait 30+ minutes before restarting
- Reduce message processing frequency if persistent

**"Auth error" or session issues**
- Delete the `TELEGRAM_SESSION` from `.env`
- Run `node bot.js` to re-authenticate
- Copy the new session string back to `.env`

**No messages being logged**
- Check your filter mode - might be too restrictive
- Use `node bot.js list-chats` to see available chats
- Try `FILTER_MODE=smart` for testing

**PM2 not starting on reboot**
- Run `pm2 startup` and follow the instructions
- Run `pm2 save` after configuring your processes

### Debug Commands

```bash
# Check if bot is running
pm2 status

# View real-time logs
pm2 logs telegram-logger --lines 50

# Check recent log files
node bot.js logs

# Test configuration
node bot.js list-chats
```

## Security Notes

- **Session string**: Keep your `TELEGRAM_SESSION` secure - it provides full account access
- **API keys**: Never commit `.env` files to version control
- **File permissions**: Ensure log files are only readable by your user
- **Network**: Bot connects directly to Telegram servers (no proxy by default)

## Performance

- **Memory usage**: ~50-100MB typical
- **CPU usage**: Minimal when idle, brief spikes during message processing
- **Storage**: ~1-10MB per day depending on message volume and filtering
- **Network**: Minimal - only receives messages, doesn't send

## Weekly Digest Feature

The AI digest analyzes your logs and provides:

- Executive summary of key conversations
- Action items requiring follow-up
- Important conversations and mentions
- Communication statistics
- Priority contacts needing attention

Generated digests are saved as Markdown files: `weekly-digest-YYYY-MM-DD.md`

## Contributing

This is a personal logging tool. Ensure you comply with:
- Telegram's Terms of Service
- Local privacy laws
- Your organization's data policies
- Obtain consent when logging group conversations

## License

Personal use only. Respect privacy and applicable laws.

---

**Version**: 1.0  
**Last Updated**: September 2025  
**Node.js**: v14+ required  
**Dependencies**: telegram, axios, dotenv