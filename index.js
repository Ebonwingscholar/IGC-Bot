const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.commands = new Collection();

// Load command files dynamically
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if (command && command.data && command.data.name) {
            client.commands.set(command.data.name, command);
        }
    }
}

client.once('clientReady', () => {
    console.log(`🤖 Logged in as ${client.user.tag}`);
    console.log(`Loaded commands: ${Array.from(client.commands.keys()).join(', ')}`);
});

// Central interaction router
client.on('interactionCreate', async interaction => {
    try {
        // 1. Handle Slash Commands
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (command && typeof command.execute === 'function') {
                await command.execute(interaction);
            }
        }
        
        // 2. Handle String Select Menu (Thursday Date Dropdown)
        else if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'select_reserve_date') {
                const reserveCommand = client.commands.get('reserve');
                if (reserveCommand && typeof reserveCommand.handleSelectMenu === 'function') {
                    await reserveCommand.handleSelectMenu(interaction);
                }
            }
        }

        // 3. Handle User Select Menu (Tagging Club Members)
        else if (interaction.isUserSelectMenu()) {
            if (interaction.customId === 'select_reserve_players') {
                const reserveCommand = client.commands.get('reserve');
                if (reserveCommand && typeof reserveCommand.handleUserSelect === 'function') {
                    await reserveCommand.handleUserSelect(interaction);
                }
            }
        }

        // 4. Handle Modal Submissions
        else if (interaction.isModalSubmit()) {
            if (interaction.customId === 'reserve_final_modal') {
                const reserveCommand = client.commands.get('reserve');
                if (reserveCommand && typeof reserveCommand.handleModalSubmit === 'function') {
                    await reserveCommand.handleModalSubmit(interaction);
                }
            }
        }
    } catch (error) {
        console.error('Error handling interaction:', error);
        const errorMessage = { content: '❌ An error occurred while processing this action.', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage).catch(() => {});
        } else {
            await interaction.reply(errorMessage).catch(() => {});
        }
    }
});

// Handle direct message fallback (!reserve)
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    if (message.content.startsWith('!reserve')) {
        const reserveCommand = client.commands.get('reserve');
        if (reserveCommand && typeof reserveCommand.handleDM === 'function') {
            const detailsText = message.content.slice(8).trim();
            await reserveCommand.handleDM(message, detailsText);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);

module.exports = { client };
