# Telegram Weekly Digest Agent

A focused Node.js application that automatically fetches your Telegram messages from the past week and generates AI-powered digest reports using DeepSeek API. Filters out noise (channels, crypto/spam groups) to focus on what matters: your direct messages and clean group conversations.

## 🌟 Features

- **Focused Filtering** - Automatically excludes channels and crypto/spam groups
- **AI-Powered Analysis** - Generates professional weekly digest reports with actionable insights using DeepSeek
- **7-Day Time Window** - Only analyzes messages from the last 7 days
- **All DMs Included** - Every direct message conversation is analyzed, regardless of volume
- **Archived Chat Support** - Optionally include archived conversations
- **Multiple Output Formats** - Both Markdown and JSON reports
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

Create a `.env` file in the project root:

```bash
# Required - Telegram API
TELEGRAM_API_ID=your_api_id_here
TELEGRAM_API_HASH=your_api_hash_here
PHONE_NUMBER=+1234567890

# Required - DeepSeek API
DEEPSEEK_API_KEY=your_deepseek_api_key_here

# Optional - Include archived chats (default: false)
# INCLUDE_ARCHIVED=true

# Optional - Enable debug logging
# DEBUG_FILTERING=true
# DEBUG_FETCHING=true
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

### Commands

```bash
# Generate weekly digest (default)
npm start
# or
node main.js

# Preview chat filtering
npm run list
# or
node main.js list-chats

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
```

## 🎯 How Filtering Works

The app uses a **single, focused filtering strategy**:

### ✅ What's INCLUDED:
- **All direct messages (DMs)** - Every DM conversation, archived or not
- **Clean group conversations** - Groups without crypto/spam keywords
- **Messages from last 7 days only** - Focused on recent activity

### ❌ What's EXCLUDED:
- **All channels** - No channel noise
- **All bots** - No automated messages
- **Crypto/spam groups** - Filtered by 40+ keywords:
  - Trading & Crypto: bitcoin, ethereum, solana, token, defi, nft, dao, airdrop, etc.
  - Gambling: casino, betting, lottery, jackpot, etc.
  - Spam: pump, signal, moonshot, trending, etc.
- **Spam messages** - Excessive emojis, pump signals, etc.
- **Forwarded messages in groups** - Reduces noise (except your own forwards)

### 📊 Message Analysis

**All DMs are sent to DeepSeek** for complete analysis, ensuring no important 1-on-1 conversations are missed. For groups, the most relevant messages are analyzed (up to 30 per report).

## 📊 Understanding the Output

### Weekly Digest Report

The generated AI report includes:

1. **Executive Summary** - Key highlights and patterns from the week
2. **Action Items** - Messages requiring responses or follow-up
3. **Important Conversations** - High-priority discussions to review
4. **Trending Topics** - Common themes across chats
5. **Communication Stats** - Activity breakdown and engagement patterns
6. **Priority Contacts** - People who need attention or follow-up

### Files Generated

- `weekly-digest-YYYY-MM-DD.md` - Human-readable report
- `weekly-digest-YYYY-MM-DD.json` - Machine-readable data

### Example Output

```
📊 COMMUNICATION STATS:
- Total Messages: 224 (151 received, 73 sent)
- Active Chats: 6
- Top Engagements:
  - Daniel Kravtsov: 157 messages
  - Shakhrizat Imasheva: 23 messages
  - Elena Mishina: 22 messages
```

## 🔧 Troubleshooting

### Common Issues

**"No messages found"**
- Check your chats with `npm run list`
- Enable `INCLUDE_ARCHIVED=true` to check archived chats
- Verify the date range (only includes last 7 days)
- Most chats might be channels or crypto groups (filtered out)

**Authentication errors**
- Verify API ID and Hash are correct
- Check phone number format: `+1234567890`
- Clear session: delete `TELEGRAM_SESSION` from .env and re-authenticate

**Rate limiting (FLOOD errors)**
- Wait 30+ minutes before retrying
- The app respects Telegram's rate limits
- Reduce chat count by archiving unwanted groups

**Missing some DMs**
- Enable debug mode: `DEBUG_FILTERING=true npm run list`
- Check if DMs are in archived chats: `INCLUDE_ARCHIVED=true`
- Verify DMs have messages in last 7 days

**DeepSeek API errors**
- Verify your API key is correct
- Check your account has sufficient credits
- The app will generate a basic fallback report if AI fails

### Debug Mode

Enable detailed logging to troubleshoot:

```bash
# See which chats are included/excluded
DEBUG_FILTERING=true node main.js list-chats

# See message fetching progress
DEBUG_FETCHING=true npm start

# Both
DEBUG_FILTERING=true DEBUG_FETCHING=true npm start
```

## 🏗️ Architecture

The application uses a clean, modular architecture:

- **`main.js`** - CLI orchestrator and main application logic
- **`telegram-client.js`** - Telegram connection and authentication
- **`message-filter.js`** - Simple filtering logic (95 lines)
- **`message-fetcher.js`** - Message retrieval and date filtering
- **`report-generator.js`** - AI analysis and report generation
- **`chat-utils.js`** - Shared utility functions

## 📅 Scheduling

### Running Weekly Automatically

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

### Docker

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
- Only message excerpts (not full content) are sent to DeepSeek for analysis
- Session tokens are stored locally in `.env` (add to `.gitignore`)
- Generated reports contain only summary information

### Best Practices
- Keep your `.env` file secure and never commit it to version control
- The `.gitignore` already excludes `.env`, reports, and session data
- Regularly rotate your API keys
- Review generated reports before sharing

### API Usage
- DeepSeek API receives message summaries for analysis (not full history)
- No persistent storage of message content
- Respects Telegram's rate limits and ToS

## 🤝 Contributing

### Modifying Spam Keywords

The crypto/spam keyword list is in `message-filter.js`:

```javascript
// Edit the spamKeywords array in isSpamChat() method
const spamKeywords = [
    'trading', 'crypto', 'bitcoin', // ... add your keywords
];
```

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

If you encounter issues:

1. Check this README's troubleshooting section
2. Enable debug mode: `DEBUG_FILTERING=true DEBUG_FETCHING=true npm start`
3. Check that all credentials are correctly configured
4. Ensure you have sufficient API credits for DeepSeek

For bug reports, please provide:
- Your Node.js version (`node --version`)
- Relevant debug output
- Sanitized configuration (remove API keys)
- Error messages

## 🔄 Updates

To update the application:

```bash
# Pull latest changes (if using git)
git pull origin master

# Update dependencies
npm update

# Check for breaking changes in this README
```

---

**Happy Digesting! 📧✨**

*Built with Claude Code by Anthropic*
