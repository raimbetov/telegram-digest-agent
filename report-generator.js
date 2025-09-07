const axios = require('axios');
const fs = require('fs').promises;

class ReportGenerator {
    constructor() {
        this.apiKey = process.env.DEEPSEEK_API_KEY;
        this.apiUrl = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';
    }

    async generateReport(messages) {
        console.log(`📊 Generating AI digest for ${messages.length} messages...`);

        if (messages.length === 0) {
            const emptyReport = this.createEmptyReport();
            await this.saveReport(emptyReport, 0);
            return emptyReport;
        }

        const analysis = this.analyzeMessages(messages);
        const aiDigest = await this.callDeepSeekAPI(analysis);
        
        await this.saveReport(aiDigest, messages.length);
        return aiDigest;
    }

    analyzeMessages(messages) {
        const analysis = {
            directMessages: messages.filter(msg => msg.chatType === 'dm' && !msg.isFromMe),
            groupMessages: messages.filter(msg => msg.chatType === 'group'),
            channelMessages: messages.filter(msg => msg.chatType === 'channel'),
            mentions: messages.filter(msg => msg.isMention),
            myMessages: messages.filter(msg => msg.isFromMe)
        };

        // Additional analytics
        analysis.stats = {
            totalChats: new Set(messages.map(msg => msg.chatId)).size,
            activeSenders: new Set(messages.filter(msg => !msg.isFromMe).map(msg => msg.senderId)).size,
            oldestMessage: messages.length > 0 ? new Date(Math.min(...messages.map(msg => new Date(msg.timestamp)))) : null,
            newestMessage: messages.length > 0 ? new Date(Math.max(...messages.map(msg => new Date(msg.timestamp)))) : null
        };

        // Top active chats
        const chatActivity = {};
        messages.forEach(msg => {
            chatActivity[msg.chatTitle] = (chatActivity[msg.chatTitle] || 0) + 1;
        });
        analysis.topChats = Object.entries(chatActivity)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10);

