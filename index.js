require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Events } = require('discord.js');
const config = require('./config');

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

// Initialize bot with necessary intents
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ] 
});

client.commands = new Collection();

// Load command files
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

// Ready event
client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Bot is in ${client.guilds.cache.size} servers`);
    client.guilds.cache.forEach(guild => {
        console.log(`- ${guild.name} (${guild.id})`);
    });
});

// Central Interaction Router
client.on(Events.InteractionCreate, async interaction => {
    try {
        // Channel permission check (skipped for DMs)
        if (interaction.channel && interaction.channel.type !== 'DM') {
            const allowedChannels = config.ALLOWED_CHANNEL_IDS;
            if (allowedChannels.length > 0 && !allowedChannels.includes(interaction.channelId)) {
                console.log('Interaction not in an allowed channel');
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ 
                        content: 'This command can only be used in designated channels or via DM.', 
                        ephemeral: true 
                    });
                }
                return;
            }
        }

        // 1. Handle Slash Commands
        if (interaction.isChatInputCommand()) {
            console.log(`Received slash command: ${interaction.commandName}`);
            const command = client.commands.get(interaction.commandName);
            if (!command) {
                console.error(`No command matching ${interaction.commandName} was found.`);
                return;
            }
            await command.execute(interaction);
        }

        // 2. Handle String Select Menus (Dropdowns)
        else if (interaction.isStringSelectMenu()) {
            if (interaction.customId.startsWith('book_')) {
                const bookCmd = client.commands.get('book');
                if (bookCmd && typeof bookCmd.handleSelectMenu === 'function') {
                    await bookCmd.handleSelectMenu(interaction);
                }
            } else if (interaction.customId.startsWith('cancel_')) {
                const cancelCmd = client.commands.get('cancel');
                if (cancelCmd && typeof cancelCmd.handleSelectMenu === 'function') {
                    await cancelCmd.handleSelectMenu(interaction);
                }
            } else if (interaction.customId.startsWith('view_')) {
                const viewCmd = client.commands.get('view');
                if (viewCmd && typeof viewCmd.handleSelectMenu === 'function') {
                    await viewCmd.handleSelectMenu(interaction);
                }
            } else if (interaction.customId.startsWith('adminmanage_')) {
                const adminManageCmd = client.commands.get('adminmanage');
                if (adminManageCmd && typeof adminManageCmd.handleSelectMenu === 'function') {
                    await adminManageCmd.handleSelectMenu(interaction);
                }
            } else if (interaction.customId.startsWith('adminmanageevents_')) {
                const adminManageEventsCmd = client.commands.get('adminmanageevents');
                if (adminManageEventsCmd && typeof adminManageEventsCmd.handleSelectMenu === 'function') {
                    await adminManageEventsCmd.handleSelectMenu(interaction);
                }
            } else if (interaction.customId.startsWith('playerfinder_')) {
                const playerFinderCmd = client.commands.get('playerfinder');
                if (playerFinderCmd && typeof playerFinderCmd.handleSelectMenu === 'function') {
                    await playerFinderCmd.handleSelectMenu(interaction);
                }
            } else if (interaction.customId.startsWith('whoplays_')) {
                const whoPlaysCmd = client.commands.get('whoplays');
                if (whoPlaysCmd && typeof whoPlaysCmd.handleSelectMenu === 'function') {
                    await whoPlaysCmd.handleSelectMenu(interaction);
                }
            }
        }

        // 3. Handle User Select Menus (Tagging Club Members)
        else if (interaction.isUserSelectMenu()) {
            if (interaction.customId.startsWith('book_')) {
                const bookCmd = client.commands.get('book');
                if (bookCmd && typeof bookCmd.handleUserSelect === 'function') {
                    await bookCmd.handleUserSelect(interaction);
                }
            } else if (interaction.customId.startsWith('adminmanage_')) {
                const adminManageCmd = client.commands.get('adminmanage');
                if (adminManageCmd && typeof adminManageCmd.handleUserSelect === 'function') {
                    await adminManageCmd.handleUserSelect(interaction);
                }
            }
        }

        // 4. Handle Modal Submissions
        else if (interaction.isModalSubmit()) {
            if (interaction.customId.startsWith('book_')) {
                const bookCmd = client.commands.get('book');
                if (bookCmd && typeof bookCmd.handleModalSubmit === 'function') {
                    await bookCmd.handleModalSubmit(interaction);
                }
            } else if (interaction.customId.startsWith('adminmanage_')) {
                const adminManageCmd = client.commands.get('adminmanage');
                if (adminManageCmd && typeof adminManageCmd.handleModalSubmit === 'function') {
                    await adminManageCmd.handleModalSubmit(interaction);
                }
            } else if (interaction.customId.startsWith('adminmanageevents_')) {
                const adminManageEventsCmd = client.commands.get('adminmanageevents');
                if (adminManageEventsCmd && typeof adminManageEventsCmd.handleModalSubmit === 'function') {
                    await adminManageEventsCmd.handleModalSubmit(interaction);
                }
            } else if (interaction.customId.startsWith('playerfinder_')) {
                const playerFinderCmd = client.commands.get('playerfinder');
                if (playerFinderCmd && typeof playerFinderCmd.handleModalSubmit === 'function') {
                    await playerFinderCmd.handleModalSubmit(interaction);
                }
            }
        }

        // 5. Handle Buttons
        else if (interaction.isButton()) {
            if (interaction.customId.startsWith('playerfinder_')) {
                const playerFinderCmd = client.commands.get('playerfinder');
                if (playerFinderCmd && typeof playerFinderCmd.handleButton === 'function') {
                    await playerFinderCmd.handleButton(interaction);
                }
            }
        }
    } catch (error) {
        console.error('Error handling interaction:', error);
        const errorMessage = 'There was an error while executing this command!';
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorMessage, ephemeral: true });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        } catch (followUpError) {
            console.error('Failed to send error reply:', followUpError);
        }
    }
});

// Handle direct messages
client.on(Events.MessageCreate, async message => {
    if (message.author.bot || message.channel.type !== 'DM') return;

    const content = message.content.trim();
    const args = content.split(/\s+/);
    const command = args.shift().toLowerCase();

    const commandMap = {
        '!reserve': 'reserve',
        '!cancel': 'cancel',
        '!view': 'view',
        '!reset': 'reset',
        '!canceltable': 'canceltable',
        '!adminreserve': 'adminreserve'
    };

    if (commandMap[command]) {
        const cmd = client.commands.get(commandMap[command]);
        if (cmd) {
            try {
                if (command === '!reserve' || command === '!adminreserve' || command === '!canceltable') {
                    await cmd.handleDM(message, args.join(' '));
                } else {
                    await cmd.handleDM(message);
                }
            } catch (error) {
                console.error(error);
                await message.reply(`There was an error processing your request. Please try again.`);
            }
        }
    } else if (command === '!help') {
        const helpMessage = `
**Wargaming Table Reservation Bot Commands:**
- \`/book\` - Book or join a table interactive wizard (Thursdays & Events)
- \`/cancel\` - Cancel table or remove self from roster interactive wizard
- \`/view\` - View table reservations schedule for Thursdays or Special Events
- \`/playerfinder\` - Browse game rosters, share armies/notes, or join/leave a game
- \`!help\` - Show this help message
        `;
        await message.reply(helpMessage);
    } else {
        await message.reply(`I don't recognize that command. Type \`!help\` for a list of available commands.`);
    }
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);

// Export client for other modules
module.exports = { client };
