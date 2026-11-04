require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Events } = require('discord.js');
const config = require('./config');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

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

client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Bot is in ${client.guilds.cache.size} servers`);
});

client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (!command || !command.autocomplete) return;

        try {
            await command.autocomplete(interaction);
        } catch (error) {
            console.error(`Error handling autocomplete for ${interaction.commandName}:`, error);
        }
        return;
    }

    if (interaction.isButton()) {
        if (interaction.customId === 'open_reserve_modal') {
            const reserveCmd = client.commands.get('reserve');
            if (reserveCmd && typeof reserveCmd.showModal === 'function') {
                return await reserveCmd.showModal(interaction);
            }
        }
        return;
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'reserve_table_modal') {
            const reserveCmd = client.commands.get('reserve');
            if (reserveCmd && typeof reserveCmd.handleModalSubmit === 'function') {
                return await reserveCmd.handleModalSubmit(interaction);
            }
        }
        return;
    }

    if (interaction.isChatInputCommand()) {
        if (interaction.channel && interaction.channel.type !== 'DM') {
            const allowedChannels = config.ALLOWED_CHANNEL_IDS;
            if (
                interaction.commandName !== 'whoplays' && 
                allowedChannels.length > 0 &&
                !allowedChannels.includes(interaction.channelId)
            ) {
                await interaction.reply({
                    content: 'This command can only be used in designated channels or via DM.',
                    ephemeral: true
                });
                return;
            }
        }

        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
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
        return;
    }
});

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
                if (['!reserve', '!adminreserve', '!canceltable', '!cancel'].includes(command)) {
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
        await message.reply(config.HELP_TEXT);
    } else {
        await message.reply(`I don't recognize that command. Type \`!help\` for available commands.`);
    }
});

const http = require('http');
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot is online!');
});
server.listen(5001);

client.login(process.env.DISCORD_TOKEN);
module.exports = { client };
