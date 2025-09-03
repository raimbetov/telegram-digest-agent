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

// FILTERING OPTIONS
const FILTER_MODE = process.env.FILTER_MODE || 'smart'; // 'smart', 'allowlist', 'exclude_folders', 'exclude_keywords', 'no_channels', 'super_strict'
const ALLOWED_CHAT_IDS = process.env.ALLOWED_CHAT_IDS ?
    process.env.ALLOWED_CHAT_IDS.split(',').map(id => id.trim()) : [];
const EXCLUDED_FOLDERS = process.env.EXCLUDED_FOLDERS ?
    process.env.EXCLUDED_FOLDERS.split(',').map(folder => folder.trim().toLowerCase()) : [];
const EXCLUDED_KEYWORDS = process.env.EXCLUDED_KEYWORDS ?
    process.env.EXCLUDED_KEYWORDS.split(',').map(keyword => keyword.trim().toLowerCase()) : [];
const BLOCK_ALL_CHANNELS = process.env.BLOCK_ALL_CHANNELS === 'true';

class TelegramLoggerSystem {
    constructor() {
        this.client = null;
        this.isRunning = false;
        this.logDir = './logs';
        this.currentLogFile = this.getLogFileName();
        this.folderCache = new Map();
        this.connectionStabilized = false;
        this.chatCache = new Map();
        this.senderCache = new Map();
        this.me = null;
        this.processedMessages = new Set();
        this.lastProcessTime = 0;
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

    // Retry mechanism for API calls
    async retryApiCall(apiCall, maxRetries = 3, delay = 1000) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const result = await apiCall();
                return result;
            } catch (error) {
                if (attempt === maxRetries) {
                    throw error;
                }
                console.log(`⏳ API call failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 1.5;
            }
        }
    }

    // Get chat info with caching and retry
    async getChatInfo(message) {
        const chatId = message.chatId || message.peerId?.channelId || message.peerId?.chatId || message.peerId?.userId;
        if (!chatId) {
            console.log('⚠️  No chat ID found in message');
            return null;
        }

        const chatKey = chatId.toString();

        if (this.chatCache.has(chatKey)) {
            return this.chatCache.get(chatKey);
        }

        try {
            const chat = await this.retryApiCall(() => message.getChat());
            if (chat) {
                this.chatCache.set(chatKey, chat);
                return chat;
            }
        } catch (error) {
            console.log(`⚠️  Failed to get chat info after retries: ${error.message}`);
        }

        return null;
    }

    // Get sender info with proper channel handling
    async getSenderInfo(message) {
        // FIXED: Handle channel messages first
        if (message.peerId?.className === 'PeerChannel') {
            const channelId = message.peerId.channelId.toString();

            // Return cached channel info or create synthetic sender
            if (this.senderCache.has(`channel_${channelId}`)) {
                return this.senderCache.get(`channel_${channelId}`);
            }

            // For channels, try to get the channel info as sender
            try {
                const chat = await this.getChatInfo(message);
                if (chat) {
                    const channelSender = {
                        id: chat.id,
                        firstName: chat.title || 'Channel',
                        lastName: '',
                        username: chat.username || `channel_${channelId}`,
                        isChannel: true
                    };
                    this.senderCache.set(`channel_${channelId}`, channelSender);
                    return channelSender;
                }
            } catch (error) {
                console.log(`⚠️  Could not get channel info: ${error.message}`);
            }

            // Fallback synthetic channel sender
            const fallbackSender = {
                id: channelId,
                firstName: 'Channel',
                lastName: channelId,
                username: `channel_${channelId}`,
                isChannel: true
            };
            this.senderCache.set(`channel_${channelId}`, fallbackSender);
            return fallbackSender;
        }

        // Handle regular messages (DMs, groups)
        const senderId = message.senderId || message.fromId?.userId || message.peerId?.userId;

        if (!senderId) {
            console.log('⚠️  No sender ID found in message');
            return null;
        }

        const senderKey = senderId.toString();

        if (this.senderCache.has(senderKey)) {
            return this.senderCache.get(senderKey);
        }

        try {
            const sender = await this.retryApiCall(() => message.getSender());
            if (sender) {
                this.senderCache.set(senderKey, sender);
                return sender;
            }
        } catch (error) {
            console.log(`⚠️  Failed to get sender info after retries: ${error.message}`);
        }

        return null;
    }

    // Get our own user info with caching
    async getMyInfo() {
        if (this.me) {
            return this.me;
        }

        try {
            this.me = await this.retryApiCall(() => this.client.getMe());
            return this.me;
        } catch (error) {
            console.log(`⚠️  Failed to get own user info: ${error.message}`);
            return null;
        }
    }

    async initialize() {
        const session = new StringSession(SESSION_STRING);
        this.client = new TelegramClient(session, API_ID, API_HASH, {
            connectionRetries: 5,
            retryDelay: 1000,
            autoReconnect: true,
            maxConcurrentDownloads: 1,
            floodSleepThreshold: 60
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

        console.log('⏳ Waiting for connection to stabilize...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        try {
            this.me = await this.retryApiCall(() => this.client.getMe());
            console.log(`👤 Connected as: ${this.me.firstName} ${this.me.lastName || ''} (@${this.me.username || 'no_username'})`);
            this.connectionStabilized = true;
        } catch (error) {
            console.error('❌ Failed to verify connection:', error);
            throw new Error('Connection verification failed');
        }

        if (!SESSION_STRING) {
            console.log('\n🔑 Add this to your .env file:');
            console.log('TELEGRAM_SESSION=' + this.client.session.save());
            console.log('');
        }

        console.log('✅ Connected to Telegram successfully!');

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

    async buildFolderCache() {
        try {
            console.log('🔍 Building folder cache...');

            const dialogs = await this.client.getDialogs({ limit: 500 });

            try {
                const folders = await this.client.invoke({
                    _: 'messages.getDialogFilters'
                });

                const folderMap = new Map();
                if (folders && folders.filters) {
                    folders.filters.forEach(filter => {
                        if (filter.title) {
                            folderMap.set(filter.id, filter.title.toLowerCase());
                        }
                    });
                }

                dialogs.forEach(dialog => {
                    if (dialog.folderId !== undefined) {
                        const folderName = folderMap.get(dialog.folderId) || 'unknown';
                        this.folderCache.set(dialog.entity.id.toString(), folderName);
                    }
                });

                console.log(`📁 Cached ${this.folderCache.size} folder assignments`);
                console.log(`📁 Excluded folders: ${EXCLUDED_FOLDERS.join(', ')}`);

            } catch (folderError) {
                console.warn('⚠️ Could not get folder information:', folderError.message);
                console.log('📁 Folder filtering will be disabled - consider using allowlist or keyword filtering instead');
                this.suggestKeywordFiltering(dialogs);
            }

        } catch (error) {
            console.warn('⚠️ Could not build folder cache:', error.message);
            console.log('📁 Folder filtering will be disabled');
        }
    }

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

    // FIXED: Early channel filtering
    shouldSkipMessage(message) {
        // Skip channel messages in super_strict and no_channels modes
        if (message.peerId?.className === 'PeerChannel') {
            if (FILTER_MODE === 'super_strict' || FILTER_MODE === 'no_channels') {
                return true;
            }

            if (BLOCK_ALL_CHANNELS) {
                return true;
            }
        }

        return false;
    }

    async shouldFilterChat(chatId, chat, sender) {
        const chatIdStr = chatId.toString();

        switch (FILTER_MODE) {
            case 'allowlist':
                if (ALLOWED_CHAT_IDS.length === 0) {
                    console.warn('⚠️ ALLOWLIST mode enabled but no ALLOWED_CHAT_IDS specified!');
                    return false;
                }
                return !ALLOWED_CHAT_IDS.includes(chatIdStr);

            case 'exclude_folders':
                if (EXCLUDED_FOLDERS.length === 0) {
                    return false;
                }

                const chatFolder = this.folderCache.get(chatIdStr);
                if (chatFolder && EXCLUDED_FOLDERS.includes(chatFolder)) {
                    return true;
                }
                return false;

            case 'exclude_keywords':
                if (EXCLUDED_KEYWORDS.length === 0 && !BLOCK_ALL_CHANNELS) {
                    return false;
                }

                if (BLOCK_ALL_CHANNELS && chat.broadcast) {
                    return true;
                }

                if (EXCLUDED_KEYWORDS.length > 0) {
                    const chatTitle = (chat.title || '').toLowerCase();
                    const hasExcludedKeyword = EXCLUDED_KEYWORDS.some(keyword =>
                        chatTitle.includes(keyword)
                    );

                    if (hasExcludedKeyword) {
                        return true;
                    }
                }

                return false;

            case 'super_strict':
                if (chat.broadcast) {
                    return true;
                }
                return false;

            case 'no_channels':
                if (chat.broadcast) {
                    return true;
                }
                return false;

            case 'smart':
            default:
                return this.shouldFilterChatSmart(chat, sender);
        }
    }

    shouldFilterChatSmart(chat, sender) {
        if (chat.broadcast) {
            if (chat.participantsCount && chat.participantsCount > 1000) {
                return true;
            }
            const title = (chat.title || '').toLowerCase();
            const spamChannelKeywords = [
                'trading', 'crypto', 'bitcoin', 'pump', 'signal', 'trend', 'coin',
                'binance', 'solana', 'ethereum', 'token', 'defi', 'nft', 'meme',
                'новости', 'news', 'канал', 'channel'
            ];

            if (spamChannelKeywords.some(keyword => title.includes(keyword))) {
                return true;
            }
        }

        if (sender.bot) {
            const isGroupForSmart = chat.megagroup || chat.gigagroup || (chat.participantsCount !== undefined);
            if (isGroupForSmart) return true;
        }

        return false;
    }

    async logMessage(messageData) {
        try {
            await this.ensureLogDir();

            let logData = [];
            try {
                const existingData = await fs.readFile(this.currentLogFile, 'utf8');
                logData = JSON.parse(existingData);
            } catch (error) {
                // File doesn't exist yet
            }

            logData.push(messageData);
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
        let skippedCount = 0;
        let hourlyCount = 0;
        let hourlyFiltered = 0;
        let hourlySkipped = 0;
        let lastHourlyReport = new Date();

        this.client.addEventHandler(async (event) => {
            try {
                const message = event.message;

                // Skip if no text content
                if (!message.text) return;

                // FIXED: Early message filtering to prevent processing unwanted messages
                if (this.shouldSkipMessage(message)) {
                    filteredCount++;
                    hourlyFiltered++;
                    return;
                }

                // Message deduplication
                const messageKey = `${message.chatId || message.peerId?.channelId || message.peerId?.chatId || message.peerId?.userId}_${message.id}`;
                if (!this.processedMessages) {
                    this.processedMessages = new Set();
                }

                if (this.processedMessages.has(messageKey)) {
                    return;
                }

                if (this.processedMessages.size > 1000) {
                    const oldMessages = Array.from(this.processedMessages).slice(0, 500);
                    oldMessages.forEach(id => this.processedMessages.delete(id));
                }

                // Rate limiting
                if (this.lastProcessTime && Date.now() - this.lastProcessTime < 100) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                this.lastProcessTime = Date.now();

                // Get chat info
                const chat = await this.getChatInfo(message);
                if (!chat) {
                    skippedCount++;
                    hourlySkipped++;
                    console.log('⚠️  Chat info not available, skipping message...');
                    return;
                }

                // Get sender info (now handles channels properly)
                const sender = await this.getSenderInfo(message);
                if (!sender) {
                    skippedCount++;
                    hourlySkipped++;
                    console.log('⚠️  Sender info not available, skipping message...');
                    return;
                }

                this.processedMessages.add(messageKey);

                const me = await this.getMyInfo();
                if (!me) {
                    skippedCount++;
                    hourlySkipped++;
                    console.log('⚠️  Own user info not available, skipping message...');
                    return;
                }

                // Apply filtering
                const shouldFilter = await this.shouldFilterChat(chat.id, chat, sender);
                if (shouldFilter) {
                    filteredCount++;
                    hourlyFiltered++;
                    return;
                }

                // Check group filtering based on mode
                const isGroupChat = chat.megagroup || chat.gigagroup || (chat.participantsCount !== undefined);

                if (FILTER_MODE === 'super_strict') {
                    if (isGroupChat) {
                        const isMention = this.checkMention(message.text, me);
                        if (!isMention) {
                            filteredCount++;
                            hourlyFiltered++;
                            return;
                        }
                    }
                } else if (['smart', 'exclude_keywords'].includes(FILTER_MODE)) {
                    if (isGroupChat && chat.participantsCount > 100) {
                        const isMention = this.checkMention(message.text, me);
                        if (!isMention) {
                            filteredCount++;
                            hourlyFiltered++;
                            return;
                        }
                    }
                }

                // Skip spam messages
                if (this.isSpamMessage(message.text)) {
                    filteredCount++;
                    hourlyFiltered++;
                    return;
                }

                // Skip forwarded messages in groups
                if (isGroupChat && message.fwdFrom) {
                    filteredCount++;
                    hourlyFiltered++;
                    return;
                }

                // Determine chat type
                const chatType = sender.isChannel ? 'channel' :
                                isGroupChat ? 'group' : 'dm';
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
                    filterMode: FILTER_MODE
                };

                await this.logMessage(messageData);

                messageCount++;
                hourlyCount++;

                // Show brief log entry
                const chatDisplay = chatType === 'group' ? `[${messageData.chatTitle}]` :
                                  chatType === 'channel' ? `📢[${messageData.chatTitle}]` :
                                  messageData.chatTitle;
                console.log(`📝 ${new Date().toLocaleTimeString()} - ${chatDisplay} ${messageData.senderName}: ${message.text.substring(0, 60)}...`);

                // Hourly summary
                const now = new Date();
                if (now - lastHourlyReport >= 60 * 60 * 1000) {
                    console.log(`\n⏰ === HOURLY SUMMARY ===`);
                    console.log(`📊 Messages logged: ${hourlyCount}`);
                    console.log(`🚫 Messages filtered: ${hourlyFiltered}`);
                    console.log(`⚠️  Messages skipped: ${hourlySkipped}`);
                    console.log(`📊 Total logged today: ${messageCount}`);
                    console.log(`🚫 Total filtered today: ${filteredCount}`);
                    console.log(`⚠️  Total skipped today: ${skippedCount}`);
                    console.log(`🕐 ${now.toLocaleString()}\n`);

                    hourlyCount = 0;
                    hourlyFiltered = 0;
                    hourlySkipped = 0;
                    lastHourlyReport = now;
                }

                // Rotate log file if new day
                const newLogFile = this.getLogFileName();
                if (newLogFile !== this.currentLogFile) {
                    this.currentLogFile = newLogFile;
                    console.log(`📅 New day - switching to: ${this.currentLogFile}`);
                    messageCount = 0;
                    filteredCount = 0;
                    skippedCount = 0;
                }

            } catch (error) {
                console.error('Error processing message:', error);
                skippedCount++;
                hourlySkipped++;
            }
        }, new NewMessage({}));

        console.log('✅ Listening for messages...');
    }

    isSpamMessage(text) {
        const spamKeywords = [
            '🚀', '💎', 'TO THE MOON', 'HODL', 'BUY NOW', 'PUMP', 'LAMBO',
            'SIGNAL', 'ENTRY', 'TARGET', 'STOP LOSS', 'TP:', 'SL:',
            'CLICK HERE', 'FREE MONEY', 'GUARANTEED', '100X', 'PROFIT',
        ];

        const upperText = text.toUpperCase();
        const hasSpamKeywords = spamKeywords.some(keyword => upperText.includes(keyword));
        const emojiCount = (text.match(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu) || []).length;
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

    async listChats() {
        console.log('📋 Getting your chats and folders...\n');

        try {
            const dialogs = await this.client.getDialogs({ limit: 100 });

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
            console.log('\n# Smart mode (original filtering):');
            console.log('FILTER_MODE=smart');

        } catch (error) {
            console.error('Error listing chats:', error);
        }
    }

    async generateWeeklyDigest() {
        console.log('📊 Generating weekly digest from logs...');

        try {
            const weeklyMessages = await this.collectWeeklyLogs();

            if (weeklyMessages.length === 0) {
                console.log('No messages found in logs for the past week.');
                return;
            }

            console.log(`Found ${weeklyMessages.length} messages from the past week`);

            const digest = await this.generateAIDigest(weeklyMessages);
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

    process.on('SIGINT', () => {
        console.log('\n🛑 Shutting down...');
        logger.stop();
        process.exit(0);
    });

    if (command === 'digest') {
        console.log('📊 Generating weekly digest from logs...');
        await logger.generateWeeklyDigest();

    } else if (command === 'logs') {
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
        await logger.initialize();
        await logger.listChats();

    } else {
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

if (require.main === module) {
    main().catch(console.error);
}

module.exports = TelegramLoggerSystem;
