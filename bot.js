const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
require('dotenv').config();

// Configuration
const API_ID = parseInt(process.env.TELEGRAM_API_ID);
const API_HASH = process.env.TELEGRAM_API_HASH;
const SESSION_STRING = process.env.TELEGRAM_SESSION || '';
const PHONE_NUMBER = process.env.PHONE_NUMBER;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

// NEW FILTERING OPTIONS
const FILTER_MODE = process.env.FILTER_MODE || 'smart'; // 'smart', 'allowlist', 'exclude_folders', 'exclude_keywords', 'no_channels', 'super_strict'
const ALLOWED_CHAT_IDS = process.env.ALLOWED_CHAT_IDS ?
    process.env.ALLOWED_CHAT_IDS.split(',').map(id => id.trim()) : [];
const EXCLUDED_FOLDERS = process.env.EXCLUDED_FOLDERS ?
    process.env.EXCLUDED_FOLDERS.split(',').map(folder => folder.trim().toLowerCase()) : [];
const EXCLUDED_KEYWORDS = process.env.EXCLUDED_KEYWORDS ?
    process.env.EXCLUDED_KEYWORDS.split(',').map(keyword => keyword.trim().toLowerCase()) : [];
// Additional option: block all channels when using keyword filtering
const BLOCK_ALL_CHANNELS = process.env.BLOCK_ALL_CHANNELS === 'true';

class TelegramLoggerSystem {
    constructor() {
        this.client = null;
        this.isRunning = false;
        this.logDir = './logs';
        this.currentLogFile = this.getLogFileName();
        this.folderCache = new Map(); // Cache chat folder assignments
    }

    getLogFileName() {
        const today = new Date().toISOString().split('T')[0];
        return path.join(this.logDir, `telegram-log-${today}.json`);
    }

    async ensureLogDir() {
        try {
            await fs.mkdir(this.logDir, { recursive: true });
        } catch (error) {
            // Directory already exists
        }
    }

    async initialize() {
        const session = new StringSession(SESSION_STRING);
        this.client = new TelegramClient(session, API_ID, API_HASH, {
            connectionRetries: 5,
            retryDelay: 1000
        });

        console.log('🔄 Connecting to Telegram...');

        await this.client.start({
            phoneNumber: async () => PHONE_NUMBER,
            password: async () => {
                const readline = require('readline').createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
                return new Promise(resolve => {
                    readline.question('Enter 2FA password (if enabled): ', (answer) => {
                        readline.close();
                        resolve(answer);
                    });
                });
            },
            phoneCode: async () => {
                const readline = require('readline').createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
                return new Promise(resolve => {
                    readline.question('Enter verification code: ', (answer) => {
                        readline.close();
                        resolve(answer);
                    });
                });
            },
            onError: (err) => console.error('Auth error:', err),
        });

        // Save session for future use
        if (!SESSION_STRING) {
            console.log('\n🔑 Add this to your .env file:');
            console.log('TELEGRAM_SESSION=' + this.client.session.save());
            console.log('');
        }

        console.log('✅ Connected to Telegram successfully!');

        // Initialize folder cache if using folder filtering
        if (FILTER_MODE === 'exclude_folders' && EXCLUDED_FOLDERS.length > 0) {
            await this.buildFolderCache();
        } else if (FILTER_MODE === 'exclude_keywords' && (EXCLUDED_KEYWORDS.length > 0 || BLOCK_ALL_CHANNELS)) {
            console.log(`🚫 Keyword filtering enabled: ${EXCLUDED_KEYWORDS.join(', ')}`);
            if (BLOCK_ALL_CHANNELS) {
                console.log(`📢 Also blocking ALL channels`);
            }
        } else if (FILTER_MODE === 'no_channels') {
            console.log(`📢 Channel blocking enabled - only DMs and groups will be logged`);
        } else if (FILTER_MODE === 'super_strict') {
            console.log(`🔒 Super strict mode - only DMs and mentions in groups will be logged`);
        }
    }

