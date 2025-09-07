# Telegram Weekly Digest Agent

A modular Node.js application that automatically fetches your Telegram messages from the past week and generates AI-powered digest reports using DeepSeek API.

## 🌟 Features

- **Smart Message Filtering** - Multiple filtering modes to focus on important conversations
- **AI-Powered Analysis** - Generates professional weekly digest reports with actionable insights
- **Modular Architecture** - Clean, maintainable code with separate modules for different functions
- **Flexible Configuration** - Extensive customization through environment variables
- **Multiple Output Formats** - Both Markdown and JSON reports
- **Archived Chat Support** - Optionally include archived conversations
- **Debug Mode** - Detailed logging for troubleshooting

## 📋 Prerequisites

- **Node.js** 16.0.0 or higher
- **Telegram API credentials** (API ID and Hash)
- **DeepSeek API key** for AI analysis
- **Phone number** registered with Telegram

## 🚀 Quick Start

### 1. Installation

```bash
# Clone or download the project
cd telegram-digest-agent

# Install dependencies
npm install
```

### 2. Get Telegram API Credentials

1. Visit [my.telegram.org](https://my.telegram.org)
2. Log in with your phone number
3. Go to "API Development Tools"
4. Create a new application
5. Note down your `API ID` and `API Hash`

### 3. Get DeepSeek API Key

1. Visit [DeepSeek Platform](https://platform.deepseek.com)
2. Sign up for an account
3. Generate an API key
4. Note down your API key

### 4. Configuration

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your credentials
nano .env
```

Fill in your `.env` file:
```bash
# Required - Telegram API
TELEGRAM_API_ID=your_api_id_here
TELEGRAM_API_HASH=your_api_hash_here
PHONE_NUMBER=+1234567890

# Required - DeepSeek API
DEEPSEEK_API_KEY=your_deepseek_api_key_here

# Optional - Filtering (see Filter Modes section)
FILTER_MODE=smart
```

### 5. First Run

```bash
# Preview which chats will be included
npm run list

# Generate your first weekly digest
npm start
```

On first run, you'll need to:
1. Enter the verification code sent to your phone
2. Enter 2FA password (if enabled)
3. The session will be saved automatically for future runs

## 📖 Usage

### Basic Commands

```bash
# Generate weekly digest (default)
npm start
# or
node main.js

# Preview chat filtering
npm run list
# or 
node main.js list-chats

# Compare different filter modes
npm run test
# or
node main.js test-filters

# View recent reports
npm run reports
# or
node main.js reports

# Show help
node main.js help
```

### Advanced Usage

```bash
# Generate digest with debug info
DEBUG_FILTERING=true DEBUG_FETCHING=true npm start

# Include archived chats
INCLUDE_ARCHIVED=true npm start

# Use different filter mode for one run
FILTER_MODE=dm_only npm start
```

## 🎛️ Filter Modes

The application supports multiple filtering modes to focus on different types of conversations:

### `smart` (Default)
Intelligent filtering that includes:
- ✅ All direct messages (non-bots)
- ✅ Small-medium groups (≤500 members)  
- ✅ Reasonable channels (≤1000 members)
- ❌ Large spam channels
- ❌ Crypto/trading channels
- ❌ Very large groups

### `dm_only`
Only direct messages:
- ✅ Direct messages from real users
- ❌ All groups and channels
- ❌ Bot messages

### `super_strict`
Minimal noise, maximum relevance:
- ✅ All direct messages
- ✅ Small groups (≤50 members) where you're mentioned
- ❌ Large groups
- ❌ All channels
- ❌ Group messages without mentions

### `no_channels`
Include groups and DMs, exclude channels:
- ✅ Direct messages
- ✅ All groups
- ❌ All channels

### `allowlist`
Only specific chats (whitelist):
- ✅ Only chats in `ALLOWED_CHAT_IDS`
- ❌ Everything else

### `exclude_keywords`
Exclude chats with specific keywords:
- ✅ All chats except those with keywords in titles
- ❌ Chats matching `EXCLUDED_KEYWORDS`

### `exclude_folders`
Exclude chats in specific Telegram folders:
- ✅ All chats except those in excluded folders
- ❌ Chats in `EXCLUDED_FOLDERS`

## ⚙️ Configuration Options

### Core Settings

```bash
# Filter mode (see Filter Modes section)
FILTER_MODE=smart

# Block all channels regardless of filter mode
BLOCK_ALL_CHANNELS=false

# Include archived chats in analysis
INCLUDE_ARCHIVED=false
```

### Filter-Specific Settings

```bash
# For allowlist mode - comma-separated chat IDs
ALLOWED_CHAT_IDS=123456789,987654321

# For exclude_keywords mode - keywords to exclude from titles
EXCLUDED_KEYWORDS=crypto,trading,spam

# For exclude_folders mode - folder names to exclude
EXCLUDED_FOLDERS=archive,old chats,spam
```

### Debug Options

```bash
# Show detailed filtering decisions
DEBUG_FILTERING=true

# Show message fetching progress
DEBUG_FETCHING=true
```

### API Configuration

```bash
# DeepSeek API endpoint (optional, uses default)
DEEPSEEK_API_URL=https://api.deepseek.com/v1/chat/completions
```

## 📊 Understanding the Output

### Weekly Digest Report

The generated report includes:

1. **Executive Summary** - Key highlights and patterns
2. **Action Items** - Messages requiring responses
3. **Important Conversations** - High-priority discussions  
4. **Trending Topics** - Common themes across chats
5. **Communication Stats** - Activity breakdown
6. **Priority Contacts** - People needing attention

### Files Generated

- `weekly-digest-YYYY-MM-DD.md` - Human-readable report
- `weekly-digest-YYYY-MM-DD.json` - Machine-readable data

## 🔧 Troubleshooting

### Common Issues

**"No messages found"**
- Check your filter mode with `npm run list`
- Try a less restrictive filter like `FILTER_MODE=dm_only`
- Enable `INCLUDE_ARCHIVED=true`
- Verify the date range (only includes last 7 days)

**Authentication errors**
- Verify API ID and Hash are correct
- Check phone number format: `+1234567890`
- Clear session: delete `TELEGRAM_SESSION` from .env and re-authenticate

**Rate limiting (FLOOD errors)**
- Wait 30+ minutes before retrying
- Reduce the number of chats being processed
- Use more restrictive filtering

**Missing some DMs**
- Enable debug mode: `DEBUG_FILTERING=true npm run list`
- Check if DMs are classified correctly
- Some DMs might be from bots (filtered by default)
- Check archived chats: `INCLUDE_ARCHIVED=true`

**DeepSeek API errors**
- Verify your API key is correct
- Check your account has sufficient credits
- The app will generate a basic report if AI fails

### Debug Mode

Enable detailed logging to troubleshoot:

```bash
# See which chats are included/excluded
DEBUG_FILTERING=true node main.js list-chats

# See message fetching progress
DEBUG_FETCHING=true node main.js

# Both
DEBUG_FILTERING=true DEBUG_FETCHING=true node main.js
```

### Getting Chat IDs

To find specific chat IDs for allowlist mode:

```bash
# This will show chat IDs in the output
DEBUG_FILTERING=true node main.js list-chats
```

## 🏗️ Architecture

The application uses a modular architecture:

- **`main.js`** - CLI orchestrator and main application logic
- **`telegram-client.js`** - Telegram connection and authentication
- **`message-filter.js`** - Chat and message filtering logic  
- **`message-fetcher.js`** - Message retrieval and processing
- **`report-generator.js`** - AI analysis and report generation

This modular design makes it easy to:
- Debug specific components
- Add new filtering modes
- Extend functionality
- Test individual modules

## 📅 Scheduling

### Running Weekly

To automate weekly digest generation, you can use:

**Linux/macOS (cron):**
```bash
# Edit crontab
crontab -e

# Add line to run every Sunday at 9 AM
0 9 * * 0 cd /path/to/telegram-digest-agent && npm start
```

**Windows (Task Scheduler):**
1. Open Task Scheduler
2. Create Basic Task
3. Set trigger to "Weekly"
4. Set action to start `node main.js` in your project directory

### Docker (Optional)

Create a `Dockerfile` for containerized deployment:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["node", "main.js"]
```

## 🔒 Security & Privacy

### Data Handling
- Messages are processed locally and not stored permanently
- Only sends message excerpts to DeepSeek for analysis
- Session tokens are stored locally in `.env`
- Generated reports contain only summary information

### Best Practices
- Keep your `.env` file secure and never commit it to version control
- Regularly rotate your API keys
- Use environment-specific configurations
- Review generated reports before sharing

### API Usage
- DeepSeek API calls include only message summaries, not full content
- No persistent storage of message content
- Respects Telegram's rate limits and ToS

## 🤝 Contributing

### Adding New Filter Modes

1. Add the new mode to `message-filter.js`:
```javascript
case 'my_new_mode':
    return myCustomFilterLogic(entity, isChannel, isGroup, isBot, isDM);
```

2. Update the help text in `main.js`
3. Add configuration options to `.env.example`
4. Update this README

### Adding New Report Formats

1. Extend `report-generator.js` with new output methods
2. Add CLI options in `main.js`
3. Update documentation

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

If you encounter issues:

1. Check this README's troubleshooting section
2. Enable debug mode to get more information
3. Check that all credentials are correctly configured
4. Ensure you have sufficient API credits for DeepSeek

For persistent issues, please provide:
- Your Node.js version (`node --version`)
- Relevant debug output
- Sanitized configuration (remove API keys)
- Error messages

## 🔄 Updates

To update the application:

```bash
# Pull latest changes (if using git)
git pull origin main

# Update dependencies
npm update

# Check for breaking changes in this README
```

---

**Happy Digesting! 📧✨**