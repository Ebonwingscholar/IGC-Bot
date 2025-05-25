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
        GatewayIntentBits.DirectMessages
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

// Handle command interactions
client.on(Events.InteractionCreate, async interaction => {
    console.log(`Received interaction: ${interaction.type}`);
    if (interaction.isChatInputCommand()) {
        console.log(`Received slash command: ${interaction.commandName}`);
    } else {
        console.log('Not a chat input command');
        return;
    }

    // Check if the interaction is in an allowed channel
    if (interaction.channel && interaction.channel.type !== 'DM') {
        const allowedChannels = config.ALLOWED_CHANNEL_IDS;
        // If there are specified allowed channels and this isn't one of them
        if (allowedChannels.length > 0 && !allowedChannels.includes(interaction.channelId)) {
            console.log('Command not in an allowed channel');
            await interaction.reply({ 
                content: 'This command can only be used in designated channels or via DM.', 
                ephemeral: true 
            });
            return;
        }
    }

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        console.log(`Executing command: ${interaction.commandName}`);
        await command.execute(interaction);
    } catch (error) {
        console.error(`Error executing command ${interaction.commandName}:`, error);
        const errorMessage = 'There was an error while executing this command!';
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    }
});

// Handle direct messages
client.on(Events.MessageCreate, async message => {
    // Ignore messages from bots and non-DM channels
    if (message.author.bot || message.channel.type !== 'DM') return;

    // Process the message content
    const content = message.content.trim();
    const args = content.split(/\s+/);
    const command = args.shift().toLowerCase();

    if (command === '!reserve') {
        // Forward to reserve command
        const reserveCommand = client.commands.get('reserve');
        if (reserveCommand) {
            try {
                await reserveCommand.handleDM(message, args.join(' '));
            } catch (error) {
                console.error(error);
                await message.reply('There was an error processing your reservation. Please try again.');
            }
        }
    } else if (command === '!cancel') {
        // Forward to cancel command
        const cancelCommand = client.commands.get('cancel');
        if (cancelCommand) {
            try {
                await cancelCommand.handleDM(message);
            } catch (error) {
                console.error(error);
                await message.reply('There was an error canceling your reservation. Please try again.');
            }
        }
    } else if (command === '!view') {
        // Forward to view command
        const viewCommand = client.commands.get('view');
        if (viewCommand) {
            try {
                await viewCommand.handleDM(message);
            } catch (error) {
                console.error(error);
                await message.reply('There was an error viewing the reservations. Please try again.');
            }
        }
    } else if (command === '!reset') {
        // Forward to reset command
        const resetCommand = client.commands.get('reset');
        if (resetCommand) {
            try {
                await resetCommand.handleDM(message);
            } catch (error) {
                console.error(error);
                await message.reply('There was an error resetting the reservations. Please try again.');
            }
        }
    } else if (command === '!canceltable') {
        // Forward to canceltable command
        const canceltableCommand = client.commands.get('canceltable');
        if (canceltableCommand) {
            try {
                await canceltableCommand.handleDM(message, args);
            } catch (error) {
                console.error(error);
                await message.reply('There was an error canceling the reservation. Please try again.');
            }
        }
    } else if (command === '!help') {
        // Show help message
        const helpMessage = `
**Wargaming Table Reservation Bot Commands:**
- \`!reserve <player names> + <game name>\` - Reserve a table (Example: !reserve John, Bob + Warhammer 40k)
- \`!cancel\` - Cancel your reservation
- \`!view\` - View all current reservations
- \`!reset\` - Reset all reservations (Admin only)
- \`!canceltable <table number>\` - Cancel a reservation by table number (Admin only)
- \`!help\` - Show this help message
        `;
        await message.reply(helpMessage);
    } else {
        // Unknown command
        await message.reply(`I don't recognize that command. Type \`!help\` for a list of available commands.`);
    }
});

// Create a simple HTTP server for uptime monitoring
const http = require('http');
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot is online!');
});
server.listen(5000);

// Login to Discord
client.login(process.env.DISCORD_TOKEN);

// Deploy commands when running deploy-commands.js
module.exports = { client };