    // NEW: Build cache of chat folders
    async buildFolderCache() {
        try {
            console.log('🔍 Building folder cache...');

            // Get all dialogs (chats)
            const dialogs = await this.client.getDialogs({ limit: 500 });

            // Try to get folder information
            try {
                const folders = await this.client.invoke({
                    _: 'messages.getDialogFilters'
                });

                // Map folder IDs to names
                const folderMap = new Map();
                if (folders && folders.filters) {
                    folders.filters.forEach(filter => {
                        if (filter.title) {
                            folderMap.set(filter.id, filter.title.toLowerCase());
                        }
                    });
                }

                // Cache each chat's folder assignment
                dialogs.forEach(dialog => {
                    if (dialog.folderId !== undefined) {
                        const folderName = folderMap.get(dialog.folderId) || 'unknown';
                        this.folderCache.set(dialog.entity.id.toString(), folderName);
                    }
                });

                console.log(`🔍 Cached ${this.folderCache.size} folder assignments`);
                console.log(`🔍 Excluded folders: ${EXCLUDED_FOLDERS.join(', ')}`);

            } catch (folderError) {
                console.warn('⚠️ Could not get folder information:', folderError.message);
                console.log('🔍 Folder filtering will be disabled - consider using allowlist or keyword filtering instead');

                // Fall back to keyword-based filtering suggestions
                this.suggestKeywordFiltering(dialogs);
            }

        } catch (error) {
            console.warn('⚠️ Could not build folder cache:', error.message);
            console.log('🔍 Folder filtering will be disabled');
        }
    }

    // NEW: Suggest keyword-based filtering when folders don't work
    suggestKeywordFiltering(dialogs) {
        const cryptoKeywords = ['binance', 'crypto', 'bitcoin', 'solana', 'pump', 'trend', 'trading'];
        const cryptoChats = [];

        dialogs.forEach(dialog => {
            const title = dialog.entity.title || '';
            const lowerTitle = title.toLowerCase();

            if (cryptoKeywords.some(keyword => lowerTitle.includes(keyword))) {
                cryptoChats.push({
                    id: dialog.entity.id.toString(),
                    title: title,
                    members: dialog.entity.participantsCount || 'N/A'
                });
            }
        });

        if (cryptoChats.length > 0) {
            console.log('\n💡 SUGGESTION: Based on your chats, you might want to exclude crypto channels:');
            console.log('Add to your .env:');
            console.log('FILTER_MODE=exclude_keywords');
            console.log('EXCLUDED_KEYWORDS=crypto,binance,pump,trading,trend,solana,bitcoin');
            console.log('\nDetected crypto-related chats:');
            cryptoChats.slice(0, 10).forEach(chat => {
                console.log(`  - ${chat.title} (${chat.members} members)`);
            });
        }
    }

    // NEW: Check if chat should be filtered based on current mode
    async shouldFilterChat(chatId, chat, sender) {
        const chatIdStr = chatId.toString();

        switch (FILTER_MODE) {
            case 'allowlist':
                // Only log chats in the allowed list
                if (ALLOWED_CHAT_IDS.length === 0) {
                    console.warn('⚠️ ALLOWLIST mode enabled but no ALLOWED_CHAT_IDS specified!');
                    return false; // Don't filter if no allowlist specified
                }
                return !ALLOWED_CHAT_IDS.includes(chatIdStr);

            case 'exclude_folders':
                // Exclude chats from specified folders
                if (EXCLUDED_FOLDERS.length === 0) {
                    return false; // Don't filter if no folders specified
                }

                const chatFolder = this.folderCache.get(chatIdStr);
                if (chatFolder && EXCLUDED_FOLDERS.includes(chatFolder)) {
                    return true; // Filter out (exclude) this chat
                }
                return false;

            case 'exclude_keywords':
                // NEW: Exclude chats based on title keywords
                if (EXCLUDED_KEYWORDS.length === 0 && !BLOCK_ALL_CHANNELS) {
                    return false; // Don't filter if no keywords specified and not blocking channels
                }

                // First check if we should block all channels
                if (BLOCK_ALL_CHANNELS && chat.broadcast) {
                    return true; // Filter out all channels
                }

                // Apply large group filtering (same as smart mode)
                const isGroupForKeywords = chat.megagroup || chat.gigagroup || (chat.participantsCount !== undefined);
                if (isGroupForKeywords && chat.participantsCount > 100) {
                    // For now, filter out - mentions will be checked later in main logic
                    // Don't return true here, let it be checked for mentions later
                }

                // Check for spam patterns (same as smart mode)
                if (this.isSpamMessage('')) { // We'll check title for spam patterns
                    const title = (chat.title || '').toLowerCase();
                    const spamKeywords = [
                        'signal', 'pump', 'moon', 'gem', 'entry', 'target', 'profit',
                        'guaranteed', '100x', 'lambo', 'hodl', 'buy now', 'free money'
                    ];
                    if (spamKeywords.some(keyword => title.includes(keyword))) {
                        return true; // Filter out spam-titled chats
                    }
                }

                // Then check excluded keywords
                if (EXCLUDED_KEYWORDS.length > 0) {
                    const chatTitle = (chat.title || '').toLowerCase();
                    const hasExcludedKeyword = EXCLUDED_KEYWORDS.some(keyword =>
                        chatTitle.includes(keyword)
                    );

                    if (hasExcludedKeyword) {
                        return true; // Filter out this chat
                    }
                }

                return false;

            case 'super_strict':
                // NEW: Super strict mode - only DMs and mentions in groups
                // Block ALL channels
                if (chat.broadcast) {
                    return true; // Filter out all channels
                }

                // Block ALL groups (we'll check mentions later in main logic)
                const isGroupInFilter = chat.megagroup || chat.gigagroup || (chat.participantsCount !== undefined);
                if (isGroupInFilter) {
                    return false; // Don't filter here, let mentions be checked in main logic
                }

                return false; // Allow DMs through

            case 'no_channels':
                // NEW: Block ALL channels, only allow groups and DMs
                if (chat.broadcast) {
                    return true; // Filter out all channels
                }
                return false;

            case 'smart':
            default:
                // Use the original smart filtering logic
                return this.shouldFilterChatSmart(chat, sender);
        }
    }

