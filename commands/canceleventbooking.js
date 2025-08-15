const { SlashCommandBuilder } = require('discord.js');
const { loadEvents } = require('../utils/eventStorage');
const tableManager = require('../utils/tableManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('canceleventbooking')
        .setDescription('Cancel your booking for a specific event')
        .addStringOption(option =>
            option.setName('eventname')
                .setDescription('The name of the event')
                .setRequired(true)
                .setAutocomplete(true)
        ),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const events = loadEvents(); // ✅ Pull events from the JSON file

        let filtered;

        if (!focusedValue) {
            // Show all events if nothing typed
            filtered = events;
        } else {
            // Match anywhere in the name
            filtered = events.filter(e =>
                e.name.toLowerCase().includes(focusedValue)
            );
        }

        await interaction.respond(
            filtered.slice(0, 25).map(e => ({
                name: `${e.name} (${e.date})`,
                value: e.name
            }))
        );
    },

    async execute(interaction) {
        const { getEventByName, getBookingByUserAndEvent, removeBooking } = require('../utils/eventStorage');

        const userId = interaction.user.id;
        const eventName = interaction.options.getString('eventname');

        // Validate event exists
        const event = getEventByName(eventName);
        if (!event) {
            await interaction.reply({ content: `Event "${eventName}" not found.`, ephemeral: true });
            return;
        }

        // Find the booking
        const booking = getBookingByUserAndEvent(userId, eventName);
        if (!booking) {
            await interaction.reply({ content: `You don't have a booking for the event "${eventName}".`, ephemeral: true });
            return;
        }

        // Remove booking from storage
        removeBooking(booking);

        // Also remove the reservation from tableManager
        if (booking.tableNumber) {
            tableManager.removeReservation(booking.tableNumber);
        }

        await interaction.reply(`Your booking for the event "${eventName}" has been cancelled.`);
    }
};