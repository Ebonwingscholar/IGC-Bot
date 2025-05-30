require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Get command files
const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Log environment variables (hiding sensitive parts)
console.log('CLIENT_ID available:', !!process.env.CLIENT_ID);
console.log('DISCORD_TOKEN available:', !!process.env.DISCORD_TOKEN);
console.log('Commands directory exists:', fs.existsSync(commandsPath));
console.log('Command files found:', commandFiles.length);

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command) {
        commands.push(command.data.toJSON());
        console.log(`Registered command: ${command.data.name}`);
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" property.`);
    }
}

// Create REST instance
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Deploy commands
(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        // The put method is used to fully refresh all commands with the current set
        const data = await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );

        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
        console.log('Commands registered:');
        commands.forEach(cmd => {
            console.log(`- ${cmd.name}`);
        });
    } catch (error) {
        console.error('Error registering commands:', error);
    }
})();