    // Original smart filtering logic moved to separate method
    shouldFilterChatSmart(chat, sender) {
        // AGGRESSIVE: Skip ALL channels (broadcast only) unless it's a very small one you might care about
        if (chat.broadcast) {
            // Only allow very small channels (< 1000 members) that might be personal
            if (chat.participantsCount && chat.participantsCount > 1000) {
                return true; // Filter out large channels
            }
            // For smaller channels, still filter if they look like crypto/spam
            const title = (chat.title || '').toLowerCase();
            const spamChannelKeywords = [
                'trading', 'crypto', 'bitcoin', 'pump', 'signal', 'trend', 'coin',
                'binance', 'solana', 'ethereum', 'token', 'defi', 'nft', 'meme',
                'новости', 'news', 'канал', 'channel'
            ];

            if (spamChannelKeywords.some(keyword => title.includes(keyword))) {
                return true; // Filter out channels with spam keywords
            }
        }

        // Skip bots (unless it's a DM with a bot you care about)
        if (sender.bot) {
            const isGroupForSmart = chat.megagroup || chat.gigagroup || (chat.participantsCount !== undefined);
            if (isGroupForSmart) return true; // Skip all bot messages in groups
            // DM with bots are allowed through
        }

        // Skip large groups (>100 members) unless you're mentioned
        const isGroupForSmartFilter = chat.megagroup || chat.gigagroup || (chat.participantsCount !== undefined);
        if (isGroupForSmartFilter && chat.participantsCount > 100) {
            // This will be checked later for mentions
            return false; // Don't filter here, check mentions later
        }

        return false; // Don't filter
    }

    async logMessage(messageData) {
        try {
            await this.ensureLogDir();

            // Read existing log
            let logData = [];
            try {
                const existingData = await fs.readFile(this.currentLogFile, 'utf8');
                logData = JSON.parse(existingData);
            } catch (error) {
                // File doesn't exist yet
            }

            // Add new message
            logData.push(messageData);

            // Write back to file
            await fs.writeFile(this.currentLogFile, JSON.stringify(logData, null, 2));

        } catch (error) {
            console.error('Error logging message:', error);
        }
    }

