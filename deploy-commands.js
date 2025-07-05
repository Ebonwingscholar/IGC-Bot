require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

console.log('CLIENT_ID available:', !!process.env.CLIENT_ID);
console.log('DISCORD_TOKEN available:', !!process.env.DISCORD_TOKEN);
console.log('GUILD_ID available:', !!process.env.GUILD_ID);

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command) {
        commands.push(command.data.toJSON());
        console.log(`Registered command: ${command.data.name}`);
    } else {
        console.log(`[WARNING] Missing "data" property in ${filePath}`);
    }
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log(`Refreshing ${commands.length} guild-specific (/) commands...`);
        const data = await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );
        console.log(`Successfully reloaded ${data.length} commands for guild ${process.env.GUILD_ID}`);
    } catch (error) {
        console.error('Error registering commands:', error);
    }
})();