const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
require('dotenv').config();

class TelegramConnection {
    constructor() {
        this.client = null;
        this.me = null;
        this.isConnected = false;
    }

    async connect() {
        const session = new StringSession(process.env.TELEGRAM_SESSION || '');
        
        this.client = new TelegramClient(session, 
            parseInt(process.env.TELEGRAM_API_ID), 
            process.env.TELEGRAM_API_HASH, {
                connectionRetries: 5,
                retryDelay: 1000,
                autoReconnect: true,
                floodSleepThreshold: 60
            }
        );

        console.log('🔥 Connecting to Telegram...');

        await this.client.start({
            phoneNumber: async () => process.env.PHONE_NUMBER,
            password: async () => this.promptInput('Enter 2FA password (if enabled): '),
            phoneCode: async () => this.promptInput('Enter verification code: '),
            onError: (err) => console.error('Auth error:', err),
        });

        await new Promise(resolve => setTimeout(resolve, 3000));
        
        this.me = await this.client.getMe();
        this.isConnected = true;

        console.log(`✅ Connected as: ${this.me.firstName} ${this.me.lastName || ''} (@${this.me.username || 'no_username'})`);

        if (!process.env.TELEGRAM_SESSION) {
            console.log('\n🔑 Add this to your .env file:');
            console.log('TELEGRAM_SESSION=' + this.client.session.save());
        }

        return { client: this.client, me: this.me };
    }

    async promptInput(question) {
        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });
        return new Promise(resolve => {
            readline.question(question, (answer) => {
                readline.close();
                resolve(answer);
            });
        });
    }

    async disconnect() {
        if (this.client && this.isConnected) {
            await this.client.disconnect();
            console.log('🔌 Disconnected from Telegram');
        }
    }

    async retryApiCall(apiCall, maxRetries = 3, delay = 1000) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await apiCall();
            } catch (error) {
                if (attempt === maxRetries) throw error;
                console.log(`⏳ API call failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 1.5;
            }
        }
    }
}

module.exports = TelegramConnection;