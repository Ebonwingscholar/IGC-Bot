const { SlashCommandBuilder } = require('discord.js');
const { loadEvents, saveEvents } = require('../utils/eventStorage');
require('dotenv').config();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bookevent')
    .setDescription('Book a table for an existing event')
    .addStringOption(option =>
      option.setName('event').setDescription('Name of the event').setRequired(true).setAutocomplete(true))
    .addStringOption(option =>
      option.setName('players').setDescription('Player names / users').setRequired(true))
    .addStringOption(option =>
      option.setName('game').setDescription('Name of the game').setRequired(true)),

  async execute(interaction) {
    const eventName = interaction.options.getString('event').trim();
    const playerNames = interaction.options.getString('players').trim();
    const gameName = interaction.options.getString('game').trim();
    const username = interaction.user.tag;
    const userId = interaction.user.id;

    let displayName = username;
    try {
      const member = await interaction.guild.members.fetch(userId);
      if (member && member.displayName) displayName = member.displayName;
    } catch {}

    let events = loadEvents();
    const event = events.find(ev => ev.name.toLowerCase() === eventName.toLowerCase());

    if (!event) {
      await interaction.reply({ content: `Event "${eventName}" not found.`, ephemeral: true });
      return;
    }

    if (!Array.isArray(event.bookings)) event.bookings = [];

    if (event.bookings.some(b => b.userId === userId)) {
      await interaction.reply({ content: `You already have a booking for "${eventName}".`, ephemeral: true });
      return;
    }

    const maxLimit = event.maxTables || 15;
    if (event.bookings.length >= maxLimit) {
      await interaction.reply({ content: `Sorry, event "${eventName}" is fully booked (${maxLimit}/${maxLimit} tables).`, ephemeral: true });
      return;
    }

    event.bookings.push({
      userId,
      username,
      displayName,
      playerNames,
      gameName,
      paid: false,
      bookedAt: new Date().toISOString()
    });

    saveEvents(events);

    await interaction.reply(`✅ Booking confirmed for **${playerNames}** playing **${gameName}** at **${event.name}** (${event.date}).`);

    try {
      const reminderMessage = `
**Payment Reminder for Event Booking**
Event: **${event.name}** (${event.date})
Booking: ${playerNames} — Game: ${gameName}

Please pay your event fee before playing.
💳 **Bank Transfer Details**
• **Account Name:** ${process.env.BANK_ACCOUNT_NAME || 'Inverurie Gaming Club'}
• **Sort Code:** ${process.env.BANK_SORT_CODE || '12-34-56'}
• **Account Number:** ${process.env.BANK_ACCOUNT_NUMBER || '12345678'}

Reference: "D Smith ${event.date}"
      `;
      await interaction.user.send(reminderMessage);
    } catch (err) {
      console.error(`Could not send DM to ${username}:`, err);
    }
  },

  async autocomplete(interaction) {
    const focusedValue = (interaction.options.getFocused() || '').toLowerCase();
    const events = loadEvents();
    const filtered = (focusedValue
      ? events.filter(ev => ev.name.toLowerCase().includes(focusedValue))
      : events
    ).slice(0, 25);

    await interaction.respond(
      filtered.map(ev => ({ name: `${ev.name} (${ev.date})`, value: ev.name }))
    );
  }
};