    async startLogging() {
        await this.ensureLogDir();
        console.log('🚀 Starting continuous message logging...');
        console.log(`📝 Logging to: ${this.currentLogFile}`);
        console.log(`🔧 Filter mode: ${FILTER_MODE}`);

        if (FILTER_MODE === 'allowlist' && ALLOWED_CHAT_IDS.length > 0) {
            console.log(`✅ Allowlist: ${ALLOWED_CHAT_IDS.length} chats`);
        }
        if (FILTER_MODE === 'exclude_folders' && EXCLUDED_FOLDERS.length > 0) {
            console.log(`❌ Excluding folders: ${EXCLUDED_FOLDERS.join(', ')}`);
        }
        if (FILTER_MODE === 'exclude_keywords' && EXCLUDED_KEYWORDS.length > 0) {
            console.log(`🚫 Excluding keywords: ${EXCLUDED_KEYWORDS.join(', ')}`);
        }
        if (BLOCK_ALL_CHANNELS) {
            console.log(`📢 Blocking ALL channels - only logging DMs and groups`);
        }
        if (FILTER_MODE === 'no_channels') {
            console.log(`📢 Blocking ALL channels - only logging DMs and groups`);
        }
        if (FILTER_MODE === 'super_strict') {
            console.log(`🔒 SUPER STRICT: Only DMs + mentions in groups`);
        }

        console.log('ℹ️  Press Ctrl+C to stop\n');

        this.isRunning = true;
        let messageCount = 0;
        let filteredCount = 0;
        let hourlyCount = 0;
        let hourlyFiltered = 0;
        let lastHourlyReport = new Date();

        // Listen for new messages
        this.client.addEventHandler(async (event) => {
            try {
                const message = event.message;

                // Skip if no text content
                if (!message.text) return;

                // Get chat and sender info with error handling
                const chat = await message.getChat();
                if (!chat) {
                    console.log('⚠️  Chat info not available yet, skipping message...');
                    return;
                }

                const sender = await message.getSender();
                if (!sender) {
                    console.log('⚠️  Sender info not available yet, skipping message...');
                    return;
                }

                // NEW: Apply filtering based on current mode
                const shouldFilter = await this.shouldFilterChat(chat.id, chat, sender);
                if (shouldFilter) {
                    filteredCount++;
                    hourlyFiltered++;
                    return;
                }

                // Check group filtering based on mode
                const isGroupChat = chat.megagroup || chat.gigagroup || (chat.participantsCount !== undefined);
                const me = await this.client.getMe();

                if (FILTER_MODE === 'super_strict') {
                    // For super_strict mode, block ALL group messages unless mentioned
                    if (isGroupChat) {
                        const isMention = this.checkMention(message.text, me);
                        if (!isMention) {
                            filteredCount++;
                            hourlyFiltered++;
                            return; // Only log if you're mentioned in ANY group
                        }
                    }
                } else if (FILTER_MODE === 'smart') {
                    // For smart mode, still check mentions in large groups
                    if (isGroupChat && chat.participantsCount > 100) {
                        const isMention = this.checkMention(message.text, me);
                        if (!isMention) {
                            filteredCount++;
                            hourlyFiltered++;
                            return; // Only log if you're mentioned in large groups
                        }
                    }
                } else if (FILTER_MODE === 'exclude_keywords') {
                    // For exclude_keywords mode, also check large groups
                    if (isGroupChat && chat.participantsCount > 100) {
                        const isMention = this.checkMention(message.text, me);
                        if (!isMention) {
                            filteredCount++;
                            hourlyFiltered++;
                            return; // Only log if you're mentioned in large groups
                        }
                    }
                }

                // Skip messages with spam indicators (for all modes)
                if (this.isSpamMessage(message.text)) {
                    filteredCount++;
                    hourlyFiltered++;
                    return;
                }

                // Skip forwarded messages in groups (often spam)
                if (isGroupChat && message.fwdFrom) {
                    filteredCount++;
                    hourlyFiltered++;
                    return;
                }

                const chatType = isGroupChat ? 'group' : 'dm';

                // Get your user ID
                const isFromMe = sender.id.toString() === me.id.toString();

                const messageData = {
                    timestamp: new Date().toISOString(),
                    messageId: message.id,
                    chatId: chat.id.toString(),
                    chatTitle: chat.title || `${sender.firstName || ''} ${sender.lastName || ''}`.trim(),
                    chatType: chatType,
                    senderName: isFromMe ? 'ME' : `${sender.firstName || ''} ${sender.lastName || ''}`.trim(),
                    senderId: sender.id.toString(),
                    text: message.text,
                    date: message.date,
                    isFromMe: isFromMe,
                    isMention: this.checkMention(message.text, me),
                    filterMode: FILTER_MODE // Track which filter mode was used
                };

                // Log the message
                await this.logMessage(messageData);

                messageCount++;
                hourlyCount++;

                // Show brief log entry
                const chatDisplay = chatType === 'group' ? `[${messageData.chatTitle}]` : messageData.chatTitle;
                console.log(`📝 ${new Date().toLocaleTimeString()} - ${chatDisplay} ${messageData.senderName}: ${message.text.substring(0, 60)}...`);

                // Hourly summary
                const now = new Date();
                if (now - lastHourlyReport >= 60 * 60 * 1000) { // 1 hour
                    console.log(`\n⏰ === HOURLY SUMMARY ===`);
                    console.log(`📊 Messages logged: ${hourlyCount}`);
                    console.log(`🚫 Messages filtered: ${hourlyFiltered}`);
                    console.log(`📊 Total logged today: ${messageCount}`);
                    console.log(`🚫 Total filtered today: ${filteredCount}`);
                    console.log(`🕐 ${now.toLocaleString()}\n`);

                    hourlyCount = 0;
                    hourlyFiltered = 0;
                    lastHourlyReport = now;
                }

                // Rotate log file if new day
                const newLogFile = this.getLogFileName();
                if (newLogFile !== this.currentLogFile) {
                    this.currentLogFile = newLogFile;
                    console.log(`📅 New day - switching to: ${this.currentLogFile}`);
                    messageCount = 0;
                    filteredCount = 0;
                }

            } catch (error) {
                console.error('Error processing message:', error);
            }
        }, new NewMessage({}));

        console.log('✅ Listening for messages...');
    }

