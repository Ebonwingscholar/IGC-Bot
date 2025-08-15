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
        // Check admin permission
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

    // Improved autocomplete handler
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const events = eventStorage.getEvents();

        let filtered;

        if (!focusedValue) {
            // Show all events if nothing typed
            filtered = events.map(e => e.name);
        } else {
            // Filter matching events
            filtered = events
                .map(e => e.name)
                .filter(name => name.toLowerCase().includes(focusedValue));
        }

        filtered = filtered.slice(0, 25); // Limit results

        await interaction.respond(
            filtered.map(name => ({ name, value: name }))
        );
    }
};