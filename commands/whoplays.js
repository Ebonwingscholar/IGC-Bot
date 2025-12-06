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
    { label: 'KillTeam', value: 'KillTeam' },
    { label: 'All Other Games', value: 'AllOtherGames' }
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('whoplays')
        .setDescription('Show who is interested in a specific game'),

    async execute(interaction) {
        // Create the selection menu
        const menu = new StringSelectMenuBuilder()
            .setCustomId('whoplays-game-select') // ✅ Unique customId
            .setPlaceholder('Select a game roster to view')
            .addOptions(GAME_ROLES_MENU);

        const row = new ActionRowBuilder().addComponents(menu);

        await interaction.reply({
            content: 'Choose a game to view its player roster:',
            components: [row],
        });
    },

    // Handle the dropdown selection
    async select(interaction) {
        if (interaction.customId !== 'whoplays-game-select') return;

        // Defer reply to avoid interaction timeout
        await interaction.deferReply();

        const chosenKey = interaction.values[0];
        const guild = interaction.guild;

        const roleId = GAME_ROLE_IDS[chosenKey];
        const role = guild.roles.cache.get(roleId);

        if (!role) {
            return interaction.editReply({
                content: `The role **${chosenKey}** was not found on this server.`
            });
        }

        // Fetch all members to include offline members
        await guild.members.fetch();

        // Get all members with the role, fallback to username if displayName missing
        const members = guild.members.cache
            .filter(member => member.roles.cache.has(role.id))
            .map(member => member.displayName || member.user.username)
            .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

        const embed = new EmbedBuilder()
            .setTitle(`${chosenKey} – Player Roster`)
            .setColor(0x5865F2) // Discord Blurple
            .setDescription(
                members.length > 0
                    ? members.join('\n')
                    : '*No players currently have this role.*'
            )
            .setFooter({ text: `Total players: ${members.length}` });

        await interaction.editReply({ embeds: [embed] });
    }
};