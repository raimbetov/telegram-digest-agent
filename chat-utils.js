/**
 * Utility functions for chat-related operations
 * Consolidates duplicate logic across the codebase
 */

class ChatUtils {
    /**
     * Determines the chat type and returns detailed information
     * @param {Object} entity - Telegram entity object
     * @returns {Object} Chat type information
     */
    static getChatType(entity) {
        const isChannel = entity.broadcast || entity.className === 'Channel';
        const isBot = entity.bot;
        const isGroup = entity.megagroup || entity.gigagroup ||
                       (entity.participantsCount !== undefined && !isChannel);
        const isDM = !isChannel && !isGroup && !isBot;

        let typeString = 'dm';
        if (isChannel) typeString = 'channel';
        else if (isGroup) typeString = 'group';
        else if (isBot) typeString = 'bot';

        return {
            type: typeString,
            isChannel,
            isGroup,
            isBot,
            isDM
        };
    }

    /**
     * Gets a user-friendly chat title from an entity
     * @param {Object} entity - Telegram entity object
     * @param {string} defaultName - Default name if no title found
     * @returns {string} Chat title
     */
    static getChatTitle(entity, defaultName = 'Unknown') {
        return entity.title ||
               `${entity.firstName || ''} ${entity.lastName || ''}`.trim() ||
               defaultName;
    }

    /**
     * Gets a display icon for a chat type
     * @param {string} type - Chat type (dm, group, channel, bot)
     * @param {boolean} included - Whether the chat is included in filtering
     * @returns {string} Icon string
     */
    static getChatIcon(type, included = true) {
        const statusIcon = included ? '✅' : '❌';
        const typeIcon = type === 'dm' ? '👤' :
                        type === 'bot' ? '🤖' :
                        type === 'channel' ? '📢' : '👥';
        return `${statusIcon} ${typeIcon}`;
    }
}

module.exports = ChatUtils;