    isSpamMessage(text) {
        const spamKeywords = [
            // Crypto spam
            '🚀', '💎', 'TO THE MOON', 'HODL', 'BUY NOW', 'PUMP', 'LAMBO',
            // Trading signals
            'SIGNAL', 'ENTRY', 'TARGET', 'STOP LOSS', 'TP:', 'SL:',
            // Generic spam
            'CLICK HERE', 'FREE MONEY', 'GUARANTEED', '100X', 'PROFIT',
            // Excessive emojis (3+ in a row)
        ];

        const upperText = text.toUpperCase();

        // Check for spam keywords
        const hasSpamKeywords = spamKeywords.some(keyword => upperText.includes(keyword));

        // Check for excessive emojis (more than 5 emojis total)
        const emojiCount = (text.match(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu) || []).length;

        // Check for excessive caps (more than 50% uppercase)
        const capsCount = (text.match(/[A-Z]/g) || []).length;
        const capsRatio = capsCount / text.length;

        return hasSpamKeywords || emojiCount > 5 || (capsRatio > 0.5 && text.length > 20);
    }

    checkMention(text, me) {
        if (!text) return false;
        const myUsername = me.username;
        const myName = `${me.firstName} ${me.lastName || ''}`.trim();

        return (myUsername && text.includes(`@${myUsername}`)) ||
               text.toLowerCase().includes(myName.toLowerCase());
    }

