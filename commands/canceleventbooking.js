const { SlashCommandBuilder } = require('discord.js');
const eventStorage = require('../utils/eventStorage');
const tableManager = require('../utils/tableManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('canceleventbooking')
        .setDescription('Cancel your booking for a specific event')
        .addStringOption(option =>
            option.setName('eventname')
                .setDescription('The name of the event')
                .setRequired(true)
                .setAutocomplete(true)),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        const events = eventStorage.getEvents();

        const filtered = events.filter(event =>
            event.name.toLowerCase().startsWith(focusedValue.toLowerCase())
        ).slice(0, 25);

        await interaction.respond(
            filtered.map(event => ({ name: event.name, value: event.name }))
        );
    },

    async execute(interaction) {
        const userId = interaction.user.id;
        const eventName = interaction.options.getString('eventname');

        // Validate event exists
        const event = eventStorage.getEventByName(eventName);
        if (!event) {
            await interaction.reply({ content: `Event "${eventName}" not found.`, ephemeral: true });
            return;
        }

        // Find the booking
        const booking = eventStorage.getBookingByUserAndEvent(userId, eventName);
        if (!booking) {
            await interaction.reply({ content: `You don't have a booking for the event "${eventName}".`, ephemeral: true });
            return;
        }

        // Remove booking from storage
        eventStorage.removeBooking(booking);

        // Also remove the reservation from tableManager
        tableManager.removeReservation(booking.tableNumber);

        await interaction.reply(`Your booking for the event "${eventName}" at table ${booking.tableNumber} has been cancelled.`);
    }
};