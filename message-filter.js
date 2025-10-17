const ChatUtils = require('./chat-utils');

class MessageFilter {
    constructor(me) {
        this.me = me;
        this.filterMode = process.env.FILTER_MODE || 'smart';
        this.allowedChatIds = process.env.ALLOWED_CHAT_IDS ? 
            process.env.ALLOWED_CHAT_IDS.split(',').map(id => id.trim()) : [];
        this.excludedKeywords = process.env.EXCLUDED_KEYWORDS ?
            process.env.EXCLUDED_KEYWORDS.split(',').map(k => k.trim().toLowerCase()) : [];
        this.excludedFolders = process.env.EXCLUDED_FOLDERS ?
            process.env.EXCLUDED_FOLDERS.split(',').map(f => f.trim().toLowerCase()) : [];
        this.blockAllChannels = process.env.BLOCK_ALL_CHANNELS === 'true';
        this.folderCache = new Map();
    }

    async buildFolderCache(client) {
        if (this.filterMode !== 'exclude_folders' || this.excludedFolders.length === 0) {
            return;
        }

        try {
            console.log('📁 Building folder cache...');
            const dialogs = await client.getDialogs({ limit: 500 });

            const folders = await client.invoke({
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

        } catch (error) {
            console.warn('⚠️ Could not build folder cache:', error.message);
        }
    }

    shouldIncludeDialog(dialog) {
        const entity = dialog.entity;
        const chatId = entity.id.toString();

        // Determine chat types using utility
        const chatTypeInfo = ChatUtils.getChatType(entity);
        const { isChannel, isGroup, isBot, isDM } = chatTypeInfo;

        // Debug logging
        if (process.env.DEBUG_FILTERING === 'true') {
            console.log(`🔍 [${this.filterMode}] ${entity.title || 'Unknown'}: isDM=${isDM}, isGroup=${isGroup}, isChannel=${isChannel}, isBot=${isBot}, members=${entity.participantsCount || 'N/A'}`);
        }

        switch (this.filterMode) {
            case 'allowlist':
                if (this.allowedChatIds.length === 0) {
                    console.warn('⚠️ ALLOWLIST mode enabled but no ALLOWED_CHAT_IDS specified!');
                    return true;
                }
                return this.allowedChatIds.includes(chatId);

            case 'dm_only':
                return isDM && !isBot;

            case 'no_channels':
                // Exclude channels, but also filter spam groups
                if (isChannel) return false;
                if (isGroup && this.isSpamChat(entity)) return false;
                return true;

            case 'super_strict':
                return isDM || (isGroup && entity.participantsCount && entity.participantsCount <= 50);
                
            case 'exclude_keywords':
                if (this.excludedKeywords.length === 0) return true;
                const title = (entity.title || '').toLowerCase();
                return !this.excludedKeywords.some(keyword => title.includes(keyword));

            case 'exclude_folders':
                if (this.excludedFolders.length === 0) return true;
                const chatFolder = this.folderCache.get(chatId);
                if (chatFolder && this.excludedFolders.includes(chatFolder)) {
                    return false;
                }
                return true;
                
            case 'smart':
            default:
                return this.smartFilter(entity, isChannel, isGroup, isBot, isDM);
        }
    }

    isSpamChat(entity) {
        const title = (entity.title || '').toLowerCase();
        const spamKeywords = [
            // Trading & Crypto
            'trading', 'crypto', 'bitcoin', 'btc', 'eth', 'pump', 'signal', 'trend',
            'coin', 'binance', 'solana', 'ethereum', 'token', 'defi', 'nft',
            'doge', 'shib', 'altcoin', 'protocol', 'dao', 'web3', 'blockchain',
            'airdrop', 'presale', 'launch', 'listing', 'dex', 'swap',
            'xrp', 'ripple', 'cardano', 'ada', 'matic', 'polygon', 'bnb',
            'usdt', 'usdc', 'stablecoin', 'luna', 'avax', 'dot', 'link',
            'uni', 'sushi', 'cake', 'farm', 'yield', 'stake', 'mining',
            'hodl', 'fomo', 'ath', 'desci', 'seedify', 'ido', 'ico',
            'pink', 'karma', 'cult', 'nerd', 'labs', 'origo',
            // Gambling
            'casino', 'betting', 'win', 'lottery', 'prize', 'jackpot',
            // Memes & Spam
            'meme', 'trending', 'moonshot', 'gem'
        ];
        return spamKeywords.some(keyword => title.includes(keyword));
    }

    smartFilter(entity, isChannel, isGroup, isBot, isDM) {
        // Always include DMs (non-bots)
        if (isDM && !isBot) return true;

        // Block channels if configured
        if (this.blockAllChannels && isChannel) return false;

        // Filter large channels (>1000 members)
        if (isChannel && entity.participantsCount && entity.participantsCount > 1000) return false;

        // Filter spam channels AND groups by keywords
        if ((isChannel || isGroup) && this.isSpamChat(entity)) {
            return false;
        }

        // Include small-medium groups (up to 500 members)
        if (isGroup && entity.participantsCount && entity.participantsCount <= 500) return true;

        // Include reasonable channels (up to 1000 members)
        if (isChannel && (!entity.participantsCount || entity.participantsCount <= 1000)) return true;

        // Exclude very large groups
        if (isGroup && entity.participantsCount && entity.participantsCount > 500) return false;

        return false;
    }

    shouldIncludeMessage(message, chatType) {
        // Skip empty messages
        if (!message.text || message.text.trim() === '') return false;

        // Skip spam
        if (this.isSpamMessage(message.text)) return false;

        // For super strict mode in groups, only mentions
        if (this.filterMode === 'super_strict' && chatType === 'group') {
            const isFromMe = this.isFromMe(message);
            if (!isFromMe && !this.checkMention(message.text)) return false;
        }

        // Skip forwarded messages in groups
        if (chatType === 'group' && message.fwdFrom && !this.isFromMe(message)) return false;

        return true;
    }

    isFromMe(message) {
        return message.senderId?.toString() === this.me.id?.toString() ||
               message.fromId?.userId?.toString() === this.me.id?.toString();
    }

    checkMention(text) {
        if (!text) return false;
        const myUsername = this.me.username;
        const myName = `${this.me.firstName} ${this.me.lastName || ''}`.trim();
        return (myUsername && text.includes(`@${myUsername}`)) ||
               text.toLowerCase().includes(myName.toLowerCase());
    }

    isSpamMessage(text) {
        const spamKeywords = [
            '🚀', '💎', 'TO THE MOON', 'HODL', 'BUY NOW', 'PUMP', 'LAMBO',
            'SIGNAL', 'ENTRY', 'TARGET', 'STOP LOSS', '🎰', '💰', '🤑'
        ];
        const upperText = text.toUpperCase();
        const hasSpam = spamKeywords.some(keyword => upperText.includes(keyword));
        const emojiCount = (text.match(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu) || []).length;
        return hasSpam || emojiCount > 5;
    }
}

module.exports = MessageFilter;