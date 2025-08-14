const { SlashCommandBuilder } = require('discord.js');
const { loadEvents, saveEvents } = require('../utils/eventStorage');

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
      // Fallback if not in guild or error occurs
      displayName = username;
    }

    let events = loadEvents();
    const event = events.find(ev => ev.name.toLowerCase() === eventName.toLowerCase());

    if (!event) {
      await interaction.reply({ content: `Event "${eventName}" not found.`, ephemeral: true });
      return;
    }

    // ✅ Ensure bookings array exists
    if (!Array.isArray(event.bookings)) {
      event.bookings = [];
    }

    // Prevent double-booking by same user
    if (event.bookings.some(b => b.userId === userId)) {
      await interaction.reply({ content: `You already have a booking for "${eventName}".`, ephemeral: true });
      return;
    }

    // Add booking with displayName
    event.bookings.push({
      userId,
      username,
      displayName, // ✅ Store nickname
      playerNames,
      gameName,
      paid: false,
      bookedAt: new Date().toISOString()
    });

    saveEvents(events);

    // Send confirmation
    await interaction.reply(`✅ Booking confirmed for **${playerNames}** playing **${gameName}** at event **${event.name}**