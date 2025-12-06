const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('who')
        .setDescription('Show who is interested in a specific game'),

    async execute(interaction) {
        // Define the game roles
        const gameRoles = [
            { label: 'Warhammer 40k', value: 'Warhammer 40k' },
            { label: 'Age of Sigmar', value: 'Age of Sigmar' },
            { label: 'KillTeam', value: 'Killteam' },
            { label: 'AllOtherGames', value: 'All other games' }
        ];

        // Create the selection menu
        const menu = new StringSelectMenuBuilder()
            .setCustomId('who-game-select')
            .setPlaceholder('Select a game roster to view')
            .addOptions(gameRoles);

        const row = new ActionRowBuilder().addComponents(menu);

        await interaction.reply({
            content: 'Choose a game to view its player roster:',
            components: [row],
            ephemeral: true
        });
    },

    // Handle the dropdown selection
    async select(interaction) {
        if (interaction.customId !== 'who-game-select') return;

        const chosenRoleName = interaction.values[0];
        const guild = interaction.guild;

        // Find the matching role by name
        const role = guild.roles.cache.find(r => r.name === chosenRoleName);

        if (!role) {
            return interaction.reply({
                content: `The role **${chosenRoleName}** was not found on this server.`,
                ephemeral: true
            });
        }

        // Get all members who have the role
        const members = role.members.map(m => m.toString());

        // Build the roster embed
        const embed = new EmbedBuilder()
            .setTitle(`${chosenRoleName} – Player Roster`)
            .setColor(0x5865F2) // Discord Blurple
            .setDescription(
                members.length > 0
                    ? members.join('\n')
                    : '*No players currently have this role.*'
            )
            .setFooter({ text: `Total players: ${members.length}` });

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
    }
};