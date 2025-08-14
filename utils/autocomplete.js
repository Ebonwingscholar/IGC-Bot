// utils/eventAutocomplete.js
const eventStorage = require('./eventStorage');

module.exports = async function eventAutocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    const events = eventStorage.getEvents();

    const filtered = events
        .map(e => e.name)
        .filter(name => name.toLowerCase().includes(focusedValue.toLowerCase()))
        .slice(0, 25);

    await interaction.respond(
        filtered.map(name => ({ name, value: name }))
    );
};