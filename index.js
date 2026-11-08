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
            if (interaction.customId === 'select_reserve_date') {
                const reserveCmd = client.commands.get('reserve');
                if (reserveCmd && typeof reserveCmd.handleSelectMenu === 'function') {
                    await reserveCmd.handleSelectMenu(interaction);
                }
            } else if (interaction.customId.startsWith('event_')) {
                const bookEventCmd = client.commands.get('bookevent');
                if (bookEventCmd && typeof bookEventCmd.handleSelectMenu === 'function') {
                    await bookEventCmd.handleSelectMenu(interaction);
                }
            } else if (interaction.customId.startsWith('cancelevent_')) {
                const cancelCmd = client.commands.get('canceleventbooking');
                if (cancelCmd && typeof cancelCmd.handleSelectMenu === 'function') {
                    await cancelCmd.handleSelectMenu(interaction);
                }
            } else if (interaction.customId.startsWith('view_')) {
                const viewCmd = client.commands.get('viewevents');
                if (viewCmd && typeof viewCmd.handleSelectMenu === 'function') {
                    await viewCmd.handleSelectMenu(interaction);
                }
            } else if (interaction.customId.startsWith('adminres_')) {
                const adminResCmd = client.commands.get('adminreserve');
                if (adminResCmd && typeof adminResCmd.handleSelectMenu === 'function') {
                    await adminResCmd.handleSelectMenu(interaction);
                }
            } else if (interaction.customId.startsWith('admincancel_')) {
                const adminCancelCmd = client.commands.get('canceltable');
                if (adminCancelCmd && typeof adminCancelCmd.handleSelectMenu === 'function') {
                    await adminCancelCmd.handleSelectMenu(interaction);
                }
            }
        }

        // 3. Handle User Select Menus (Tagging Club Members)
        else if (interaction.isUserSelectMenu()) {
            if (interaction.customId === 'select_reserve_players') {
                const reserveCmd = client.commands.get('reserve');
                if (reserveCmd && typeof reserveCmd.handleUserSelect === 'function') {
                    await reserveCmd.handleUserSelect(interaction);
                }
            } else if (interaction.customId === 'event_select_players') {
                const bookEventCmd = client.commands.get('bookevent');
                if (bookEventCmd && typeof bookEventCmd.handleUserSelect === 'function') {
                    await bookEventCmd.handleUserSelect(interaction);
                }
            }
        }

        // 4. Handle Modal Submissions
        else if (interaction.isModalSubmit()) {
            if (interaction.customId === 'reserve_final_modal') {
                const reserveCmd = client.commands.get('reserve');
                if (reserveCmd && typeof reserveCmd.handleModalSubmit === 'function') {
                    await reserveCmd.handleModalSubmit(interaction);
                }
            } else if (interaction.customId === 'event_start_modal') {
                const bookEventCmd = client.commands.get('bookevent');
                if (bookEventCmd && typeof bookEventCmd.handleModalSubmit === 'function') {
                    await bookEventCmd.handleModalSubmit(interaction);
                }
            } else if (interaction.customId === 'adminres_modal') {
                const adminResCmd = client.commands.get('adminreserve');
                if (adminResCmd && typeof adminResCmd.handleModalSubmit === 'function') {
                    await adminResCmd.handleModalSubmit(interaction);
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
- \`!reserve <player names> + <game name>\` - Reserve a table (Example: !reserve John, Bob + Warhammer 40k)
- \`!cancel\` - Cancel your reservation
- \`!view\` - View all current reservations
- \`!reset\` - Reset all reservations (Admin only)
- \`!canceltable <table number>\` - Cancel a reservation by table number (Admin only)
- \`!adminreserve <table number> <player names> + <game name>\` - Reserve a specific table (Admin only)
- \`!help\` - Show this help message

**Note:** Slash commands also support @mentioning players instead of typing names manually.
        `;
        await message.reply(helpMessage);
    } else {
        await message.reply(`I don't recognize that command. Type \`!help\` for a list of available commands.`);
    }
});

// Create a simple HTTP server for uptime monitoring
const http = require('http');
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot is online!');
});
server.listen(5001);

// Login to Discord
client.login(process.env.DISCORD_TOKEN);

// Export client for other modules (e.g., send DMs)
module.exports = { client };
