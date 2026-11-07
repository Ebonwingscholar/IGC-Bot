// clean-deploy.js
const { REST, Routes } = require('discord.js');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('🧹 Clearing old global slash commands...');
        // 1. Wipe all global slash commands (removes lingering duplicates)
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: [] }
        );
        console.log('✅ Global commands cleared successfully.');

        // 2. Read commands from the commands directory
        const commands = [];
        const commandsPath = path.join(__dirname, 'commands');
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            const command = require(path.join(commandsPath, file));
            if (command.data) {
                commands.push(command.data.toJSON());
            }
        }

        console.log(`🚀 Deploying ${commands.length} commands to your server (Guild)...`);
        // 3. Register fresh commands strictly to your server
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );
        console.log('✅ Guild commands deployed!');
    } catch (error) {
        console.error('❌ Error executing clean deploy:', error);
    }
})();
