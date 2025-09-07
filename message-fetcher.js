class MessageFetcher {
    constructor(client, filter, connection) {
        this.client = client;
        this.filter = filter;
        this.connection = connection; // For retry functionality
    }

    async fetchWeeklyMessages() {
        console.log('📅 Fetching messages from the last 7 days...');
        
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        
        // Build folder cache if needed
        await this.filter.buildFolderCache(this.client);
        
        const dialogs = await this.connection.retryApiCall(() => 
            this.client.getDialogs({ limit: 200, archived: false })
        );
        
        console.log(`📋 Found ${dialogs.length} total dialogs`);
        console.log(`🔍 Filter mode: ${this.filter.filterMode}`);
        
        const allMessages = [];
        let includedDialogs = 0;

        for (const dialog of dialogs) {
            if (!this.filter.shouldIncludeDialog(dialog)) continue;
            
            includedDialogs++;
            const entity = dialog.entity;
            const chatTitle = entity.title || `${entity.firstName || ''} ${entity.lastName || ''}`.trim() || 'Unknown';
            
            try {
                const messages = await this.fetchDialogMessages(entity, weekAgo, chatTitle);
                allMessages.push(...messages);
            } catch (error) {
                console.warn(`⚠️ Failed to fetch from ${chatTitle}: ${error.message}`);
            }

            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, 150));
        }

        console.log(`✅ Fetched ${allMessages.length} messages from ${includedDialogs}/${dialogs.length} dialogs`);
        return allMessages;
    }

    async fetchDialogMessages(entity, weekAgo, chatTitle) {
        const messages = await this.connection.retryApiCall(() =>
            this.client.getMessages(entity, {
                offsetDate: Math.floor(Date.now() / 1000),
                limit: 200,
                reverse: false
            })
        );

        console.log(`📥 ${chatTitle}: Retrieved ${messages.length} messages`);

        const chatType = this.getChatType(entity);
        const processedMessages = [];
        let weeklyCount = 0;
        let includedCount = 0;

        for (const message of messages) {
            // Check date range
            const messageDate = new Date(message.date * 1000);
            if (messageDate < weekAgo) {
                // Since messages are sorted by date (newest first), we can break here
                break;
            }
            weeklyCount++;

            // Apply message-level filtering
            if (!this.filter.shouldIncludeMessage(message, chatType)) continue;
            includedCount++;

            // Create message object
            const messageData = {
                timestamp: messageDate.toISOString(),
                messageId: message.id,
                chatId: entity.id.toString(),
                chatTitle: chatTitle,
                chatType: chatType,
                senderName: this.getSenderName(message),
                senderId: this.getSenderId(message),
                text: message.text,
                date: message.date,
                isFromMe: this.filter.isFromMe(message),
                isMention: this.filter.checkMention(message.text),
                filterMode: this.filter.filterMode,
                participantCount: entity.participantsCount || null
            };

            processedMessages.push(messageData);
        }

        if (process.env.DEBUG_FETCHING === 'true') {
            console.log(`  ✅ ${chatTitle}: ${weeklyCount} in range, ${includedCount} included`);
        }
        
        return processedMessages;
    }

    getSenderName(message) {
        if (this.filter.isFromMe(message)) {
            return 'ME';
        }
        
        const senderId = this.getSenderId(message);
        return `User_${senderId}`;
    }

    getSenderId(message) {
        return (message.senderId || message.fromId?.userId || 'unknown').toString();
    }

    getChatType(entity) {
        const isChannel = entity.broadcast || entity.className === 'Channel';
        const isGroup = entity.megagroup || entity.gigagroup || 
                       (entity.participantsCount !== undefined && !isChannel);
        return isChannel ? 'channel' : isGroup ? 'group' : 'dm';
    }

    async fetchArchivedMessages() {
        console.log('📁 Also checking archived dialogs...');
        
        try {
            const archivedDialogs = await this.connection.retryApiCall(() =>
                this.client.getDialogs({ limit: 50, archived: true })
            );
            
            console.log(`📋 Found ${archivedDialogs.length} archived dialogs`);
            
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            
            const allMessages = [];
            let includedDialogs = 0;

            for (const dialog of archivedDialogs) {
                if (!this.filter.shouldIncludeDialog(dialog)) continue;
                
                includedDialogs++;
                const entity = dialog.entity;
                const chatTitle = entity.title || `${entity.firstName || ''} ${entity.lastName || ''}`.trim() || 'Archived Chat';
                
                try {
                    const messages = await this.fetchDialogMessages(entity, weekAgo, `[ARCHIVED] ${chatTitle}`);
                    allMessages.push(...messages);
                } catch (error) {
                    console.warn(`⚠️ Failed to fetch from archived ${chatTitle}: ${error.message}`);
                }

                await new Promise(resolve => setTimeout(resolve, 200));
            }

            console.log(`✅ Fetched ${allMessages.length} messages from ${includedDialogs} archived dialogs`);
            return allMessages;
            
        } catch (error) {
            console.warn('⚠️ Could not fetch archived dialogs:', error.message);
            return [];
        }
    }
}

module.exports = MessageFetcher;