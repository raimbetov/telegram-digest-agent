const ChatUtils = require('./chat-utils');

class MessageFilter {
    constructor(me) {
        this.me = me;
    }

    async buildFolderCache(client) {
        // No longer needed - kept for compatibility
        return;
    }

    shouldIncludeDialog(dialog) {
        const entity = dialog.entity;

        // Determine chat types using utility
        const chatTypeInfo = ChatUtils.getChatType(entity);
        const { isChannel, isGroup, isBot, isDM } = chatTypeInfo;

        // Debug logging
        if (process.env.DEBUG_FILTERING === 'true') {
            console.log(`🔍 ${entity.title || 'Unknown'}: isDM=${isDM}, isGroup=${isGroup}, isChannel=${isChannel}, isBot=${isBot}, members=${entity.participantsCount || 'N/A'}`);
        }

        // Always exclude channels
        if (isChannel) return false;

        // Always exclude bots
        if (isBot) return false;

        // Filter spam groups
        if (isGroup && this.isSpamChat(entity)) return false;

        // Include all DMs and clean groups
        return true;
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

    shouldIncludeMessage(message, chatType) {
        // Skip empty messages
        if (!message.text || message.text.trim() === '') return false;

        // Skip spam messages
        if (this.isSpamMessage(message.text)) return false;

        // Skip forwarded messages in groups (except from me)
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