    // NEW: Helper command to list chat IDs and folders
    async listChats() {
        console.log('📋 Getting your chats and folders...\n');

        try {
            // Get all dialogs
            const dialogs = await this.client.getDialogs({ limit: 100 });

            // Get folders
            let folderMap = new Map();
            try {
                const folders = await this.client.invoke('messages.getDialogFilters', {});
                if (folders && folders.filters) {
                    folders.filters.forEach(filter => {
                        if (filter.title) {
                            folderMap.set(filter.id, filter.title);
                        }
                    });
                }
            } catch (error) {
                console.warn('Could not get folders:', error.message);
            }

            console.log('='.repeat(80));
            console.log('YOUR CHATS AND FOLDERS:');
            console.log('='.repeat(80));

            const groupedChats = { 'No Folder': [] };

            dialogs.forEach(dialog => {
                const entity = dialog.entity;
                const chatInfo = {
                    id: entity.id.toString(),
                    title: entity.title || `${entity.firstName || ''} ${entity.lastName || ''}`.trim(),
                    type: entity.megagroup ? 'supergroup' :
                          entity.gigagroup ? 'gigagroup' :
                          entity.broadcast ? 'channel' :
                          entity.bot ? 'bot' :
                          entity.participantsCount !== undefined ? 'group' : 'dm',
                    members: entity.participantsCount || 'N/A'
                };

                const folderName = dialog.folderId !== undefined && folderMap.has(dialog.folderId)
                    ? folderMap.get(dialog.folderId)
                    : 'No Folder';

                if (!groupedChats[folderName]) {
                    groupedChats[folderName] = [];
                }
                groupedChats[folderName].push(chatInfo);
            });

            // Display organized by folders
            Object.entries(groupedChats).forEach(([folderName, chats]) => {
                if (chats.length > 0) {
                    console.log(`\n📁 ${folderName.toUpperCase()}:`);
                    console.log('-'.repeat(50));

                    chats.forEach(chat => {
                        const typeIcon = chat.type === 'dm' ? '👤' :
                                       chat.type === 'bot' ? '🤖' :
                                       chat.type === 'channel' ? '📢' :
                                       '👥';

                        console.log(`${typeIcon} ${chat.title}`);
                        console.log(`   ID: ${chat.id} | Type: ${chat.type} | Members: ${chat.members}`);
                    });
                }
            });

            console.log('\n' + '='.repeat(80));
            console.log('CONFIGURATION EXAMPLES:');
            console.log('='.repeat(80));
            console.log('\n# Allowlist mode (only log specific chats):');
            console.log('FILTER_MODE=allowlist');
            console.log('ALLOWED_CHAT_IDS=123456789,987654321,555666777');

            console.log('\n# Exclude folders mode:');
            console.log('FILTER_MODE=exclude_folders');
            console.log('EXCLUDED_FOLDERS=spam,crypto,work');

            console.log('\n# Exclude keywords mode (recommended when folders don\'t work):');
            console.log('FILTER_MODE=exclude_keywords');
            console.log('EXCLUDED_KEYWORDS=crypto,binance,pump,trading,trend,solana,bitcoin,ethereum');
            console.log('BLOCK_ALL_CHANNELS=true  # Optional: also block all channels');

            console.log('\n# Block ALL channels mode (most aggressive):');
            console.log('FILTER_MODE=no_channels');
            console.log('# This will only log DMs and group chats, no channels at all');

            console.log('\n# Smart mode (original filtering):');
            console.log('FILTER_MODE=smart');

        } catch (error) {
            console.error('Error listing chats:', error);
        }
    }

    async generateWeeklyDigest() {
        console.log('📊 Generating weekly digest from logs...');

        try {
            // Get all log files from the past week
            const weeklyMessages = await this.collectWeeklyLogs();

            if (weeklyMessages.length === 0) {
                console.log('No messages found in logs for the past week.');
                return;
            }

            console.log(`Found ${weeklyMessages.length} messages from the past week`);

            // Generate AI digest
            const digest = await this.generateAIDigest(weeklyMessages);

            // Save digest report
            await this.saveDigestReport(digest, weeklyMessages.length);

            console.log('✅ Weekly digest generated successfully!');

        } catch (error) {
            console.error('Error generating weekly digest:', error);
        }
    }

    async collectWeeklyLogs() {
        const allMessages = [];
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        try {
            // Read log files from the past 7 days
            for (let i = 0; i < 7; i++) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                const dateStr = date.toISOString().split('T')[0];
                const logFile = path.join(this.logDir, `telegram-log-${dateStr}.json`);

                try {
                    const logData = await fs.readFile(logFile, 'utf8');
                    const messages = JSON.parse(logData);
                    allMessages.push(...messages);
                } catch (error) {
                    // Log file doesn't exist for this day
                }
            }
        } catch (error) {
            console.error('Error reading log files:', error);
        }

