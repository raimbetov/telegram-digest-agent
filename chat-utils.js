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
        // Check for User entities (DMs) - more robust detection
        const isUser = entity.className === 'User';
        const isBot = entity.bot === true;

        // Channel detection
        const isChannel = entity.broadcast === true ||
                         (entity.className === 'Channel' && !entity.megagroup && !entity.gigagroup);

        // Group detection (including megagroups and gigagroups)
        const isGroup = entity.megagroup === true ||
                       entity.gigagroup === true ||
                       (entity.className === 'Channel' && (entity.megagroup || entity.gigagroup)) ||
                       (entity.participantsCount !== undefined && !isChannel && !isUser);

        // DM detection - must be a User, not a bot, not a channel, not a group
        const isDM = (isUser && !isBot) || (!isChannel && !isGroup && !isBot && !isUser);

        let typeString = 'dm';
        if (isChannel) typeString = 'channel';
        else if (isGroup) typeString = 'group';
        else if (isBot) typeString = 'bot';
        else if (isDM || isUser) typeString = 'dm';

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
