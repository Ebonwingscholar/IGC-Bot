const { SlashCommandBuilder } = require('discord.js');
const { loadEvents, saveEvents } = require('../utils/eventStorage');
require('dotenv').config(); // Ensure env vars are loaded

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bookevent')
    .setDescription('Book a table for an existing event')
    .addStringOption(option =>
      option.setName('event')
        .setDescription('Name of the event')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option.setName('players')
        .setDescription('Comma-separated list of player names (or @mention users)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('game')
        .setDescription('Name of the game being played')
        .setRequired(true)
    ),

  async execute(interaction) {
    const eventName = interaction.options.getString('event').trim();
    const playerNames = interaction.options.getString('players').trim();
    const gameName = interaction.options.getString('game').trim();
    const username = interaction.user.tag;
    const userId = interaction.user.id;

    // Fetch nickname/displayName
    let displayName = username;
    try {
      const member = await interaction.guild.members.fetch(userId);
      if (member && member.displayName) {
        displayName = member.displayName;
      }
    } catch {
      displayName = username; // fallback
    }

    let events = loadEvents();
    const event = events.find(ev => ev.name.toLowerCase() === eventName.toLowerCase());

    if (!event) {
      await interaction.reply({ content: `Event "${eventName}" not found.`, ephemeral: true });
      return;
    }

    // Ensure bookings array exists
    if (!Array.isArray(event.bookings)) {
      event.bookings = [];
    }

    // Prevent double-booking
    if (event.bookings.some(b => b.userId === userId)) {
      await interaction.reply({ content: `You already have a booking for "${eventName}".`, ephemeral: true });
      return;
    }

    // Add booking
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

    // Send confirmation
    await interaction.reply(`✅ Booking confirmed for **${playerNames}** playing **${gameName}** at event **${event.name}** on ${event.date}.`);

    // Send DM about payment (same style as reserve.js)
    try {
      const accountName = process.env.BANK_ACCOUNT_NAME || 'Account name not set';
      const sortCode = process.env.BANK_SORT_CODE || 'Sort code not set';
      const accountNumber = process.env.BANK_ACCOUNT_NUMBER || 'Account number not set';

      const reminderMessage = `
**Payment Reminder for Event Booking**

Event: **${event.name}** (${event.date})
Booking: ${playerNames} — Game: ${gameName}

Please pay your event fee **before the event**. This helps support the club.

💳 **Bank Transfer Details**
• **Account Name:** ${accountName}
• **Sort Code:** ${sortCode}
• **Account Number:** ${accountNumber}

Please add your name and the event date to the payment reference.  
For example: "D Smith ${event.date}"

Thank you for supporting the club!
      `;

      await interaction.user.send(reminderMessage);
    } catch (err) {
      console.error(`Could not send DM to ${username}:`, err);
    }
  },

  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    const events = loadEvents();

    let filtered;

    if (!focusedValue) {
      // Show all events if user hasn't typed yet
      filtered = events;
    } else {
      // Filter based on user input
      filtered = events.filter(ev => ev.name.toLowerCase().includes(focusedValue));
    }

    // Limit to 25 results
    filtered = filtered.slice(0, 25);

    await interaction.respond(
      filtered.map(ev => ({
        name: `${ev.name} (${ev.date})`,
        value: ev.name
      }))
    );
  }
};