        return allMessages;
    }

    async generateAIDigest(messages) {
        // Categorize messages
        const directMessages = messages.filter(msg => msg.chatType === 'dm' && !msg.isFromMe);
        const groupMessages = messages.filter(msg => msg.chatType === 'group');
        const mentions = messages.filter(msg => msg.isMention);
        const myMessages = messages.filter(msg => msg.isFromMe);

        const digestPrompt = `
Analyze this week's Telegram activity and create a professional weekly digest:

DIRECT MESSAGES RECEIVED (${directMessages.length} messages):
${directMessages.slice(0, 20).map(msg =>
    `- ${msg.senderName}: "${msg.text.substring(0, 100)}..." (${new Date(msg.timestamp).toLocaleDateString()})`
).join('\n')}

GROUP ACTIVITY (${groupMessages.length} messages):
${groupMessages.slice(0, 30).map(msg =>
    `- [${msg.chatTitle}] ${msg.senderName}: "${msg.text.substring(0, 100)}..." (${new Date(msg.timestamp).toLocaleDateString()})`
).join('\n')}

MENTIONS & TAGS (${mentions.length} mentions):
${mentions.map(msg =>
    `- [${msg.chatTitle}] ${msg.senderName}: "${msg.text.substring(0, 150)}..." (${new Date(msg.timestamp).toLocaleDateString()})`
).join('\n')}

MY ACTIVITY (${myMessages.length} messages sent):
${myMessages.slice(0, 10).map(msg =>
    `- [${msg.chatTitle}]: "${msg.text.substring(0, 100)}..." (${new Date(msg.timestamp).toLocaleDateString()})`
).join('\n')}

Create a structured weekly report with:
1. EXECUTIVE SUMMARY: Key highlights and patterns
2. ACTION ITEMS: Messages needing responses or follow-up
3. IMPORTANT CONVERSATIONS: High-priority discussions
4. TRENDING TOPICS: Common themes across chats
5. COMMUNICATION STATS: Your activity vs incoming messages
6. PRIORITY CONTACTS: Who needs attention

Be concise, actionable, and professional.
        `;

        try {
            const response = await axios.post(DEEPSEEK_API_URL, {
                model: "deepseek-chat",
                messages: [
                    {
                        role: "system",
                        content: "You are an executive assistant creating weekly communication reports. Focus on actionable insights and clear priorities."
                    },
                    {
                        role: "user",
                        content: digestPrompt
                    }
                ],
                max_tokens: 2000,
                temperature: 0.3
            }, {
                headers: {
                    'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('Error generating digest:', error);
            return 'Error generating digest. Please check your DeepSeek API configuration.';
        }
    }

    async saveDigestReport(digest, totalMessages) {
        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `weekly-digest-${timestamp}.md`;

        const reportContent = `# Weekly Telegram Digest - ${timestamp}

${digest}

---
**Report Statistics:**
- Total Messages Analyzed: ${totalMessages}
- Report Generated: ${new Date().toLocaleString()}
- Log Files Processed: Last 7 days
- Generated by: Telegram Logger System
        `;

        await fs.writeFile(filename, reportContent);
        console.log(`📋 Weekly digest saved as: ${filename}`);
        console.log('\n' + '='.repeat(60));
        console.log(digest);
        console.log('='.repeat(60));
    }

    async start() {
        await this.initialize();
        await this.startLogging();
    }

    stop() {
        this.isRunning = false;
        if (this.client) {
            this.client.disconnect();
        }
        console.log('🛑 Logger stopped');
    }
}

// Command line interface
async function main() {
    const command = process.argv[2];
    const logger = new TelegramLoggerSystem();

    // Handle graceful shutdown for continuous logging
    process.on('SIGINT', () => {
        console.log('\n🛑 Shutting down...');
        logger.stop();
        process.exit(0);
    });

    if (command === 'digest') {
        // Generate weekly digest from existing logs
        console.log('📊 Generating weekly digest from logs...');
        await logger.generateWeeklyDigest();

    } else if (command === 'logs') {
        // Show recent log files
        console.log('📁 Recent log files:');
        try {
            const files = await fs.readdir('./logs');
            const logFiles = files.filter(f => f.startsWith('telegram-log-'));
            logFiles.sort().reverse();

            for (const file of logFiles.slice(0, 7)) {
                const filePath = path.join('./logs', file);
                const data = await fs.readFile(filePath, 'utf8');
                const messages = JSON.parse(data);
                console.log(`  📄 ${file}: ${messages.length} messages`);
            }
        } catch (error) {
            console.log('No logs found yet.');
        }

    } else if (command === 'list-chats') {
        // NEW: List all chats and folders for configuration
        await logger.initialize();
        await logger.listChats();

    } else {
        // Default: start continuous logging
        try {
            await logger.start();
        } catch (error) {
            console.error('Error:', error.message);
            if (error.message.includes('FLOOD')) {
                console.log('\n⚠️  Rate limited! Wait 30+ minutes before trying again.');
            }
        }
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = TelegramLoggerSystem;
