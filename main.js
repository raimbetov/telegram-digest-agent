const TelegramConnection = require('./telegram-client');
const MessageFilter = require('./message-filter');
const MessageFetcher = require('./message-fetcher');
const ReportGenerator = require('./report-generator');

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
            console.log('📋 Analyzing your chats and filter settings...\n');
            
            const { client, me } = await this.connection.connect();
            this.filter = new MessageFilter(me);
            
            // Build folder cache if needed
            await this.filter.buildFolderCache(client);
            
            const dialogs = await client.getDialogs({ limit: 100 });
            
            console.log('='.repeat(80));
            console.log(`CHAT FILTERING PREVIEW (Mode: ${process.env.FILTER_MODE || 'smart'})`);
            console.log('='.repeat(80));

            let included = 0, excluded = 0;
            const includedChats = [];
            const excludedChats = [];
            
            dialogs.forEach(dialog => {
                const entity = dialog.entity;
                const title = entity.title || `${entity.firstName || ''} ${entity.lastName || ''}`.trim() || 'Unknown';
                const willInclude = this.filter.shouldIncludeDialog(dialog);
                
                const type = entity.broadcast ? 'channel' : 
                           entity.megagroup || entity.gigagroup ? 'supergroup' :
                           entity.participantsCount !== undefined ? 'group' :
                           entity.bot ? 'bot' : 'dm';
                
                const icon = willInclude ? '✅' : '❌';
                const typeIcon = type === 'dm' ? '👤' : type === 'bot' ? '🤖' : 
                               type === 'channel' ? '📢' : '👥';
                
                const chatInfo = {
                    title,
                    type,
                    members: entity.participantsCount || 'N/A',
                    icon: `${icon} ${typeIcon}`
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
            console.log(`Filter Mode: ${process.env.FILTER_MODE || 'smart'}`);
            
            // Show filter-specific info
            if (process.env.FILTER_MODE === 'allowlist' && process.env.ALLOWED_CHAT_IDS) {
                console.log(`Allowed Chat IDs: ${process.env.ALLOWED_CHAT_IDS}`);
            }
            if (process.env.EXCLUDE_KEYWORDS) {
                console.log(`Excluded Keywords: ${process.env.EXCLUDE_KEYWORDS}`);
            }
            if (process.env.BLOCK_ALL_CHANNELS === 'true') {
                console.log(`Block All Channels: ENABLED`);
            }

        } catch (error) {
            console.error('❌ Error listing chats:', error.message);
        } finally {
            await this.connection.disconnect();
        }
    }

    async testFilters() {
        try {
            console.log('🧪 Testing filter configurations...\n');
            
            const { client, me } = await this.connection.connect();
            this.filter = new MessageFilter(me);
            
            // Test different filter modes
            const modes = ['smart', 'dm_only', 'super_strict', 'no_channels'];
            const dialogs = await client.getDialogs({ limit: 50 });
            
            console.log('='.repeat(80));
            console.log('FILTER MODE COMPARISON');
            console.log('='.repeat(80));
            
            for (const mode of modes) {
                const originalMode = this.filter.filterMode;
                this.filter.filterMode = mode;
                
                let included = 0;
                dialogs.forEach(dialog => {
                    if (this.filter.shouldIncludeDialog(dialog)) included++;
                });
                
                console.log(`📊 ${mode.toUpperCase().padEnd(15)} : ${included}/${dialogs.length} chats included`);
                
                this.filter.filterMode = originalMode;
            }
            
            console.log('\n💡 Use "FILTER_MODE=<mode>" in your .env to change filtering');

        } catch (error) {
            console.error('❌ Error testing filters:', error.message);
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
  node main.js test-filters       Compare different filter modes
  node main.js reports            List recent digest reports

🔧 ENVIRONMENT VARIABLES:
  FILTER_MODE          Filter mode: smart, dm_only, super_strict, no_channels, allowlist, exclude_keywords, exclude_folders
  BLOCK_ALL_CHANNELS   Block all channels: true/false
  ALLOWED_CHAT_IDS     Comma-separated chat IDs (for allowlist mode)
  EXCLUDED_KEYWORDS    Comma-separated keywords to exclude from chat titles
  EXCLUDED_FOLDERS     Comma-separated folder names to exclude
  INCLUDE_ARCHIVED     Include archived chats: true/false
  DEBUG_FILTERING      Show detailed filtering debug info: true/false
  DEBUG_FETCHING       Show detailed message fetching debug info: true/false

💡 FILTER MODES:
  smart         Intelligent filtering (excludes spam, large channels, etc.)
  dm_only       Only direct messages (no groups/channels)
  super_strict  Only DMs and small groups (<50 members) with mentions
  no_channels   Exclude all channels, include DMs and groups
  allowlist     Only specific chat IDs (set ALLOWED_CHAT_IDS)
  exclude_keywords  Exclude chats with specific keywords in titles
  exclude_folders   Exclude chats in specific Telegram folders
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
        await app.connection.disconnect();
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
                
            case 'test-filters':
                await app.testFilters();
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