        return analysis;
    }

    async callDeepSeekAPI(analysis) {
        if (!this.apiKey) {
            return 'Error: DEEPSEEK_API_KEY not configured. Please add it to your .env file.';
        }

        const prompt = this.buildPrompt(analysis);
        
        try {
            const response = await axios.post(this.apiUrl, {
                model: "deepseek-chat",
                messages: [
                    { 
                        role: "system", 
                        content: "You are an executive assistant creating weekly communication reports. Focus on actionable insights and clear priorities. Be concise and professional."
                    },
                    { role: "user", content: prompt }
                ],
                max_tokens: 2000,
                temperature: 0.3
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });

            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('❌ DeepSeek API Error:', error.response?.data || error.message);
            return this.createFallbackReport(analysis);
        }
    }

    buildPrompt(analysis) {
        const { directMessages, groupMessages, channelMessages, mentions, myMessages, stats, topChats } = analysis;
        
        return `
Analyze this week's Telegram activity and create a professional weekly digest:

DIRECT MESSAGES RECEIVED (${directMessages.length} messages):
${directMessages.slice(0, 15).map(msg => 
    `- ${msg.senderName}: "${msg.text.substring(0, 100)}..." (${new Date(msg.timestamp).toLocaleDateString()})`
).join('\n')}

GROUP ACTIVITY (${groupMessages.length} messages):
${groupMessages.slice(0, 20).map(msg =>
    `- [${msg.chatTitle}] ${msg.senderName}: "${msg.text.substring(0, 100)}..." (${new Date(msg.timestamp).toLocaleDateString()})`
).join('\n')}

CHANNEL UPDATES (${channelMessages.length} messages):
${channelMessages.slice(0, 15).map(msg =>
    `- [${msg.chatTitle}]: "${msg.text.substring(0, 100)}..." (${new Date(msg.timestamp).toLocaleDateString()})`
).join('\n')}

MENTIONS & TAGS (${mentions.length} mentions):
${mentions.map(msg =>
    `- [${msg.chatTitle}] ${msg.senderName}: "${msg.text.substring(0, 150)}..." (${new Date(msg.timestamp).toLocaleDateString()})`
).join('\n')}

MY ACTIVITY (${myMessages.length} messages sent):
${myMessages.slice(0, 10).map(msg =>
    `- [${msg.chatTitle}]: "${msg.text.substring(0, 100)}..." (${new Date(msg.timestamp).toLocaleDateString()})`
).join('\n')}

ACTIVITY STATISTICS:
- Total Active Chats: ${stats.totalChats}
- Unique Senders: ${stats.activeSenders}
- Date Range: ${stats.oldestMessage?.toLocaleDateString()} to ${stats.newestMessage?.toLocaleDateString()}

TOP ACTIVE CHATS:
${topChats.map(([chat, count]) => `- ${chat}: ${count} messages`).join('\n')}

Create a structured weekly report with:
1. **EXECUTIVE SUMMARY**: Key highlights and patterns from this week
2. **ACTION ITEMS**: Messages requiring responses or follow-up
3. **IMPORTANT CONVERSATIONS**: High-priority discussions to review
4. **TRENDING TOPICS**: Common themes across chats
5. **COMMUNICATION STATS**: Activity breakdown and engagement patterns
6. **PRIORITY CONTACTS**: People who need attention or follow-up

Be concise, actionable, and professional. Focus on what requires attention or action.
        `;
    }

    createFallbackReport(analysis) {
        const { directMessages, groupMessages, channelMessages, mentions, myMessages, stats } = analysis;
        
        return `# Weekly Telegram Activity Report

## Executive Summary
- **Total Messages Analyzed**: ${directMessages.length + groupMessages.length + channelMessages.length + myMessages.length}
- **Direct Messages Received**: ${directMessages.length}
- **Group Messages**: ${groupMessages.length}
- **Channel Updates**: ${channelMessages.length}
- **Mentions**: ${mentions.length}
- **My Messages Sent**: ${myMessages.length}

## Activity Breakdown
- **Active Chats**: ${stats.totalChats}
- **Unique Contacts**: ${stats.activeSenders}

## Action Items
${directMessages.length > 0 ? '- Review and respond to direct messages' : '- No direct messages to respond to'}
${mentions.length > 0 ? '- Follow up on mentions and tags' : '- No mentions requiring attention'}

## Key Statistics
- **Most Active Period**: ${stats.oldestMessage?.toLocaleDateString()} - ${stats.newestMessage?.toLocaleDateString()}
- **Average Daily Messages**: ${Math.round((directMessages.length + groupMessages.length + channelMessages.length) / 7)}

*Note: This is a basic report generated due to AI service unavailability. For detailed insights, please check your DeepSeek API configuration.*`;
    }

    createEmptyReport() {
        return `# Weekly Telegram Activity Report

## Executive Summary
No messages found for the specified time period and filter settings.

## Recommendations
- Check your filter settings (current: ${process.env.FILTER_MODE || 'smart'})
- Verify the date range is correct
- Consider expanding filter criteria if too restrictive
- Check if messages exist in archived chats

## Filter Configuration
- **Mode**: ${process.env.FILTER_MODE || 'smart'}
- **Block Channels**: ${process.env.BLOCK_ALL_CHANNELS || 'false'}
- **Allowed Chats**: ${process.env.ALLOWED_CHAT_IDS || 'none specified'}

*Run with 'node main.js list-chats' to see which chats are included/excluded.*`;
    }

    async saveReport(digest, totalMessages) {
        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `weekly-digest-${timestamp}.md`;
        
        const content = `# Weekly Telegram Digest - ${timestamp}

${digest}

---
**Report Details:**
- **Generated**: ${new Date().toLocaleString()}  
- **Messages Analyzed**: ${totalMessages}  
- **Filter Mode**: ${process.env.FILTER_MODE || 'smart'}
- **Generated by**: Telegram Weekly Fetcher v2.0
        `;

        await fs.writeFile(filename, content);
        console.log(`📋 Report saved: ${filename}`);
        
        // Also create a JSON version for further processing
        const jsonData = {
            timestamp: new Date().toISOString(),
            totalMessages,
            filterMode: process.env.FILTER_MODE || 'smart',
            digest: digest
        };
        
        const jsonFilename = `weekly-digest-${timestamp}.json`;
        await fs.writeFile(jsonFilename, JSON.stringify(jsonData, null, 2));
        console.log(`📋 JSON data saved: ${jsonFilename}`);
    }

    async listRecentReports() {
        try {
            const files = await fs.readdir('./');
            const reportFiles = files.filter(f => f.startsWith('weekly-digest-') && f.endsWith('.md'))
                                   .sort()
                                   .reverse()
                                   .slice(0, 10);
            
            console.log('📊 Recent Reports:');
            for (const file of reportFiles) {
                const stats = await fs.stat(file);
                console.log(`  📄 ${file} - ${stats.mtime.toLocaleDateString()}`);
            }
        } catch (error) {
            console.log('No previous reports found.');
        }
    }
}

module.exports = ReportGenerator;