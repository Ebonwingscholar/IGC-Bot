const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');

// Replace these with your actual role IDs from Discord
const GAME_ROLE_IDS = {
    'Warhammer 40k': '1446511133228929056',
    'Age of Sigmar': '1446510570403532890',
    'KillTeam': '1403387824841162752',
    'AllOtherGames': '1446548080630698056'
};

const GAME_ROLES_MENU = [
    { label: 'Warhammer 40k', value: 'Warhammer 40k' },
    { label: 'Age of Sigmar', value: 'Age of Sigmar' },
    { label: 'Killteam', value: 'KillTeam' },
    { label: 'All Other Games', value: 'AllOtherGames' }
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('who')
        .setDescription('Show who is interested in a specific game'),

    async execute(interaction) {
        // Create the selection menu
        const menu = new StringSelectMenuBuilder()
            .setCustomId('who-game-select')
            .setPlaceholder('Select a game roster to view')
            .addOptions(GAME_ROLES_MENU);

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

        const chosenKey = interaction.values[0];
        const guild = interaction.guild;

        // Fetch all members to ensure offline members are included
        await guild.members.fetch();

        const roleId = GAME_ROLE_IDS[chosenKey];
        const role = guild.roles.cache.get(roleId);

        if (!role) {
            return interaction.reply({
                content: `The role **${chosenKey}** was not found on this server.`,
                ephemeral: true
            });
        }

        // Get all members with the role
        const members = guild.members.cache
            .filter(member => member.roles.cache.has(role.id))
            .map(member => member.toString());

        // Build the roster embed
        const embed = new EmbedBuilder()
            .setTitle(`${chosenKey} – Player Roster`)
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