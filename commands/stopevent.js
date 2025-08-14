const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const eventStorage = require('../utils/eventStorage');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stopevent')
        .setDescription('Admin: Cancel (delete) an entire event')
        .addStringOption(option =>
            option.setName('eventname')
                .setDescription('Name of the event to cancel')
                .setRequired(true)
                .setAutocomplete(true)
        ),

    async execute(interaction) {
        // Check admin permission (you can customize this check as needed)
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
            return;
        }

        const eventName = interaction.options.getString('eventname');

        const event = eventStorage.getEventByName(eventName);
        if (!event) {
            await interaction.reply({ content: `Event "${eventName}" not found.`, ephemeral: true });
            return;
        }

        // Delete the event (and all bookings)
        const success = eventStorage.deleteEvent(eventName);

        if (success) {
            await interaction.reply({ content: `Event "${eventName}" has been cancelled and removed.`, ephemeral: true });
        } else {
            await interaction.reply({ content: `Failed to cancel event "${eventName}". Please try again.`, ephemeral: true });
        }
    },

    // Autocomplete handler for event names (optional, but recommended)
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        const events = eventStorage.getEvents();

        const filtered = events
            .map(e => e.name)
            .filter(name => name.toLowerCase().startsWith(focusedValue.toLowerCase()))
            .slice(0, 25);

        await interaction.respond(
            filtered.map(name => ({ name, value: name }))
        );
    }
};