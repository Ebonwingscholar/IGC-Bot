require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

console.log('--- Loading Command Files ---');

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    console.log(`Loading: ${file}`);
    
    try {
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
        } else {
            console.warn(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    } catch (error) {
        console.error(`\n❌ CRASH DETECTED IN FILE: ${file}\n`);
        throw error;
    }
}

console.log('-----------------------------\n');

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log(`Refreshing ${commands.length} guild-specific commands...`);
        const data = await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );
        console.log(`Successfully reloaded ${data.length} commands.`);
        process.exit(0);
    } catch (error) {
        console.error('Error registering commands:', error);
        process.exit(1);
    }
})();
