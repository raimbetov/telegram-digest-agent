const TelegramConnection = require('./telegram-client');
const MessageFilter = require('./message-filter');
const MessageFetcher = require('./message-fetcher');
const ReportGenerator = require('./report-generator');
const ChatUtils = require('./chat-utils');

class TelegramDigestApp {
    constructor() {
        this.connection = new TelegramConnection();
        this.filter = null;
        this.fetcher = null;
        this.reporter = new ReportGenerator();
    }

    async generateWeeklyDigest() {
        try {
            // 1. Connect to Telegram
            console.log('🚀 Starting weekly digest generation...');
            const { client, me } = await this.connection.connect();

            // 2. Initialize components
            this.filter = new MessageFilter(me);
            this.fetcher = new MessageFetcher(client, this.filter, this.connection);

            // 3. Fetch messages from regular dialogs
            const messages = await this.fetcher.fetchWeeklyMessages();

            // 4. Optionally check archived dialogs (if enabled)
            if (process.env.INCLUDE_ARCHIVED === 'true') {
                console.log('📁 Checking archived dialogs...');
                const archivedMessages = await this.fetcher.fetchArchivedMessages();
                messages.push(...archivedMessages);
                console.log(`📁 Total messages including archived: ${messages.length}`);
            }

            // 5. Generate and save report
            await this.reporter.generateReport(messages);
            
            console.log('✅ Weekly digest completed successfully!');

        } catch (error) {
            console.error('❌ Error:', error.message);
            
            if (error.message.includes('FLOOD')) {
                console.log('\n⚠️ Rate limited! Wait 30+ minutes before trying again.');
            } else if (error.message.includes('AUTH')) {
                console.log('\n🔑 Authentication failed. Please check your credentials in .env file.');
            } else if (error.message.includes('NETWORK') || error.message.includes('timeout')) {
                console.log('\n🌐 Network error. Please check your internet connection and try again.');
            }
        } finally {
            await this.connection.disconnect();
        }
    }

    async listChats() {
        try {
            console.log('📋 Analyzing your chats...\n');

            const { client, me } = await this.connection.connect();
            this.filter = new MessageFilter(me);

            const dialogs = await client.getDialogs({ limit: 100 });

            console.log('='.repeat(80));
            console.log(`CHAT FILTERING PREVIEW`);
            console.log('='.repeat(80));

            let included = 0, excluded = 0;
            const includedChats = [];
            const excludedChats = [];
            
            dialogs.forEach(dialog => {
                const entity = dialog.entity;
                const title = ChatUtils.getChatTitle(entity);
                const willInclude = this.filter.shouldIncludeDialog(dialog);

                const chatTypeInfo = ChatUtils.getChatType(entity);
                const type = chatTypeInfo.type;
                const icon = ChatUtils.getChatIcon(type, willInclude);

                const chatInfo = {
                    title,
                    type,
                    members: entity.participantsCount || 'N/A',
                    icon: icon
                };

                if (willInclude) {
                    included++;
                    includedChats.push(chatInfo);
                } else {
                    excluded++;
                    excludedChats.push(chatInfo);
                }
            });

            // Display included chats
            if (includedChats.length > 0) {
                console.log('\n🟢 INCLUDED CHATS:');
                includedChats.forEach(chat => {
                    console.log(`${chat.icon} ${chat.title}`);
                    console.log(`   Type: ${chat.type} | Members: ${chat.members}`);
                });
            }

            // Display excluded chats (limited to prevent spam)
            if (excludedChats.length > 0) {
                console.log('\n🔴 EXCLUDED CHATS (showing first 20):');
                excludedChats.slice(0, 20).forEach(chat => {
                    console.log(`${chat.icon} ${chat.title}`);
                    console.log(`   Type: ${chat.type} | Members: ${chat.members}`);
                });
                
                if (excludedChats.length > 20) {
                    console.log(`   ... and ${excludedChats.length - 20} more excluded chats`);
                }
            }

            console.log('\n' + '='.repeat(80));
            console.log(`SUMMARY: ${included} included, ${excluded} excluded`);
            console.log(`Filters: Excluded all channels and crypto/spam groups`);

        } catch (error) {
            console.error('❌ Error listing chats:', error.message);
        } finally {
            await this.connection.disconnect();
        }
    }

    async showReports() {
        console.log('📊 Recent digest reports:\n');
        await this.reporter.listRecentReports();
    }

    printUsage() {
        console.log(`
📖 USAGE:
  node main.js                    Generate weekly digest (default)
  node main.js digest             Generate weekly digest
  node main.js list-chats         Show chats and filtering status
  node main.js reports            List recent digest reports
  node main.js help               Show this help message

🔧 ENVIRONMENT VARIABLES:
  INCLUDE_ARCHIVED     Include archived chats: true/false (default: false)
  DEBUG_FILTERING      Show detailed filtering debug info: true/false
  DEBUG_FETCHING       Show detailed message fetching debug info: true/false

📊 FILTERING:
  The app automatically filters out:
  ❌ All channels
  ❌ All bots
  ❌ Crypto/trading/gambling groups (keyword-based)
  ❌ Spam messages (excessive emojis, pump signals, etc.)

  Includes:
  ✅ All direct messages (DMs)
  ✅ Clean group conversations
  ✅ Messages from the last 7 days only
        `);
    }
}

// Command line interface
async function main() {
    const app = new TelegramDigestApp();
    const command = process.argv[2];

    // Handle Ctrl+C gracefully
    process.on('SIGINT', async () => {
        console.log('\n🛑 Shutting down gracefully...');
        if (app.connection && app.connection.isConnected) {
            await app.connection.disconnect();
        }
        process.exit(0);
    });

    try {
        switch (command) {
            case 'digest':
            case undefined:
                await app.generateWeeklyDigest();
                break;
                
            case 'list-chats':
                await app.listChats();
                break;

            case 'reports':
                await app.showReports();
                break;
                
            case 'help':
            case '--help':
            case '-h':
                app.printUsage();
                break;
                
            default:
                console.log(`❌ Unknown command: ${command}`);
                app.printUsage();
                process.exit(1);
        }
    } catch (error) {
        console.error('💥 Unexpected error:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = TelegramDigestApp;