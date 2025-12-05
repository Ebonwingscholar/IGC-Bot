require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Events, EmbedBuilder } = require('discord.js');

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

// Handle slash commands & autocomplete
client.on(Events.InteractionCreate, async interaction => {
    // 🔹 Handle autocomplete
    if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (!command || !command.autocomplete) return;

        try {
            await command.autocomplete(interaction);
        } catch (error) {
            console.error(`Error handling autocomplete for ${interaction.commandName}:`, error);
        }
        return; // Prevent running execute() for autocomplete
    }

    // 🔹 Handle slash commands
    if (interaction.isChatInputCommand()) {
        console.log(`Received slash command: ${interaction.commandName}`);

        // Optional channel restriction
        if (interaction.channel && interaction.channel.type !== 'DM') {
            const allowedChannels = config.ALLOWED_CHANNEL_IDS;
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

// Handle New Member Joins
client.on(Events.GuildMemberAdd, async member => {
    // 1. REPLACE THIS ID with your specific welcome channel ID (e.g., #general or #introductions)
    // You can right-click the channel in Discord > Copy Channel ID
    const welcomeChannelId = '1359448418061123587'; 

    const channel = member.guild.channels.cache.get(welcomeChannelId);

    if (!channel) {
        console.log(`Could not find welcome channel ${welcomeChannelId}`);
        return;
    }

    try {
        // Create the Welcome Card
        const welcomeEmbed = new EmbedBuilder()
        .setTitle('Reinforcements Inbound! 🎲')
        .setDescription(
            `Welcome ${member} to **${member.guild.name}**!\n\n` +
            `We've added you to our Looking For Game groups based on your choices.\n\n` +
            `**Here’s how to get started:**\n` +
            `1. **Introduce yourself** in this channel.\n` +
            `2. **Show off your projects** in <#1359454477127778425>.\n` +
            `3. **Book a table** in <#1359456764638269601> or use the \`/reserve\` command!`
        )
        .setColor(0x00FF00)
        .setThumbnail(member.user.displayAvatarURL())
        .setFooter({ text: 'Inverurie Gaming Club' });

        await channel.send({ embeds: [welcomeEmbed] });
        console.log(`Sent welcome message for ${member.user.tag}`);

    } catch (error) {
        console.error('Error sending welcome message:', error);
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